-- CreateEnum
CREATE TYPE "PuzzleSource" AS ENUM ('LICHESS', 'UPLOAD');

-- AlterTable
ALTER TABLE "Puzzle" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "source" "PuzzleSource" NOT NULL DEFAULT 'LICHESS',
ADD COLUMN     "tenantId" TEXT,
ADD COLUMN     "uploadedByUserId" TEXT,
ALTER COLUMN "lichessId" DROP NOT NULL,
ALTER COLUMN "rating" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Puzzle_tenantId_idx" ON "Puzzle"("tenantId");

-- AddForeignKey
ALTER TABLE "Puzzle" ADD CONSTRAINT "Puzzle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
