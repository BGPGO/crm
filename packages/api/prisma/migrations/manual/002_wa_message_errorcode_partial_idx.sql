-- Migration: adiciona índice parcial em WaMessage(errorCode) para acelerar
--            análise de erros do WABA (131049 "healthy ecosystem", 131026, etc).
--
-- Contexto: queries de diagnóstico filtrando `WHERE "errorCode" = '131049'`
--           causavam seq scan na tabela inteira de WaMessage. Incidente
--           2026-05-11 derrubou o Postgres do Supabase por OOM. Sem este
--           índice, dashboard/endpoint de erros agregados também causaria
--           o mesmo problema.
--
-- Por que parcial (WHERE "errorCode" IS NOT NULL):
--   - Maioria absoluta das WaMessage tem errorCode = NULL (sucesso).
--   - Índice parcial só cobre falhas → muito menor, build rápido, escrita
--     barata (INSERT com errorCode=NULL não atualiza este índice).
--
-- Por que CONCURRENTLY:
--   - Não bloqueia escrita na tabela durante o build.
--   - Build pode levar mais tempo, mas a operação é segura em prod.
--   - IMPORTANTE: CREATE INDEX CONCURRENTLY NÃO RODA EM TRANSAÇÃO.
--     Por isso este arquivo NÃO tem BEGIN/COMMIT.
--
-- ORDEM DE DEPLOY:
--   1. Rodar este SQL via `npx prisma db execute --file ...` (não usa transação).
--   2. Validar com SELECT no pg_indexes (query abaixo).
--   3. Nada de prisma generate (não há mudança de schema do cliente — Prisma
--      não suporta índice parcial via @@index nativamente).
--
-- IDEMPOTÊNCIA:
--   - IF NOT EXISTS evita erro se rodar 2x.
--
-- ZERO comandos destrutivos.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "WaMessage_errorCode_partial_idx"
  ON "WaMessage" ("errorCode")
  WHERE "errorCode" IS NOT NULL;

-- Validação (rodar manualmente após a criação):
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'WaMessage' AND indexname = 'WaMessage_errorCode_partial_idx';

-- Rollback (NÃO rodar em produção sem revisão):
-- DROP INDEX CONCURRENTLY IF EXISTS "WaMessage_errorCode_partial_idx";
