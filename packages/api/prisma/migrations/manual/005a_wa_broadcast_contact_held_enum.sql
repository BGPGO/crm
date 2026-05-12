-- Migration 005a (parte 1 de 2): adiciona valor 'WA_BC_HELD' ao enum WaBroadcastContactStatus.
--
-- Precisa rodar SOZINHO em uma transação separada antes de 005b — ALTER TYPE ADD VALUE
-- não pode ser usado na mesma transação onde ele é referenciado.
--
-- Idempotente via IF NOT EXISTS (Postgres 9.6+).

ALTER TYPE "WaBroadcastContactStatus" ADD VALUE IF NOT EXISTS 'WA_BC_HELD';
