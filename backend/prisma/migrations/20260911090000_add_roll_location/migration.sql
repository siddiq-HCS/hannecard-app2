-- CreateEnum
CREATE TYPE "RollLocation" AS ENUM ('AT_FACTORY', 'AT_CUSTOMER', 'NOT_SPECIFIED');

-- AlterTable
ALTER TABLE "rfqs" ADD COLUMN "rollLocation" "RollLocation" NOT NULL DEFAULT 'NOT_SPECIFIED';