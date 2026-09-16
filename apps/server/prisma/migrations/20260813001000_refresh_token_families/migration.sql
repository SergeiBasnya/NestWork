ALTER TABLE "RefreshToken" ADD COLUMN "familyId" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "parentJti" TEXT;

-- Every legacy token starts as its own family. New rotations inherit familyId.
UPDATE "RefreshToken" SET "familyId" = "jti" WHERE "familyId" IS NULL;
-- Keep this nullable for the expand phase: rolling back to the previous server
-- must still be able to insert refresh tokens. A later contract migration may
-- add NOT NULL once the old release can no longer run.
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
