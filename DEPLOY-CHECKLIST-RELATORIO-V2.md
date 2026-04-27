# Deploy Checklist — Relatório Diário do Funil v2

Refator completo do relatório diário das 7h em 3 seções:
- **Funil** (existia, agora isolada em `funnelSection.ts`)
- **Tráfego Pago** (Meta Ads via ContIA + Google Ads via upload manual)
- **Canais Digitais** (BIA WhatsApp, BGP Messenger, Calendly, último Email Marketing)

Composer em `services/dailyReport/index.ts` orquestra render paralelo com timeout individual de 30s e fallback gracioso por seção.

## Pré-deploy

### 1. Migration do schema
- [ ] Rodar `packages/api/prisma/migrations/manual/001_ad_spend.sql` no Supabase do CRM (SQL editor)
- [ ] Validar com `SELECT * FROM ad_spend LIMIT 1;` (deve retornar 0 rows, sem erro de tabela inexistente)
- [ ] Rodar `npx prisma generate --schema=packages/api/prisma/schema.prisma` localmente para conferir; o build Docker já roda `prisma generate` na pipeline

### 2. Env vars (Coolify CRM API)
- [ ] `META_ADS_INTERNAL_API_URL=https://contia.bertuzzipatrimonial.com.br`
- [ ] `META_ADS_INTERNAL_SECRET=<gerar com openssl rand -hex 32>`
- [ ] `META_ADS_EMPRESA_ID=<UUID da empresa BGPGO no ContIA>`
- [ ] `BGPMASSA_API_URL=https://messenger.bertuzzipatrimonial.com.br` (default já no código, mas explicitar facilita troubleshooting)

### 3. Env vars (Coolify ContIA)
- [ ] `META_ADS_INTERNAL_SECRET=<MESMO valor do CRM — sem isso a rota interna devolve 401>`

### 4. Deploy
- [ ] Deploy CRM API (webhook GitHub → auto-deploy, conforme `coolify-deploy.md`)
- [ ] Deploy ContIA (manual via API Coolify — ContIA não tem webhook GitHub)
- [ ] Deploy bgpmassa (verificar se tem webhook GitHub; se não, deploy manual)

## Pós-deploy

### Smoke tests manuais
- [ ] **Meta Ads (ContIA)**:
  ```
  curl -H "x-internal-secret: $META_ADS_INTERNAL_SECRET" \
       "https://contia.bertuzzipatrimonial.com.br/api/internal/meta-ads/insights?date=2026-04-25&empresa_id=$META_ADS_EMPRESA_ID"
  ```
  → 200 com JSON contendo `totalSpend`, `totalLeads`, `campaigns`, `monthToDate`
- [ ] **bgpmassa**:
  ```
  curl https://messenger.bertuzzipatrimonial.com.br/api/messages/daily-count?date=2026-04-25
  ```
  → 200 com `{ inbound, outbound, total }` (atualmente o endpoint exige auth — confirmar com squad bgpmassa se a rota daily-count será pública ou se o CRM precisa de header de auth)
- [ ] **CRM Google Ads status**:
  ```
  curl -H "Authorization: Bearer $TOKEN" https://crm.bertuzzipatrimonial.com.br/api/google-ads/status
  ```
  → `{ ready: true, registros: 0 }` após migration aplicada
- [ ] **CRM render preview no container**: `docker exec <crm-api> npx tsx src/scripts/previewDailyReport.ts` → gera `/tmp/preview-relatorio.html`

### Validação do email
- [ ] Aguardar **7h da manhã (BRT)**, verificar caixa `vitor@bertuzzipatrimonial.com.br` e `oliver@bertuzzipatrimonial.com.br`
- [ ] OU disparar manualmente: o CRM já expõe `POST /api/notification-config/test-daily-report` (rota existente em `routes/notification-config.ts`) — usar enquanto não houver disparo agendado de validação

### Upload inicial Google Ads (opcional, fase 1)
- [ ] Gerar relatório CSV/manual no Google Ads
- [ ] `POST /api/google-ads/upload` com `{ rows: [{ date, campaignName, spend, leads }] }`
- [ ] Verificar `GET /api/google-ads/status` → `registros > 0`

## Pendências conhecidas (não-bloqueantes)
- **`Deal.utmCampaign` não existe no schema** — `utmCampaign` está em `LeadTracking`, sem join direto via `Activity`. A tabela "Detalhamento por Campanha" mostra leads por campanha (vindo do Meta) mas a coluna "Reun. Agend." sempre exibe 0 + total geral por baixo. Plano: implementar cruzamento `LeadTracking → Contact → Deal → Activity[type=STAGE_CHANGE → toStage=Reunião agendada]` em iteração futura.
- **Google Ads driver real bloqueado** por aprovação de Developer Token (~4 semanas Google). Fase 1 usa upload CSV/JSON manual via `POST /api/google-ads/upload` — funcional.
- **`BGPMASSA_API_URL` não está em `.env.example`** (não-bloqueante: tem default no código).
- **Endpoint bgpmassa `daily-count` retorna 401 sem auth** — em dev local isso fez fallback gracioso pra zeros. Confirmar se em produção a rota é pública ou se precisamos passar bearer token (config no driver).
- **Email Marketing — métrica de Reuniões Agendadas via Calendly** usa janela de 24h após `sentAt`. Pode contar reuniões que não foram da campanha (qualquer reunião marcada nesse intervalo entra). Iterar pra cruzar com `EmailLink.clickedBy` no futuro.

## Rollback
Se o relatório enviar errado:
- [ ] Coolify CRM API: reverter para o commit anterior à migração (botão Redeploy commit anterior)
- [ ] A migration `001_ad_spend.sql` é idempotente (`CREATE TABLE IF NOT EXISTS`) — manter no Supabase é seguro mesmo após rollback
- [ ] Cron `dailyReportCron.ts` continua funcionando (chama `sendDailyReport` que ainda está exportada) — sem necessidade de alterar agendamento

## Arquivos novos/alterados
**Novos:**
- `packages/api/src/services/dailyReport/types.ts`
- `packages/api/src/services/dailyReport/index.ts`
- `packages/api/src/services/dailyReport/sections/funnelSection.ts`
- `packages/api/src/services/dailyReport/sections/paidTrafficSection.ts`
- `packages/api/src/services/dailyReport/sections/digitalChannelsSection.ts`
- `packages/api/src/services/metaAds/{client.ts,index.ts}`
- `packages/api/src/services/googleAds/{client.ts,index.ts}`
- `packages/api/src/services/bgpmassa/{client.ts,index.ts}`
- `packages/api/src/routes/googleAds.ts`
- `packages/api/src/scripts/previewDailyReport.ts`
- `packages/api/src/scripts/previewDailyReportMock.ts` (validação visual sem DB)
- `packages/api/prisma/migrations/manual/001_ad_spend.sql`

**Alterados:**
- `packages/api/prisma/schema.prisma` (adicionado `model AdSpend`)
- `packages/api/src/services/dailyReportService.ts` (delega geração de HTML para `buildDailyReportHtml()`)

**Status TypeScript estrito (validação OMEGA):**
- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0
