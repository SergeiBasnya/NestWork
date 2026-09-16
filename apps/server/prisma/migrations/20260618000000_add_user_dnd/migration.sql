-- "Ne pas déranger" / bureau verrouillé : coupe la visio de proximité tant que c'est actif.
ALTER TABLE "User" ADD COLUMN "dnd" BOOLEAN NOT NULL DEFAULT false;
