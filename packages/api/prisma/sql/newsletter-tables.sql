-- Newsletter semanal (BGP Insights) — criação aditiva e idempotente.
-- Prod tem drift: NUNCA prisma db push; aplicar via prisma db execute.

CREATE TABLE IF NOT EXISTS "NewsletterEdition" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "isTest" BOOLEAN NOT NULL DEFAULT false,
  "html" TEXT,
  "links" JSONB,
  "sentAt" TIMESTAMP(3),
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsletterEdition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NewsletterEdition_status_idx" ON "NewsletterEdition"("status");
CREATE INDEX IF NOT EXISTS "NewsletterEdition_sentAt_idx" ON "NewsletterEdition"("sentAt");

CREATE TABLE IF NOT EXISTS "NewsletterEvent" (
  "id" TEXT NOT NULL,
  "editionId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "slot" TEXT,
  "email" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsletterEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NewsletterEvent_editionId_fkey" FOREIGN KEY ("editionId")
    REFERENCES "NewsletterEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "NewsletterEvent_editionId_type_idx" ON "NewsletterEvent"("editionId", "type");
CREATE INDEX IF NOT EXISTS "NewsletterEvent_editionId_slot_idx" ON "NewsletterEvent"("editionId", "slot");

CREATE TABLE IF NOT EXISTS "NewsletterConfig" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "recipients" JSONB NOT NULL DEFAULT '[]',
  "lastRunAt" TIMESTAMP(3),
  "lastRunStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsletterConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NewsletterConfig" ADD COLUMN IF NOT EXISTS "segmentId" TEXT;
