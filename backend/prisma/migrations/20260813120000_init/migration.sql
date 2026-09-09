-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SALES_MANAGER', 'REPRESENTATIVE');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('NEW_MANUFACTURE', 'RECOATING', 'REPAIR_GRINDING', 'CHROME_PLATING');

-- CreateEnum
CREATE TYPE "CoatingMaterial" AS ENUM ('NATURAL_RUBBER', 'POLYURETHANE', 'SILICONE', 'CHROME', 'CERAMIC');

-- CreateEnum
CREATE TYPE "GroovingType" AS ENUM ('SMOOTH', 'AXIAL', 'SPIRAL', 'CROWNED', 'HELIBONE');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONVERTED_TO_WORK_ORDER');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncEntityType" AS ENUM ('CLIENT', 'ROLLER_SPEC', 'QUOTATION', 'VISIT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'REPRESENTATIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fcmToken" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "taxNumber" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "address" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roller_specs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "outerDiameterOd" DOUBLE PRECISION NOT NULL,
    "coreDiameter" DOUBLE PRECISION NOT NULL,
    "faceLength" DOUBLE PRECISION NOT NULL,
    "totalLength" DOUBLE PRECISION NOT NULL,
    "coatingMaterial" "CoatingMaterial" NOT NULL,
    "hardnessShore" TEXT NOT NULL,
    "groovingType" "GroovingType" NOT NULL,
    "operatingTemp" DOUBLE PRECISION,
    "chemicalExposure" TEXT,
    "damagePhotos" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roller_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "rollerSpecId" TEXT NOT NULL,
    "baseMaterialCost" DECIMAL(12,2) NOT NULL,
    "laborMachiningCost" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountPercentage" DECIMAL(5,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(12,2) NOT NULL,
    "grandTotal" DECIMAL(12,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "clientSignature" JSONB,
    "clientSignatureUrl" TEXT,
    "qrCodeUrl" TEXT,
    "pdfUrl" TEXT,
    "terms" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "notes" TEXT,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_queue" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "entityType" "SyncEntityType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "serverId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "sync_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "clients_companyName_idx" ON "clients"("companyName");

-- CreateIndex
CREATE INDEX "roller_specs_clientId_idx" ON "roller_specs"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_quotationNumber_key" ON "quotations"("quotationNumber");

-- CreateIndex
CREATE INDEX "quotations_clientId_idx" ON "quotations"("clientId");

-- CreateIndex
CREATE INDEX "quotations_createdByUserId_idx" ON "quotations"("createdByUserId");

-- CreateIndex
CREATE INDEX "quotations_status_idx" ON "quotations"("status");

-- CreateIndex
CREATE INDEX "visits_userId_visitedAt_idx" ON "visits"("userId", "visitedAt");

-- CreateIndex
CREATE INDEX "sync_queue_deviceId_status_idx" ON "sync_queue"("deviceId", "status");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roller_specs" ADD CONSTRAINT "roller_specs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_rollerSpecId_fkey" FOREIGN KEY ("rollerSpecId") REFERENCES "roller_specs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_queue" ADD CONSTRAINT "sync_queue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

