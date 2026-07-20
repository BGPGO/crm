-- Atributos de segmentação do Contact (gênero, sistema/ERP, faixa de faturamento)
-- Idempotente — aplicar em prod via:
--   npx prisma db execute --schema=packages/api/prisma/schema.prisma --file packages/api/prisma/sql/contact-attributes.sql
-- (prod tem drift, NÃO usar prisma db push — ver memória feedback-crm-db-push-drift)

ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "erpSystem" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "revenueRange" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "attributesMeta" JSONB;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "attributesExtractedAt" TIMESTAMP(3);
