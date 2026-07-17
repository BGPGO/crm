-- Tabela de controle do sync de leads dos Instant Forms do Meta (planilha Google).
-- Idempotente — aplicar em prod via:
--   npx prisma db execute --schema=packages/api/prisma/schema.prisma --file packages/api/prisma/sql/meta-form-leads.sql
-- (prod tem drift; NÃO usar prisma db push)

CREATE TABLE IF NOT EXISTS "MetaFormLead" (
  "id" TEXT NOT NULL,
  "leadgenId" TEXT NOT NULL,
  "contactId" TEXT,
  "dealId" TEXT,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MetaFormLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MetaFormLead_leadgenId_key" ON "MetaFormLead"("leadgenId");
