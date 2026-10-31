// Prisma Client extension that guards every query against a tenant-scoped
// model. This is the enforcement mechanism referenced in
// chessplay-clone-spec.md §1.6 — a missing (or wrong) filter should fail
// loudly, not leak cross-tenant data.
//
// Two modes, depending on whether an ambient tenant context is set (see
// ./context.ts, bound via runWithTenant()/enterTenantContext() at request
// boundaries — apps/web/lib/auth/session.ts, apps/api's socket handlers and
// webhook handlers):
//   - Context set: every tenantId found in where/data must equal the
//     ambient tenant, or the call is refused. This catches both an omitted
//     filter AND a wrong one (e.g. a value sourced from untrusted input).
//   - No context set: falls back to a presence-only check (today's
//     behavior) — doesn't break call sites not yet wired to set context
//     (e.g. future seed/one-off scripts). A later hardening pass can make
//     context mandatory once every call site sets it; not done now.
//
// Known gap, left as-is: nested relation writes (e.g.
// `classroom.create({ data: { coaches: { create: [...] } } })`) aren't
// separately checked — Prisma's extension `query` hook only fires for the
// top-level model/operation of a call, not writes nested inside it.
// Repositories must keep setting tenantId explicitly on nested creates.

import { getAmbientTenantId } from "./context";

const TENANT_SCOPED_MODELS = new Set([
  "User",
  "CoachProfile",
  "StudentProfile",
  "ParentProfile",
  "ParentStudent",
  "Classroom",
  "ClassroomCoach",
  "ClassroomStudent",
  "ClassroomScheduleSlot",
  "LiveSession",
  "ReferenceBoard",
  "AttendanceRecord",
  "Assignment",
  "AssignmentPuzzle",
  "PuzzleAttempt",
  "Game",
  "GameAnalysis",
  "Invoice",
  "Tournament",
  "TournamentParticipant",
  "TournamentPairing",
  "Simul",
  "SimulBoard",
  "RatingRecord",
  "Certificate",
  "XpEvent",
  "StudentBadge",
]);

const WHERE_SCOPED_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "upsert", // upsert's `where` needs the same guard as update/delete
]);

// create's (and upsert's create-branch) tenantId lives in `data`, not `where`.
const CREATE_DATA_OPERATIONS = new Set(["create", "upsert"]);

function findTenantIdCandidates(where: unknown): unknown[] {
  if (!where || typeof where !== "object") return [];
  const w = where as Record<string, unknown>;
  const candidates: unknown[] = [];
  if ("tenantId" in w) candidates.push(w.tenantId);
  // Allow `where: { AND: [...] }` / `{ OR: [...] }` compositions that include tenantId.
  for (const key of ["AND", "OR"] as const) {
    const clause = w[key];
    if (Array.isArray(clause)) {
      for (const c of clause) candidates.push(...findTenantIdCandidates(c));
    }
  }
  return candidates;
}

function hasTenantFilter(where: unknown): boolean {
  return findTenantIdCandidates(where).length > 0;
}

// Every tenantId mention found anywhere in where (including nested in
// AND/OR) must equal the ambient tenant. Stricter than presence-only — e.g.
// `{ OR: [{ tenantId: mine }, { tenantId: theirs }] }` correctly fails.
function whereMatchesTenant(where: unknown, tenantId: string): boolean {
  const candidates = findTenantIdCandidates(where);
  return candidates.length > 0 && candidates.every((c) => c === tenantId);
}

function extractDataTenantId(data: unknown): unknown {
  if (!data || typeof data !== "object") return undefined;
  return (data as Record<string, unknown>).tenantId;
}

export function tenantScopeExtension() {
  return {
    name: "tenantScope",
    query: {
      $allModels: {
        // Loosely typed on purpose: Prisma's generated per-model/per-operation
        // arg types don't unify across `$allOperations`, and this guard only
        // needs to read `args.where`/`args.data` at runtime, not narrow it.
        async $allOperations(params: any) {
          const { model, operation, args, query } = params;
          if (!TENANT_SCOPED_MODELS.has(model)) return query(args);

          const ambientTenantId = getAmbientTenantId();

          if (WHERE_SCOPED_OPERATIONS.has(operation)) {
            const where = args?.where;
            if (ambientTenantId) {
              if (!whereMatchesTenant(where, ambientTenantId)) {
                throw new Error(
                  `Refusing to run ${model}.${operation}: where.tenantId must equal ` +
                    `the ambient tenant ("${ambientTenantId}"). ` +
                    `Found: ${JSON.stringify(findTenantIdCandidates(where))}.`
                );
              }
            } else if (!hasTenantFilter(where)) {
              throw new Error(
                `Refusing to run ${model}.${operation} without a tenantId filter. ` +
                  `Every query against a tenant-scoped model must filter by tenantId.`
              );
            }
          }

          if (CREATE_DATA_OPERATIONS.has(operation)) {
            // upsert's create-path payload lives at args.create, not args.data.
            const data = operation === "upsert" ? args?.create : args?.data;
            const dataTenantId = extractDataTenantId(data);
            if (ambientTenantId) {
              if (dataTenantId !== ambientTenantId) {
                throw new Error(
                  `Refusing to run ${model}.${operation}: data.tenantId must equal ` +
                    `the ambient tenant ("${ambientTenantId}"). Got: ${JSON.stringify(dataTenantId)}.`
                );
              }
            } else if (typeof dataTenantId !== "string" || dataTenantId === "") {
              throw new Error(
                `Refusing to run ${model}.${operation} without data.tenantId. ` +
                  `Every write to a tenant-scoped model must set tenantId.`
              );
            }
          }

          // createManyAndReturn (Prisma 5.14+) takes the same payload; without
          // it here a bulk insert that also returns rows skipped the guard.
          if (operation === "createMany" || operation === "createManyAndReturn") {
            const items = Array.isArray(args?.data) ? args.data : [args?.data];
            for (const item of items) {
              const dataTenantId = extractDataTenantId(item);
              if (ambientTenantId) {
                if (dataTenantId !== ambientTenantId) {
                  throw new Error(
                    `Refusing to run ${model}.createMany: every item's tenantId must ` +
                      `equal the ambient tenant ("${ambientTenantId}"). Got: ${JSON.stringify(dataTenantId)}.`
                  );
                }
              } else if (typeof dataTenantId !== "string" || dataTenantId === "") {
                throw new Error(
                  `Refusing to run ${model}.createMany without tenantId set on every item.`
                );
              }
            }
          }

          return query(args);
        },
      },
    },
  };
}
