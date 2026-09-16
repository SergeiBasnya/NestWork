-- AlterTable: per-member claimed desk (spawn position). Nullable, additive.
ALTER TABLE "WorkspaceMember" ADD COLUMN     "deskX" INTEGER,
ADD COLUMN     "deskY" INTEGER;
