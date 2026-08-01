-- AlterTable
ALTER TABLE "PuzzleAttempt" ADD COLUMN     "assignmentId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "PuzzleAttempt_assignmentId_studentId_idx" ON "PuzzleAttempt"("assignmentId", "studentId");

-- AddForeignKey
ALTER TABLE "PuzzleAttempt" ADD CONSTRAINT "PuzzleAttempt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
