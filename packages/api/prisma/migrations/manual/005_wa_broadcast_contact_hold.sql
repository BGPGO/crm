-- Migration: adiciona suporte a "hold/release" em WaBroadcastContact pra
--            cooldown per-recipient de 48h entre marketing templates.
--
-- Contexto: incidente 2026-05-12. Equipe estava disparando broadcasts
-- consecutivos pra mesma base. Solução: hold envio quando recipient
-- recebeu MARKETING <48h atrás, release automaticamente quando bater o tempo.
--
-- ZERO operações destrutivas. Idempotente.

-- Pré-requisito: rodar 005a_wa_broadcast_contact_held_enum.sql ANTES deste arquivo,
-- em transação separada (ALTER TYPE ADD VALUE só pode ser usado em transações posteriores).

-- Adicionar coluna holdUntil
ALTER TABLE "WaBroadcastContact" ADD COLUMN IF NOT EXISTS "holdUntil" TIMESTAMP(3);

-- Index parcial pra busca rápida de contatos em hold prontos pra release
CREATE INDEX IF NOT EXISTS "WaBroadcastContact_held_release_idx"
  ON "WaBroadcastContact" ("holdUntil")
  WHERE "status" = 'WA_BC_HELD';
