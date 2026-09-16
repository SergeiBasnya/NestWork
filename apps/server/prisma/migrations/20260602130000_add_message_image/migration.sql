-- AlterTable: optional inline image (base64 data URL) on a chat message. Additive, nullable.
ALTER TABLE "Message" ADD COLUMN     "imageUrl" TEXT;
