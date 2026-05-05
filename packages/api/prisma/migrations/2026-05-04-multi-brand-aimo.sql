-- Migration: introduz separação multi-brand BGP/AIMO
--
-- Contexto: separar base de leads/deals/campanhas/automações da AiMO da
--           operação BGP. Adiciona enum Brand + coluna `brand` em 9 models.
--           Default 'BGP' em tudo existente. Pipeline AIMO terá brand=AIMO
--           e isDefault=false (webhooks BGP continuam isolados).
--
-- ORDEM DE DEPLOY RECOMENDADA:
--   1. Rodar este SQL no Supabase (compatível com código antigo — coluna
--      ignorada nos selects implícitos).
--   2. Fazer git push da branch feature/multi-brand-aimo (após review).
--   3. Coolify deploya: prisma db push --skip-generate vê schema sincronizado
--      e não faz nada destrutivo. Código novo passa a usar `brand`.
--
-- Compatibilidade durante rollout (qualquer ordem é segura):
--   - Código antigo: ignora coluna nova.
--   - Código novo: lê default 'BGP' em todo registro existente.
--   - Aditivo 100% — rollback é DROP COLUMN + DROP TYPE.

BEGIN;

-- 1) Cria enum Brand (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Brand') THEN
    CREATE TYPE "Brand" AS ENUM ('BGP', 'AIMO');
  END IF;
END $$;

-- 2) ADD COLUMN com DEFAULT 'BGP' NOT NULL — metadata-only no Postgres 11+,
--    instantâneo mesmo em tabelas grandes.

ALTER TABLE "Contact"        ADD COLUMN IF NOT EXISTS "brand" "Brand" NOT NULL DEFAULT 'BGP';
ALTER TABLE "Deal"           ADD COLUMN IF NOT EXISTS "brand" "Brand" NOT NULL DEFAULT 'BGP';
ALTER TABLE "Pipeline"       ADD COLUMN IF NOT EXISTS "brand" "Brand" NOT NULL DEFAULT 'BGP';
ALTER TABLE "EmailTemplate"  ADD COLUMN IF NOT EXISTS "brand" "Brand" NOT NULL DEFAULT 'BGP';
ALTER TABLE "EmailCampaign"  ADD COLUMN IF NOT EXISTS "brand" "Brand" NOT NULL DEFAULT 'BGP';
ALTER TABLE "Automation"     ADD COLUMN IF NOT EXISTS "brand" "Brand" NOT NULL DEFAULT 'BGP';
ALTER TABLE "Tag"            ADD COLUMN IF NOT EXISTS "brand" "Brand" NOT NULL DEFAULT 'BGP';
ALTER TABLE "Segment"        ADD COLUMN IF NOT EXISTS "brand" "Brand" NOT NULL DEFAULT 'BGP';
ALTER TABLE "WaBroadcast"    ADD COLUMN IF NOT EXISTS "brand" "Brand" NOT NULL DEFAULT 'BGP';

-- 3) Índices em brand pra acelerar filtros frequentes (idempotentes)
CREATE INDEX IF NOT EXISTS "Contact_brand_idx"        ON "Contact"("brand");
CREATE INDEX IF NOT EXISTS "Deal_brand_idx"           ON "Deal"("brand");
CREATE INDEX IF NOT EXISTS "EmailTemplate_brand_idx"  ON "EmailTemplate"("brand");
CREATE INDEX IF NOT EXISTS "EmailCampaign_brand_idx"  ON "EmailCampaign"("brand");
CREATE INDEX IF NOT EXISTS "Automation_brand_idx"     ON "Automation"("brand");
CREATE INDEX IF NOT EXISTS "Tag_brand_idx"            ON "Tag"("brand");
CREATE INDEX IF NOT EXISTS "Segment_brand_idx"        ON "Segment"("brand");
CREATE INDEX IF NOT EXISTS "WaBroadcast_brand_idx"    ON "WaBroadcast"("brand");

-- 4) Validação (deve retornar 0 em todas as queries abaixo APÓS o ALTER):
--    SELECT COUNT(*) FROM "Contact"        WHERE "brand" IS NULL;
--    SELECT COUNT(*) FROM "Deal"           WHERE "brand" IS NULL;
--    SELECT COUNT(*) FROM "Pipeline"       WHERE "brand" IS NULL;
--    SELECT COUNT(*) FROM "EmailTemplate"  WHERE "brand" IS NULL;
--    SELECT COUNT(*) FROM "EmailCampaign"  WHERE "brand" IS NULL;
--    SELECT COUNT(*) FROM "Automation"     WHERE "brand" IS NULL;
--    SELECT COUNT(*) FROM "Tag"            WHERE "brand" IS NULL;
--    SELECT COUNT(*) FROM "Segment"        WHERE "brand" IS NULL;
--    SELECT COUNT(*) FROM "WaBroadcast"    WHERE "brand" IS NULL;

COMMIT;

-- ─── Rollback (caso precise reverter) ──────────────────────────────────────
-- BEGIN;
-- DROP INDEX IF EXISTS "WaBroadcast_brand_idx";
-- DROP INDEX IF EXISTS "Segment_brand_idx";
-- DROP INDEX IF EXISTS "Tag_brand_idx";
-- DROP INDEX IF EXISTS "Automation_brand_idx";
-- DROP INDEX IF EXISTS "EmailCampaign_brand_idx";
-- DROP INDEX IF EXISTS "EmailTemplate_brand_idx";
-- DROP INDEX IF EXISTS "Deal_brand_idx";
-- DROP INDEX IF EXISTS "Contact_brand_idx";
-- ALTER TABLE "WaBroadcast"    DROP COLUMN IF EXISTS "brand";
-- ALTER TABLE "Segment"        DROP COLUMN IF EXISTS "brand";
-- ALTER TABLE "Tag"            DROP COLUMN IF EXISTS "brand";
-- ALTER TABLE "Automation"     DROP COLUMN IF EXISTS "brand";
-- ALTER TABLE "EmailCampaign"  DROP COLUMN IF EXISTS "brand";
-- ALTER TABLE "EmailTemplate"  DROP COLUMN IF EXISTS "brand";
-- ALTER TABLE "Pipeline"       DROP COLUMN IF EXISTS "brand";
-- ALTER TABLE "Deal"           DROP COLUMN IF EXISTS "brand";
-- ALTER TABLE "Contact"        DROP COLUMN IF EXISTS "brand";
-- DROP TYPE IF EXISTS "Brand";
-- COMMIT;
