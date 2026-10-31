-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "LiveSession" ADD COLUMN     "occurrenceDate" TEXT,
ADD COLUMN     "scheduleSlotId" TEXT;

-- CreateTable
CREATE TABLE "ClassroomScheduleSlot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "localTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "durationMins" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClassroomScheduleSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassroomScheduleSlot_tenantId_idx" ON "ClassroomScheduleSlot"("tenantId");

-- CreateIndex
CREATE INDEX "ClassroomScheduleSlot_classroomId_idx" ON "ClassroomScheduleSlot"("classroomId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_scheduleSlotId_occurrenceDate_key" ON "LiveSession"("scheduleSlotId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "ClassroomScheduleSlot" ADD CONSTRAINT "ClassroomScheduleSlot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomScheduleSlot" ADD CONSTRAINT "ClassroomScheduleSlot_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_scheduleSlotId_fkey" FOREIGN KEY ("scheduleSlotId") REFERENCES "ClassroomScheduleSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

