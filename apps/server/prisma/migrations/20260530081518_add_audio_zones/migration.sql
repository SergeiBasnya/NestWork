-- CreateTable
CREATE TABLE "AudioZone" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "w" INTEGER NOT NULL,
    "h" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AudioZone_workspaceId_idx" ON "AudioZone"("workspaceId");

-- AddForeignKey
ALTER TABLE "AudioZone" ADD CONSTRAINT "AudioZone_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
