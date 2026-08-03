-- Jornada da newsletter (assinantes) — criação aditiva e idempotente.
-- Prod tem drift: NUNCA prisma db push; aplicar via psql/prisma db execute.

CREATE TABLE IF NOT EXISTS "NewsletterSubscriber" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tier" INTEGER,
  "cargo" TEXT,
  "setor" TEXT,
  "segmentoDetalhe" TEXT,
  "faturamento" TEXT,
  "estado" TEXT NOT NULL DEFAULT 'inscrito',
  "pontos" INTEGER NOT NULL DEFAULT 0,
  "edicoesContadas" INTEGER NOT NULL DEFAULT 0,
  "welcomeStatus" TEXT NOT NULL DEFAULT 'pending',
  "welcomeDueAt" TIMESTAMP(3),
  "qualifiedAt" TIMESTAMP(3),
  "convertedAt" TIMESTAMP(3),
  "handoffDealId" TEXT,
  "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSubscriber_contactId_key" ON "NewsletterSubscriber"("contactId");
CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_estado_idx" ON "NewsletterSubscriber"("estado");
CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_email_idx" ON "NewsletterSubscriber"("email");
CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_welcomeStatus_welcomeDueAt_idx" ON "NewsletterSubscriber"("welcomeStatus", "welcomeDueAt");
