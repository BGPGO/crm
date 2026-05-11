-- Migration: adiciona colunas de health check em CloudWaTemplate para rastrear
--            taxa de erro por template nos últimos 7 dias e um flag de saúde.
--
-- Contexto: o job wabaTemplateHealthCheck sincroniza templates com a Meta API
--           a cada hora, calcula failRate7d a partir de WaMessage, e define
--           healthFlag (HEALTHY/WARNING/CRITICAL/UNKNOWN) para exibição no
--           dashboard WABA e alertas proativos da equipe.
--
-- ORDEM DE DEPLOY:
--   1. Rodar este SQL no Supabase de produção (idempotente — pode rodar 2x sem efeito)
--   2. Rodar `npx prisma generate` localmente e fazer deploy do código novo
--   3. O job de health check roda automaticamente a cada 1h após o deploy
--
-- IDEMPOTÊNCIA:
--   - ALTER TABLE ... ADD COLUMN IF NOT EXISTS (Postgres 9.6+)
--   - CREATE INDEX ... IF NOT EXISTS
--   - ZERO comandos destrutivos (sem DROP, sem TRUNCATE)

BEGIN;

-- 1. Adicionar colunas de health em CloudWaTemplate
ALTER TABLE "CloudWaTemplate"
  ADD COLUMN IF NOT EXISTS "healthFlag"        TEXT,
  ADD COLUMN IF NOT EXISTS "lastHealthCheckAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failRate7d"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sentCount7d"       INTEGER          NOT NULL DEFAULT 0;

-- 2. Índice parcial em healthFlag (só onde não é NULL — acelera dashboard e alertas)
CREATE INDEX IF NOT EXISTS "CloudWaTemplate_healthFlag_idx"
  ON "CloudWaTemplate" ("healthFlag")
  WHERE "healthFlag" IS NOT NULL;

-- 3. Validação manual (descomente pra checar após deploy)
-- SELECT "healthFlag", COUNT(*) AS total
-- FROM "CloudWaTemplate"
-- GROUP BY "healthFlag";

COMMIT;

-- Rollback (NÃO rodar em produção sem revisão — destrutivo):
-- BEGIN;
-- DROP INDEX IF EXISTS "CloudWaTemplate_healthFlag_idx";
-- ALTER TABLE "CloudWaTemplate"
--   DROP COLUMN IF EXISTS "healthFlag",
--   DROP COLUMN IF EXISTS "lastHealthCheckAt",
--   DROP COLUMN IF EXISTS "failRate7d",
--   DROP COLUMN IF EXISTS "sentCount7d";
-- COMMIT;
