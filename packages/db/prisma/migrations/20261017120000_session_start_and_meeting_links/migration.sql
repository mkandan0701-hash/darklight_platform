-- AlterTable
ALTER TABLE "Classroom" ADD COLUMN     "meetingUrl" TEXT;

-- AlterTable
ALTER TABLE "LiveSession" ADD COLUMN     "meetingUrl" TEXT,
ADD COLUMN     "startedAtUtc" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
