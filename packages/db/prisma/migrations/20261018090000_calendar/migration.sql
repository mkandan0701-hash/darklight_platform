-- CreateEnum
CREATE TYPE "LiveSessionChangeKind" AS ENUM ('CREATED', 'RESCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalendarBlockKind" AS ENUM ('HOLIDAY', 'UNAVAILABLE', 'OTHER');

-- AlterTable
ALTER TABLE "ClassroomScheduleSlot" ADD COLUMN     "startsOn" TEXT;

-- AlterTable
ALTER TABLE "LiveSession" ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "LiveSessionChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "kind" "LiveSessionChangeKind" NOT NULL,
    "changedByUserId" TEXT,
    "previousStartUtc" TIMESTAMP(3),
    "previousDurationMins" INTEGER,
    "newStartUtc" TIMESTAMP(3),
    "newDurationMins" INTEGER,
    "conflictOverride" BOOLEAN NOT NULL DEFAULT false,
    "conflictSummary" TEXT,
    "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveSessionChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarBlock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "CalendarBlockKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAtUtc" TIMESTAMP(3) NOT NULL,
    "endsAtUtc" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "coachId" TEXT,
    "staffOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CalendarBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveSessionChange_tenantId_idx" ON "LiveSessionChange"("tenantId");

-- CreateIndex
CREATE INDEX "LiveSessionChange_liveSessionId_idx" ON "LiveSessionChange"("liveSessionId");

-- CreateIndex
CREATE INDEX "CalendarBlock_tenantId_startsAtUtc_idx" ON "CalendarBlock"("tenantId", "startsAtUtc");

-- CreateIndex
CREATE INDEX "CalendarBlock_coachId_idx" ON "CalendarBlock"("coachId");

-- CreateIndex
CREATE INDEX "LiveSession_tenantId_scheduledAtUtc_idx" ON "LiveSession"("tenantId", "scheduledAtUtc");

-- CreateIndex
CREATE INDEX "LiveSession_seriesId_idx" ON "LiveSession"("seriesId");

-- CreateIndex
CREATE INDEX "Assignment_tenantId_dueAtUtc_idx" ON "Assignment"("tenantId", "dueAtUtc");

-- AddForeignKey
ALTER TABLE "LiveSessionChange" ADD CONSTRAINT "LiveSessionChange_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSessionChange" ADD CONSTRAINT "LiveSessionChange_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Prisma has no syntax for CHECK constraints; hand-added. A block that ends
-- at or before it starts renders as nothing and blocks nothing in conflict
-- checks, so it is refused at the database as well as in the action.
ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_ends_after_starts" CHECK ("endsAtUtc" > "startsAtUtc");

-- Only the rows this migration creates are constrained. LiveSession.durationMins
-- is deliberately left alone: existing rows predate any validation, and a
-- constraint that fails on deploy against production data is worse than none.
ALTER TABLE "LiveSessionChange" ADD CONSTRAINT "LiveSessionChange_positive_duration" CHECK ("newDurationMins" IS NULL OR "newDurationMins" > 0);
