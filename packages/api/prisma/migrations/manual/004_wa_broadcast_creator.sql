-- Migration: adiciona createdById em WaBroadcast pra rastrear quem criou cada broadcast.
-- Contexto: incidente 2026-05-12 — broadcasts em massa criados pela UI sem rastreabilidade.
-- ZERO operações destrutivas. Idempotente.

ALTER TABLE "WaBroadcast" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

CREATE INDEX IF NOT EXISTS "WaBroadcast_createdById_idx"
  ON "WaBroadcast" ("createdById")
  WHERE "createdById" IS NOT NULL;

-- FK opcional — sem ON DELETE CASCADE pra preservar histórico se user for deletado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WaBroadcast_createdById_fkey'
  ) THEN
    ALTER TABLE "WaBroadcast" ADD CONSTRAINT "WaBroadcast_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END
$$;
