-- Add furniture orientation: 90° rotation steps + horizontal flip.
ALTER TABLE "Furniture" ADD COLUMN "rotation" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Furniture" ADD COLUMN "flip" BOOLEAN NOT NULL DEFAULT false;
