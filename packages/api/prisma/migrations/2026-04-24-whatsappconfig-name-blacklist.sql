-- Migration: adiciona coluna nameBlacklist em WhatsAppConfig
--
-- Contexto: blacklist de nomes ofensivos editável pela UI da BIA. Termos aqui
--           são ADITIVOS sobre a baseline hardcoded em utils/nameSanitizer.ts.
--           Nunca remove termos da baseline (garantia de segurança no código).
--
-- ORDEM DE DEPLOY RECOMENDADA:
--   1. Rodar este SQL no Supabase (pode ser ANTES do deploy — é compatível com código antigo)
--   2. Fazer git push / deploy do código novo
--   3. Admin passa a editar a blacklist pela seção "Blacklist de Nomes" em /waba/bia
--
-- Compatibilidade:
--   - Código antigo não conhece a coluna → Prisma ignora no select implícito
--   - Código novo lê default [] quando não há customs → baseline continua ativa
--   - Nada quebra em nenhuma ordem de rollout

BEGIN;

-- Adicionar coluna como array de texto, default vazio
ALTER TABLE "WhatsAppConfig"
  ADD COLUMN IF NOT EXISTS "nameBlacklist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

COMMIT;

-- Rollback (caso precise reverter):
-- BEGIN;
-- ALTER TABLE "WhatsAppConfig" DROP COLUMN IF EXISTS "nameBlacklist";
-- COMMIT;
