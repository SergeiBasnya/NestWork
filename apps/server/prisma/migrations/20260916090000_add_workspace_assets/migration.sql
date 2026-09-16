-- CreateEnum
CREATE TYPE "WorkspaceAssetSource" AS ENUM ('CUSTOM', 'MODERN_INTERIORS');

-- CreateEnum
CREATE TYPE "WorkspaceAssetKind" AS ENUM ('OBJECT', 'SHEET');

-- CreateTable
CREATE TABLE "WorkspaceAsset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "WorkspaceAssetSource" NOT NULL,
    "kind" "WorkspaceAssetKind" NOT NULL,
    "cols" INTEGER NOT NULL,
    "rows" INTEGER NOT NULL,
    "depth" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "licenseConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceAsset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkspaceAsset_grid_check" CHECK ("cols" BETWEEN 1 AND 128 AND "rows" BETWEEN 1 AND 128),
    CONSTRAINT "WorkspaceAsset_depth_check" CHECK ("depth" >= 1 AND "depth" <= 50)
);

-- CreateIndex
CREATE INDEX "WorkspaceAsset_workspaceId_createdAt_idx" ON "WorkspaceAsset"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceAsset_imageId_idx" ON "WorkspaceAsset"("imageId");

-- AddForeignKey
ALTER TABLE "WorkspaceAsset" ADD CONSTRAINT "WorkspaceAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceAsset" ADD CONSTRAINT "WorkspaceAsset_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
