-- CreateEnum
CREATE TYPE "XpEventKind" AS ENUM ('PUZZLE_SOLVED', 'SESSION_ATTENDED');

-- CreateTable
CREATE TABLE "XpEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "XpEventKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "sourceId" TEXT NOT NULL,
    "awardedAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentBadge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "earnedAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "XpEvent_tenantId_idx" ON "XpEvent"("tenantId");

-- CreateIndex
CREATE INDEX "XpEvent_studentId_idx" ON "XpEvent"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "XpEvent_studentId_kind_sourceId_key" ON "XpEvent"("studentId", "kind", "sourceId");

-- CreateIndex
CREATE INDEX "StudentBadge_tenantId_idx" ON "StudentBadge"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentBadge_studentId_code_key" ON "StudentBadge"("studentId", "code");

-- AddForeignKey
ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBadge" ADD CONSTRAINT "StudentBadge_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

