# Daily Report — Environment Variables

Variáveis necessárias para a Wave 2 do redesign do relatório das 7h.
Configurar no Coolify (CRM API) antes de habilitar as novas seções.

## Tráfego Pago — Meta Ads (via ContIA)

| Variável | Obrigatória | Exemplo | Descrição |
|----------|-------------|---------|-----------|
| `META_ADS_INTERNAL_API_URL` | sim | `https://contia.bertuzzipatrimonial.com.br` | URL base do ContIA. O CRM chama `${URL}/api/internal/meta-ads/insights`. |
| `META_ADS_INTERNAL_SECRET` | sim | `<random 64-byte hex>` | Shared secret entre CRM e ContIA. Vai no header `x-internal-secret`. Gerar com `openssl rand -hex 32`. Configurar a MESMA string nos dois lados. |
| `META_ADS_EMPRESA_ID` | sim | `uuid-bgpgo-no-contia` | UUID da empresa BGPGO dentro do ContIA (multi-tenant). |

## Tráfego Pago — Google Ads (placeholder + CSV)

| Variável | Obrigatória | Exemplo | Descrição |
|----------|-------------|---------|-----------|
| `GOOGLE_ADS_CSV_PATH` | sim | `/data/google-ads/` | Diretório (no container Coolify) onde o admin sobe o CSV diário. Squad Gamma define o formato esperado. |

## Canais Digitais — bgpmassa (Messenger)

| Variável | Obrigatória | Exemplo | Descrição |
|----------|-------------|---------|-----------|
| `BGPMASSA_API_URL` | sim | `https://messenger.bertuzzipatrimonial.com.br` | URL base do app bgpmassa. O CRM chama `${URL}/api/messages/daily-count`. |

## Email (envio do relatório)

| Variável | Obrigatória | Exemplo | Descrição |
|----------|-------------|---------|-----------|
| `RESEND_API_KEY` | sim (já existe) | `re_xxx` | Já configurada — usada hoje pelo `dailyReportService.ts`. Mantida. |

## Notas

- `META_ADS_INTERNAL_SECRET` é o ponto crítico de segurança: trate como senha, nunca commitar.
- Em desenvolvimento local, dá pra apontar `META_ADS_INTERNAL_API_URL` pra `http://localhost:3002` (porta do ContIA local).
- Se `BGPMASSA_API_URL` estiver vazio, o Squad Eta deve renderizar a subseção Messenger com "—".
