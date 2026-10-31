import { Worker } from "bullmq";
import { prismaBase, runWithTenant } from "@chessplay-clone/db";
import { connection } from "../queues";
import {
  listActiveScheduleSlotsForTenant,
  materializeSlot,
} from "../repositories/scheduleSlotRepository";

// Nightly sweep: for every tenant, materialize any missing upcoming
// LiveSession rows for each of its active ClassroomScheduleSlot templates.
// Safe to run repeatedly — materializeSlot relies on
// @@unique([scheduleSlotId, occurrenceDate]) + skipDuplicates, so a re-run
// (or overlap with the immediate top-up on slot creation) is a no-op rather
// than a pile of duplicate classes.
async function sweepAllTenants() {
  // prismaBase.tenant.findMany is the sanctioned untenanted read (Tenant is
  // exempt from tenant scoping by definition — see packages/db/src/index.ts).
  // Everything downstream of it runs inside runWithTenant so tenantScope
  // still verifies every scoped query against the tenant being swept.
  const tenants = await prismaBase.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  let materialized = 0;
  for (const tenant of tenants) {
    await runWithTenant(tenant.id, async () => {
      const slots = await listActiveScheduleSlotsForTenant(tenant.id);
      for (const slot of slots) {
        const result = await materializeSlot(tenant.id, slot);
        materialized += result.count;
      }
    });
  }
  return { tenantsSwept: tenants.length, sessionsMaterialized: materialized };
}

export function createClassroomScheduleMaterializeWorker(): Worker {
  return new Worker("classroom-schedule-materialize", () => sweepAllTenants(), {
    connection,
  });
}
