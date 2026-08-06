-- Base engajada da newsletter (06/08/2026) — aditivo e idempotente.
-- Prod tem drift de schema: aplicar com `prisma db execute`, nunca `db push`.
--
-- A audiência deixa de ser "a marca inteira" e passa a ser
-- (interagiu na janela) ∪ (cadastro dentro da carência) ∪ (assinante da LP),
-- sempre menos a UnsubscribeList. Os defaults nascem desligados: ligar pela
-- tela Marketing → Newsletter.

ALTER TABLE "NewsletterConfig"
  ADD COLUMN IF NOT EXISTS "engagedOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "engagedWindowDays" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS "graceWindowDays" INTEGER NOT NULL DEFAULT 90;

-- Quem interagiu é buscado por email na janela de tempo; sem esse índice a
-- consulta varre a tabela inteira de eventos a cada resolveAudience().
CREATE INDEX IF NOT EXISTS "NewsletterEvent_createdAt_email_idx"
  ON "NewsletterEvent" ("createdAt", "email");
