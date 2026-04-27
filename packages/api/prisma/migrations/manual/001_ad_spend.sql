-- Migration: cria tabela ad_spend e enum AdSource pra armazenar gastos diários de
--            tráfego pago (Meta Ads via ContIA + Google Ads via CSV).
--
-- Contexto: a Wave 2 do redesign do relatório das 7h precisa de uma tabela
--           idempotente onde os squads Beta (Meta) e Gamma (Google) gravam o
--           gasto diário por campanha. Conflitos no upsert usam a unique
--           (date, source, campaignId).
--
-- ORDEM DE DEPLOY:
--   1. Rodar este SQL no Supabase de produção (idempotente — pode rodar 2x sem efeito)
--   2. Rodar `npx prisma generate` localmente e fazer deploy do código novo
--
-- IDEMPOTÊNCIA:
--   - CREATE TYPE não suporta IF NOT EXISTS no Postgres → DO block com EXCEPTION
--   - CREATE TABLE / INDEX usam IF NOT EXISTS
--   - ZERO comandos destrutivos (sem DROP, sem TRUNCATE)

BEGIN;

-- 1. Enum AdSource (idempotente via DO block)
DO $$
BEGIN
  CREATE TYPE "AdSource" AS ENUM ('META_ADS', 'GOOGLE_ADS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- 2. Tabela ad_spend
CREATE TABLE IF NOT EXISTS "ad_spend" (
  "id"              TEXT          NOT NULL PRIMARY KEY,
  "date"            DATE          NOT NULL,
  "source"          "AdSource"    NOT NULL,
  "campaignId"      TEXT          NOT NULL,
  "campaignName"    TEXT          NOT NULL,
  "spend"           DECIMAL(12,2) NOT NULL,
  "impressions"     INTEGER       NOT NULL DEFAULT 0,
  "clicks"          INTEGER       NOT NULL DEFAULT 0,
  "leads"           INTEGER       NOT NULL DEFAULT 0,
  "conversions"     INTEGER       NOT NULL DEFAULT 0,
  "conversionValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "meta"            JSONB,
  "syncedAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Unique de upsert (date + source + campaignId)
CREATE UNIQUE INDEX IF NOT EXISTS "ad_spend_date_source_campaignId_key"
  ON "ad_spend" ("date", "source", "campaignId");

-- 4. Indexes secundários
CREATE INDEX IF NOT EXISTS "ad_spend_date_source_idx"
  ON "ad_spend" ("date", "source");

CREATE INDEX IF NOT EXISTS "ad_spend_campaignName_idx"
  ON "ad_spend" ("campaignName");

-- 5. Validação manual (descomente pra checar)
-- SELECT COUNT(*) AS total, source, MIN(date) AS first_day, MAX(date) AS last_day
-- FROM "ad_spend"
-- GROUP BY source;

COMMIT;

-- Rollback (NÃO rodar em produção sem revisão — destrutivo):
-- BEGIN;
-- DROP TABLE IF EXISTS "ad_spend";
-- DROP TYPE  IF EXISTS "AdSource";
-- COMMIT;
