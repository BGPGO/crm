-- AlterTable: adicionar fbp/fbc para Meta Conversions API
ALTER TABLE "LeadTracking" ADD COLUMN "fbp" TEXT;
ALTER TABLE "LeadTracking" ADD COLUMN "fbc" TEXT;

-- CreateTable: configuração da Meta Conversions API por brand
CREATE TABLE "MetaCapiConfig" (
    "id" TEXT NOT NULL,
    "brand" "Brand" NOT NULL,
    "pixelId" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "testEventCode" TEXT,
    "eventName" TEXT NOT NULL DEFAULT 'Purchase',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCapiConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaCapiConfig_brand_key" ON "MetaCapiConfig"("brand");
