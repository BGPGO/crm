-- Migration: adiciona coluna Deal.meetingSource + backfill da Task MEETING mais recente
--
-- Contexto: queremos mostrar um badge de origem na negociação (Email, Direto, BIA,
--           Humano). Deal.meetingSource espelha o meetingSource da task MEETING mais
--           recente do deal. Novos deals preenchem na criação da reunião.
--
-- ORDEM DE DEPLOY:
--   1. Rodar este SQL no Supabase (compatível com código antigo)
--   2. Fazer deploy do código novo (que passa a setar o campo ativamente)

BEGIN;

-- 1. Adicionar coluna nullable
ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "meetingSource" "MeetingSource";

-- 2. Backfill: pra cada Deal que tem pelo menos uma Task MEETING com meetingSource
--    preenchido, pegar o valor da task mais recente (por createdAt).
UPDATE "Deal" d
SET "meetingSource" = t."meetingSource"
FROM (
  SELECT DISTINCT ON ("dealId") "dealId", "meetingSource", "createdAt"
  FROM "Task"
  WHERE "type" = 'MEETING'
    AND "meetingSource" IS NOT NULL
    AND "dealId" IS NOT NULL
  ORDER BY "dealId", "createdAt" DESC
) t
WHERE d.id = t."dealId"
  AND d."meetingSource" IS NULL;

-- 3. Validação
-- SELECT "meetingSource", COUNT(*) FROM "Deal" GROUP BY "meetingSource" ORDER BY COUNT(*) DESC;

COMMIT;

-- Rollback:
-- BEGIN;
-- ALTER TABLE "Deal" DROP COLUMN IF EXISTS "meetingSource";
-- COMMIT;
