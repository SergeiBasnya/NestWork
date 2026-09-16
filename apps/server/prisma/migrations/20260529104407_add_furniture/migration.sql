-- CreateTable
CREATE TABLE "Furniture" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "placedBy" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "col" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "w" INTEGER NOT NULL DEFAULT 1,
    "h" INTEGER NOT NULL DEFAULT 1,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Furniture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Furniture_roomId_idx" ON "Furniture"("roomId");

-- AddForeignKey
ALTER TABLE "Furniture" ADD CONSTRAINT "Furniture_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
