-- Scope legacy 1:1 DM keys to their workspace before new application code uses
-- the same format. Additive data rewrite; the existing unique index remains valid.
UPDATE "Channel"
SET "dmKey" = "workspaceId" || '|' || "dmKey"
WHERE "dmKey" IS NOT NULL
  AND LEFT("dmKey", LENGTH("workspaceId") + 1) <> "workspaceId" || '|';

-- Rolling-deploy compatibility: an older server still writes `userA|userB`.
-- Normalize those writes in PostgreSQL until every running instance uses the
-- workspace-scoped format. A later contract migration may remove this trigger.
CREATE OR REPLACE FUNCTION scope_channel_dm_key()
RETURNS trigger AS $$
BEGIN
  IF NEW."dmKey" IS NOT NULL
     AND LEFT(NEW."dmKey", LENGTH(NEW."workspaceId") + 1) <> NEW."workspaceId" || '|'
  THEN
    NEW."dmKey" := NEW."workspaceId" || '|' || NEW."dmKey";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Channel_scope_dm_key"
BEFORE INSERT OR UPDATE OF "dmKey", "workspaceId" ON "Channel"
FOR EACH ROW EXECUTE FUNCTION scope_channel_dm_key();
