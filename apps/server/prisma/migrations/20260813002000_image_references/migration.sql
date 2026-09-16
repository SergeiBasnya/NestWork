-- Expand-only migration: legacy URL columns remain authoritative for API
-- compatibility while nullable foreign keys make blob lifecycle safe.
ALTER TABLE "Message" ADD COLUMN "imageId" TEXT;
ALTER TABLE "MapTemplate" ADD COLUMN "previewImageId" TEXT;

-- Backfill only URLs minted by this application and still present in Image.
UPDATE "Message" AS m
SET "imageId" = substring(m."imageUrl" from '^/api/images/([A-Za-z0-9_-]{16,64})$')
WHERE m."imageUrl" ~ '^/api/images/[A-Za-z0-9_-]{16,64}$'
  AND EXISTS (
    SELECT 1 FROM "Image" AS i
    WHERE i."id" = substring(m."imageUrl" from '^/api/images/([A-Za-z0-9_-]{16,64})$')
  );

UPDATE "MapTemplate" AS t
SET "previewImageId" = substring(t."preview" from '^/api/images/([A-Za-z0-9_-]{16,64})$')
WHERE t."preview" ~ '^/api/images/[A-Za-z0-9_-]{16,64}$'
  AND EXISTS (
    SELECT 1 FROM "Image" AS i
    WHERE i."id" = substring(t."preview" from '^/api/images/([A-Za-z0-9_-]{16,64})$')
  );

CREATE INDEX "Message_imageId_idx" ON "Message"("imageId");
CREATE INDEX "MapTemplate_previewImageId_idx" ON "MapTemplate"("previewImageId");

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_imageId_fkey"
  FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MapTemplate"
  ADD CONSTRAINT "MapTemplate_previewImageId_fkey"
  FOREIGN KEY ("previewImageId") REFERENCES "Image"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
