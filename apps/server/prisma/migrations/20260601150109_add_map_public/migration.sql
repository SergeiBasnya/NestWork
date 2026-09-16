-- AlterTable
ALTER TABLE "MapTemplate" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "MapTemplate_isPublic_idx" ON "MapTemplate"("isPublic");
