-- Migration: adiciona coluna dueDateFormat na tabela Task e marca registros existentes como LEGACY
--
-- Contexto: antes desta migração, dueDate era salvo como "UTC literal representando BRT"
--           (ex: user digita 13h → salva "13:00:00Z" mas representa 13h BRT).
--           A partir daqui, novos registros salvam UTC real (13h BRT → "16:00:00Z").
--           Código que lê dueDate usa helper normalizeDueDate() que aplica +3h se LEGACY.
--
-- ORDEM DE DEPLOY RECOMENDADA:
--   1. Rodar este SQL no Supabase (pode ser ANTES do deploy — é compatível com código antigo)
--   2. Fazer git push / deploy do código
--   3. Novos registros automaticamente nascem com dueDateFormat='UTC' (via schema Prisma)
--
-- A ordem garante que não há janela de inconsistência:
--   - Coluna nasce com default 'LEGACY' → registros existentes ficam LEGACY
--   - Default muda pra 'UTC' no final → novas inserções do código antigo ou novo ficam UTC
--   - Código antigo não conhece a coluna → Prisma ignora, sem quebrar
--   - Código novo envia dueDateFormat='UTC' explícito via buildDueDatePersist

BEGIN;

-- 1. Adicionar coluna com default LEGACY (todos os registros existentes recebem 'LEGACY')
ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "dueDateFormat" TEXT NOT NULL DEFAULT 'LEGACY';

-- 2. Defensive: garantir que todos os existentes estão marcados como LEGACY
--    (caso a coluna já tenha sido criada antes, por exemplo)
UPDATE "Task"
SET "dueDateFormat" = 'LEGACY'
WHERE "dueDateFormat" NOT IN ('LEGACY', 'UTC');

-- 3. Alterar default da coluna pra 'UTC' (afeta só inserções futuras)
ALTER TABLE "Task"
  ALTER COLUMN "dueDateFormat" SET DEFAULT 'UTC';

-- 4. Validação — conferir distribuição
-- SELECT "dueDateFormat", COUNT(*) FROM "Task" GROUP BY "dueDateFormat";
-- Esperado: tudo em LEGACY antes do primeiro insert novo.

COMMIT;

-- Rollback (caso precise reverter):
-- BEGIN;
-- ALTER TABLE "Task" DROP COLUMN IF EXISTS "dueDateFormat";
-- COMMIT;
