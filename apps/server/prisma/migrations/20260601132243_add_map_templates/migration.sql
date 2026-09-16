-- CreateTable
CREATE TABLE "MapTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'user',
    "preview" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MapTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapTemplate_workspaceId_idx" ON "MapTemplate"("workspaceId");

-- AddForeignKey
ALTER TABLE "MapTemplate" ADD CONSTRAINT "MapTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
