# Daily Report — Contratos das Rotas Internas

Specs das rotas que outros serviços expõem para o CRM consumir na Wave 2.
Este documento define **o contrato**, não a implementação.

---

## ContIA — `GET /api/internal/meta-ads/insights`

**Implementador**: Squad Beta (no repo ContIA, fora desta wave).
**Consumidor**: `packages/api/src/services/metaAds/client.ts` no CRM.

### Headers

| Header | Valor | Obrigatório |
|--------|-------|-------------|
| `x-internal-secret` | `${META_ADS_INTERNAL_SECRET}` | sim |
| `Accept` | `application/json` | sim |

### Query params

| Param | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `date` | `YYYY-MM-DD` | sim* | Single day. *Mutuamente exclusivo com `date_start`/`date_end`. |
| `date_start` | `YYYY-MM-DD` | sim* | Início do range (MTD = primeiro dia do mês). |
| `date_end` | `YYYY-MM-DD` | sim* | Fim do range. |
| `empresa_id` | `uuid` | sim | `${META_ADS_EMPRESA_ID}`. ContIA é multi-tenant. |

### Response 200

```json
{
  "date": "2026-04-24",
  "totalSpend": 377.77,
  "totalLeads": 6,
  "currency": "BRL",
  "campaigns": [
    {
      "id": "120203456789012345",
      "name": "AZ|BI|CADASTRO|Lal-venda-LP-nova",
      "spend": 30.36,
      "impressions": 0,
      "clicks": 0,
      "leads": 3,
      "conversionValue": 0
    }
  ],
  "monthToDate": {
    "spend": 10834.33,
    "leads": 276
  }
}
```

Notas:
- `monthToDate` é calculado por ContIA pra evitar 2 round-trips. Sempre referente ao mês de `date` (ou `date_end` se range).
- `campaigns[].id` = ID da campanha no Meta Ads (string).
- `currency` é informativa — valores já em BRL.

### Response 401 — Secret inválido

```json
{ "error": "Secret inválido" }
```

### Response 503 — Token Meta expirado / API down

```json
{ "error": "Token Meta expirado ou Meta Marketing API indisponível", "retry_after_seconds": 300 }
```

CRM deve tratar 503 como erro temporário: ler `ad_spend` como fallback e marcar a seção do email como "dado defasado".

### Response 429 — Rate limit

```json
{ "error": "Rate limit ContIA atingido", "retry_after_seconds": 60 }
```

---

## bgpmassa — `GET /api/messages/daily-count`

**Implementador**: Squad Delta (no repo bgpmassa, fora desta wave).
**Consumidor**: `packages/api/src/services/bgpmassa/client.ts` no CRM.

### Auth

Sem auth — segue padrão público de `/api/bgp-os/stats` no bgpmassa.
A rota deve permitir CORS pro domínio do CRM ou ser chamada server-to-server.

### Query params

| Param | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `date` | `YYYY-MM-DD` | sim | Dia em BRT. |

### Response 200

```json
{
  "date": "2026-04-24",
  "inbound": 467,
  "outbound": 161,
  "total": 628
}
```

Notas:
- `total === inbound + outbound` (validar no cliente; se diferir, logar warning).
- Contagem do dia em America/Sao_Paulo (00:00 BRT até 23:59:59 BRT).

### Response 4xx / 5xx

Qualquer erro: cliente CRM faz fallback "—" na seção Messenger (Squad Eta).

---

## Próximos passos

1. **Squad Beta** implementa a rota no ContIA seguindo este contrato.
2. **Squad Delta** implementa a rota no bgpmassa seguindo este contrato.
3. **Squad Gamma** define formato do CSV em `ENV_VARS.md` quando começar.
4. **Squad Epsilon** refatora `dailyReportService.ts` em paralelo, usando `ReportSection`.
