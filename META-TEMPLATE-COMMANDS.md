# Meta API — Comandos prontos pra submeter templates

> Data: 2026-05-11
> Pré-requisito: pegar o **access token** da `CloudWaConfig` (DB).
> WABA ID: `1362263822590219`

## Setup (uma vez por sessão)

```bash
# Token vem da CloudWaConfig.accessToken — não commitar
export META_TOKEN="EAAS..."  # cole aqui

export WABA_ID="1362263822590219"
```

---

## Parte 1 — Editar os 5 templates problemáticos

Edição de template precisa do **`template_id`** (não o nome). Pega via GET primeiro:

```bash
curl -sS -H "Authorization: Bearer $META_TOKEN" \
  "https://graph.facebook.com/v20.0/$WABA_ID/message_templates?fields=id,name,language,status,category&limit=100" \
  | jq '.data[] | select(.name | IN("cadencia_d4_prova","cadencia_d1_abertura","reuniao_d4_resultado","marcar_reuniao__quanto_deu_resultado","lembrete_reuniao_15min")) | {id,name,status,category}'
```

Anota os 5 IDs.

> **Atenção**: cada edit consome 1 de 10 edições/30d por template. Body pode ser editado mantendo categoria.

### Edit 1 — `marcar_reuniao__quanto_deu_resultado` (corrige frase incompleta)

```bash
TPL_ID="<id_do_marcar_reuniao>"
curl -sS -X POST "https://graph.facebook.com/v20.0/$TPL_ID" \
  -H "Authorization: Bearer $META_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "components": [
      {
        "type": "BODY",
        "text": "Você sabe exatamente quanto sua empresa lucrou no mês passado?\n\nNão o que entrou na conta. O lucro real — depois de fornecedor, folha, imposto, tudo.\n\nSe a resposta não saiu na hora, esse diagnóstico é pra você:"
      },
      {
        "type": "BUTTONS",
        "buttons": [
          { "type": "URL", "text": "Essa reunião é para você", "url": "https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp" }
        ]
      }
    ]
  }'
```

### Edit 2 — `cadencia_d1_abertura` (corrige ortografia + redundância)

```bash
TPL_ID="<id_do_cadencia_d1>"
curl -sS -X POST "https://graph.facebook.com/v20.0/$TPL_ID" \
  -H "Authorization: Bearer $META_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "components": [
      {
        "type": "BODY",
        "text": "Oi, {{1}}! Aqui é a Bia da Bertuzzi Patrimonial.\n\nVi que você se cadastrou para entender melhor os dados financeiros do seu negócio. Em 20 minutos de diagnóstico você já tem uma visão clara de onde estão os gargalos financeiros!",
        "example": { "body_text": [["Oliver"]] }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          { "type": "URL", "text": "Eu quero!", "url": "https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp" }
        ]
      }
    ]
  }'
```

### Edit 3 — `cadencia_d4_prova` (remove "BI" + suaviza claim)

```bash
TPL_ID="<id_do_cadencia_d4>"
curl -sS -X POST "https://graph.facebook.com/v20.0/$TPL_ID" \
  -H "Authorization: Bearer $META_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "components": [
      {
        "type": "BODY",
        "text": "Olá {{1}}, empresas que passaram pelo nosso diagnóstico identificaram em média 15% dos custos que passavam despercebidos nos primeiros 3 meses.\n\nQuero te mostrar em 20 minutos como isso se aplica ao seu negócio.",
        "example": { "body_text": [["Oliver"]] }
      },
      {
        "type": "BUTTONS",
        "buttons": [
          { "type": "URL", "text": "Quero ver", "url": "https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp" }
        ]
      }
    ]
  }'
```

### Edit 4 — `reuniao_d4_resultado` (remove R$ específico + urgência)

```bash
TPL_ID="<id_do_reuniao_d4>"
curl -sS -X POST "https://graph.facebook.com/v20.0/$TPL_ID" \
  -H "Authorization: Bearer $META_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "components": [
      {
        "type": "BODY",
        "text": "Olha {{1}}, na última reunião que fiz, o empresário identificou onde estava vazando dinheiro num processo que ele nem sabia que existia.\n\nUm diagnóstico de 20 minutos pode revelar isso no seu negócio também. Me manda um horário que eu reservo pra você.",
        "example": { "body_text": [["Oliver"]] }
      }
    ]
  }'
```

### Edit 5 — `lembrete_reuniao_15min` (stop-gap enquanto v2_utility não aprova)

```bash
TPL_ID="<id_do_lembrete_15min>"
curl -sS -X POST "https://graph.facebook.com/v20.0/$TPL_ID" \
  -H "Authorization: Bearer $META_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "components": [
      {
        "type": "BODY",
        "text": "Olá {{1}}, sua reunião com a Bertuzzi Patrimonial começa em 15 minutos (às {{2}}). Estamos te aguardando!\n\nCaso precise reagendar, responda aqui.",
        "example": { "body_text": [["Oliver", "15h00"]] }
      },
      { "type": "FOOTER", "text": "BGP — Gestão Patrimonial" }
    ]
  }'
```

---

## Parte 2 — Criar os 2 novos templates UTILITY

### Submit 1 — `lembrete_reuniao_60min_v2_utility` (cobre 60min + 1h)

```bash
curl -sS -X POST "https://graph.facebook.com/v20.0/$WABA_ID/message_templates" \
  -H "Authorization: Bearer $META_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "lembrete_reuniao_60min_v2_utility",
    "language": "pt_BR",
    "category": "UTILITY",
    "components": [
      {
        "type": "BODY",
        "text": "Olá {{1}}, sua reunião de Diagnóstico Financeiro com a Bertuzzi Patrimonial começa em 1 hora. ⏰\n\nData e horário: {{2}}\n\nCaso precise reagendar, responda aqui.",
        "example": { "body_text": [["Oliver", "11/05/2026 às 15h00"]] }
      },
      { "type": "FOOTER", "text": "BGP — Gestão Patrimonial" },
      {
        "type": "BUTTONS",
        "buttons": [
          { "type": "QUICK_REPLY", "text": "Confirmado!" },
          { "type": "QUICK_REPLY", "text": "Reagendar" }
        ]
      }
    ]
  }'
```

### Submit 2 — `lembrete_reuniao_15min_v2_utility`

```bash
curl -sS -X POST "https://graph.facebook.com/v20.0/$WABA_ID/message_templates" \
  -H "Authorization: Bearer $META_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "lembrete_reuniao_15min_v2_utility",
    "language": "pt_BR",
    "category": "UTILITY",
    "components": [
      {
        "type": "BODY",
        "text": "Olá {{1}}, sua reunião de Diagnóstico Financeiro com a Bertuzzi Patrimonial começa em 15 minutos. 🕐\n\nHorário: {{2}}\n\nEstamos te aguardando! Se precisar de ajuda para acessar, responda aqui.",
        "example": { "body_text": [["Oliver", "15h00"]] }
      },
      { "type": "FOOTER", "text": "BGP — Gestão Patrimonial" },
      {
        "type": "BUTTONS",
        "buttons": [
          { "type": "QUICK_REPLY", "text": "Confirmado!" },
          { "type": "QUICK_REPLY", "text": "Preciso de ajuda" }
        ]
      }
    ]
  }'
```

---

## Parte 3 — Após aprovação dos UTILITY (24h)

### 3.1 Sincronizar templates no DB do CRM

Já existe o job `wabaTemplateHealthCheck` que sincroniza. Rodar via endpoint:

```bash
curl -sS -X POST "https://api.bertuzzipatrimonial.com.br/api/wa/templates/health/run" \
  -H "Authorization: Bearer <CRM_TOKEN>"
```

Os novos templates aparecem em `CloudWaTemplate` com status APPROVED.

### 3.2 Atualizar `TEMPLATE_MAP` no código

Arquivo: `packages/api/src/services/wa/meetingReminderWaba.ts` (linha ~32)

```typescript
// DEPOIS
const TEMPLATE_MAP: Record<number, string[]> = {
  240: ['lembrete_reuniao_4h'],
  60:  ['lembrete_reuniao_60min_v2_utility', 'lembrete_reuniao_60min', 'lembrete_reuniao_1h'],
  15:  ['lembrete_reuniao_15min_v2_utility', 'lembrete_reuniao_15min'],
};
```

O sistema itera e usa o primeiro APPROVED → v2 vira default automaticamente, MARKETING vira fallback.

### 3.3 Remover MARKETING antigos (após 7 dias estáveis)

Tirar `lembrete_reuniao_60min`, `lembrete_reuniao_1h`, `lembrete_reuniao_15min` da lista (não deletar da Meta — só parar de usar).

---

## Critérios de sucesso (acompanhar via `GET /api/wa/templates/health`)

| Métrica | Alvo | Quando |
|---------|------|--------|
| 131049 nos 5 editados | < 5% | 7 dias após re-aprovação |
| 131049 nos lembretes v2 UTILITY | 0% | desde aprovação |
| Quality score editados | MEDIUM ou HIGH | 14 dias |

---

## Notas

- **Não submeta tudo de uma vez**. Faz os edits em sequência, espera ~5min entre cada um.
- Se um edit for rejeitado, a Meta retorna `error.error_user_msg` — ler e ajustar.
- `editsRemaining` = 10 por template em 30 dias. Conferir antes de re-editar:
  ```bash
  curl -sS -H "Authorization: Bearer $META_TOKEN" \
    "https://graph.facebook.com/v20.0/$WABA_ID/message_templates?name=cadencia_d4_prova&fields=name,status,quality_score"
  ```
- Quando submeter o appeal de YELLOW no Business Manager, **mencionar** que esses edits e os novos UTILITY estão em curso — fortalece a defesa.
