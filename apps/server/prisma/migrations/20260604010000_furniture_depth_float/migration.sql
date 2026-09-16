-- Stacking depth becomes fractional so "premier plan" / "arrière-plan" can give
-- each piece a unique plane (no ties → the order can't flip on its own).
ALTER TABLE "Furniture" ALTER COLUMN "depth" SET DATA TYPE DOUBLE PRECISION;
