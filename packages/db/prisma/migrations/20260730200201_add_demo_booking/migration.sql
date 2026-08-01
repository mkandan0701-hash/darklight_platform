-- CreateTable
CREATE TABLE "DemoBooking" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "academyName" TEXT,
    "studentCount" TEXT,
    "notes" TEXT,
    "slotAtUtc" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactedAt" TIMESTAMP(3),

    CONSTRAINT "DemoBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoBooking_slotAtUtc_idx" ON "DemoBooking"("slotAtUtc");

-- CreateIndex
CREATE INDEX "DemoBooking_email_idx" ON "DemoBooking"("email");
