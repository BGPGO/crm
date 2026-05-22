-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "erpCliente" TEXT;
ALTER TABLE "Contract" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
