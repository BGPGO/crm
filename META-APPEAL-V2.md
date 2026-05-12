# Meta WABA Quality Appeal — v2 (a ser submetido)

> **Quando submeter**: aguardar a métrica de 131049 cair pra <5% por pelo menos 24h consecutivas. Submeter cedo demais resulta em "Unchanged" automático.
>
> **Submeter em**: WhatsApp Manager → Phone Number 1076203828908124 → Quality rating → "Available for review"

---

## Texto pronto pra colar (inglês formal)

```
We acknowledge the YELLOW quality rating and have taken substantial corrective action since 2026-05-12. Below are the concrete steps taken and measurable results.

CONTEXT
Our messaging program is opt-in based. Contacts are leads who submitted forms on our landing pages requesting financial wealth-management consultations from Bertuzzi Gestão Patrimonial. We initially had elevated 131049 error rates due to (a) excessive cadence steps targeting saturated audiences, and (b) a large marketing broadcast on the evening of 2026-05-11 that compounded the issue.

ACTIONS TAKEN

1. Paused all MARKETING-category WhatsApp cadences on 2026-05-12:
   - "Cadência Lead → Contato Feito — WABA" (primary source of 131049, ~115 errors in 7 days)
   - "Cadência No-Show — BGP"
   - "Cadência Etapa 3 — Marcar reunião WABA"

2. Edited 5 underperforming MARKETING templates to improve content quality. All 5 were re-approved by Meta within hours and are currently in quality re-evaluation:
   - cadencia_d4_prova: removed product jargon and absolute claims
   - cadencia_d1_abertura: fixed orthographic errors and redundancy
   - reuniao_d4_resultado: removed financial-claim language and artificial urgency
   - marcar_reuniao__quanto_deu_resultado: completed truncated sentence
   - lembrete_reuniao_15min: clarified transactional intent (Meta has since recategorized this template as UTILITY)

3. Created 3 new UTILITY templates to replace MARKETING reminders and acknowledgments — all currently APPROVED and in use:
   - lembrete_reuniao_60min_v2_utility (replaces marketing reminder)
   - lembrete_reuniao_15min_v2_utility (replaces marketing reminder)
   - lead_recebido_v1_utility (acknowledges new lead registrations, replaces first marketing cadence step)

4. Identified and tagged 17 recipients showing per-user marketing saturation patterns. Our system now automatically excludes these contacts from all MARKETING template sends.

5. Halted all MARKETING broadcasts. We will not resume marketing broadcasts until the quality rating returns to GREEN and remains stable for 7 consecutive days, and even then with reduced volume (1/3 of historical baseline) and gradual ramping.

6. Implemented technical safeguards in our messaging service:
   - YELLOW gate: broadcasts automatically blocked while quality is YELLOW
   - Per-recipient cap-hit filter: tagged contacts skip MARKETING templates
   - Template health-check job: hourly synchronization of template status with Meta API
   - Internal dashboard showing fail-rate per template (CRITICAL/WARNING/HEALTHY)

MEASURABLE RESULTS

[INSERIR AQUI ANTES DE SUBMETER — rodar query atualizada]
- 131049 rate (last 24 hours): [X]%
- 131049 rate (previous 7 days average): [Y]%
- Marketing template sends (last 24h): [Z] (vs [W] daily average pre-fix)

CONTINUING COMMITMENT

We will maintain reduced WhatsApp volume, prioritize UTILITY templates for transactional communications (reminders, confirmations, acknowledgments), and reserve MARKETING templates only for highly engaged recipients with explicit recent opt-in signals.

We respectfully request review of our remediation efforts.

Thank you.
```

---

## Antes de submeter — preencher os números

Rodar no Supabase:

```sql
-- Substituir [X] (taxa últimas 24h)
SELECT
  ROUND(100.0 * COUNT(*) FILTER (WHERE "errorCode" = '131049') / NULLIF(COUNT(*), 0), 1) AS pct,
  COUNT(*) FILTER (WHERE "errorCode" = '131049') AS err,
  COUNT(*) AS total
FROM "WaMessage"
WHERE "direction" = 'OUTBOUND' AND "type" = 'TEMPLATE'
  AND "createdAt" >= NOW() - INTERVAL '24 hours';

-- Substituir [Y] (média 7 dias pré-fix — janela 5/05 a 11/05)
SELECT ROUND(AVG(pct), 1) AS media_7d_pre_fix
FROM (
  SELECT DATE("createdAt") AS dia,
    100.0 * COUNT(*) FILTER (WHERE "errorCode" = '131049') / NULLIF(COUNT(*), 0) AS pct
  FROM "WaMessage"
  WHERE "direction" = 'OUTBOUND' AND "type" = 'TEMPLATE'
    AND "createdAt" >= '2026-05-05' AND "createdAt" < '2026-05-12'
  GROUP BY 1
) sub;

-- Substituir [Z] e [W] (volume diário antes/depois)
SELECT
  CASE WHEN "createdAt" >= NOW() - INTERVAL '24 hours' THEN 'pos_pausa' ELSE 'media_pre' END AS janela,
  COUNT(*)::int / CASE WHEN "createdAt" >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 7 END AS msgs_dia
FROM "WaMessage"
WHERE "direction" = 'OUTBOUND' AND "type" = 'TEMPLATE'
  AND "createdAt" >= NOW() - INTERVAL '8 days'
GROUP BY 1;
```

---

## Critério de submissão (não submeter antes)

Só submeter quando TODAS as condições forem verdadeiras:

- [ ] 131049 rate <5% nas últimas 24h
- [ ] Pelo menos 24h consecutivas sem novo MARKETING broadcast
- [ ] Cadências MARKETING ainda pausadas (status='PAUSED' no DB)
- [ ] Pelo menos 1 novo template UTILITY APPROVED em uso
- [ ] `lead_recebido_v1_utility` rodando há mais de 12h sem erros

Se algum critério não for atendido, esperar.
