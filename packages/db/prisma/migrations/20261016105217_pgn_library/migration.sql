-- CreateTable
CREATE TABLE "PgnFolder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PgnFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PgnFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "gameCount" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PgnFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PgnFolder_tenantId_idx" ON "PgnFolder"("tenantId");

-- CreateIndex
CREATE INDEX "PgnFolder_parentId_idx" ON "PgnFolder"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "PgnFolder_tenantId_parentId_name_key" ON "PgnFolder"("tenantId", "parentId", "name");

-- CreateIndex
CREATE INDEX "PgnFile_tenantId_idx" ON "PgnFile"("tenantId");

-- CreateIndex
CREATE INDEX "PgnFile_folderId_idx" ON "PgnFile"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "PgnFile_tenantId_folderId_name_key" ON "PgnFile"("tenantId", "folderId", "name");

-- AddForeignKey
ALTER TABLE "PgnFolder" ADD CONSTRAINT "PgnFolder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PgnFolder" ADD CONSTRAINT "PgnFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PgnFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PgnFolder" ADD CONSTRAINT "PgnFolder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PgnFile" ADD CONSTRAINT "PgnFile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PgnFile" ADD CONSTRAINT "PgnFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "PgnFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PgnFile" ADD CONSTRAINT "PgnFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

