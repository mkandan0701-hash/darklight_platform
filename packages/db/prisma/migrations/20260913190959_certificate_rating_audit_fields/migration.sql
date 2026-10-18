-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "eventDateUtc" TIMESTAMP(3),
ADD COLUMN     "eventName" TEXT,
ADD COLUMN     "eventResult" TEXT,
ADD COLUMN     "issuedByUserId" TEXT;

-- AlterTable
ALTER TABLE "RatingRecord" ADD COLUMN     "recordedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "RatingRecord" ADD CONSTRAINT "RatingRecord_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

