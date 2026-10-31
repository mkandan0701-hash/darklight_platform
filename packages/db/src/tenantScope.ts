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
//   - No context set: in strict mode (requireTenantContext(true) — the API
//     server and worker turn it on at startup, apps/web when
//     TENANT_SCOPE_STRICT=1) the call is refused outright. Otherwise it falls
//     back to a presence-only check, for scripts and any web path not yet
//     shown to run inside a session.
//
// Nested relation writes (e.g. `classroom.create({ data: { coaches: {
// create: [...] } } })`, or a `connect` by id) are refused whenever the
// related model is tenant-scoped. Prisma's `query` hook only fires for the
// top-level model of a call, so nothing could check the nested row's
// tenantId — and a `connect` can name another academy's row. Write the
// related row with its own call instead.

import { getAmbientTenantId } from "./context";

/** model name → relation field name → related model name, from Prisma's DMMF. */
export type RelationMap = Record<string, Record<string, string>>;

let contextRequired = false;

/**
 * Strict mode: a query against a tenant-scoped model with no ambient tenant
 * (runWithTenant / getCurrentSession) is refused instead of falling back to
 * the presence-only check. Process-wide; call once at startup.
 */
export function requireTenantContext(required: boolean): void {
  contextRequired = required;
}

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
  "PgnFolder",
  "PgnFile",
  "CalendarBlock",
  "LiveSessionChange",
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
  "aggregate",
  "groupBy",
  "upsert", // upsert's `where` needs the same guard as update/delete
]);

// Operations whose payload can carry nested relation writes. createMany and
// updateMany take scalars only.
const NESTED_WRITE_OPERATIONS = new Set(["create", "update", "upsert"]);

// Any object on a relation field in a write payload is a nested write: create,
// connect, connectOrCreate, upsert, set, disconnect, delete... Prisma accepts
// nothing else there, so no list of keys is needed.
function findNestedScopedWrite(
  model: string,
  data: unknown,
  relations: RelationMap
): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const fields = relations[model] ?? {};
  for (const [field, value] of Object.entries(data as Record<string, unknown>)) {
    const target = fields[field];
    if (target && TENANT_SCOPED_MODELS.has(target) && value !== null && typeof value === "object") {
      return `${model}.${field}`;
    }
  }
  return undefined;
}

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

export function tenantScopeExtension(options: { relations?: RelationMap } = {}) {
  const relations = options.relations ?? {};
  return {
    name: "tenantScope",
    query: {
      $allModels: {
        // Loosely typed on purpose: Prisma's generated per-model/per-operation
        // arg types don't unify across `$allOperations`, and this guard only
        // needs to read `args.where`/`args.data` at runtime, not narrow it.
        async $allOperations(params: any) {
          const { model, operation, args, query } = params;

          // Checked for every model, scoped or not: `tenant.create({ data:
          // { users: { create } } })` reaches a scoped table through an
          // exempt one.
          if (NESTED_WRITE_OPERATIONS.has(operation)) {
            const payloads = operation === "upsert" ? [args?.create, args?.update] : [args?.data];
            for (const payload of payloads) {
              const nested = findNestedScopedWrite(model, payload, relations);
              if (nested) {
                throw new Error(
                  `Refusing to run ${model}.${operation}: nested write through ${nested}. ` +
                    `tenantScope can't check a nested row's tenant — write it with its own call.`
                );
              }
            }
          }

          if (!TENANT_SCOPED_MODELS.has(model)) return query(args);

          const ambientTenantId = getAmbientTenantId();
          if (!ambientTenantId && contextRequired) {
            throw new Error(
              `Refusing to run ${model}.${operation} outside a tenant context. ` +
                `Wrap the unit of work in runWithTenant(), or resolve the session first.`
            );
          }

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
