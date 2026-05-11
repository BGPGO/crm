# WABA — Revisão de Templates com Alta Taxa de Erro 131049

**Data:** 2026-05-11  
**Autor:** Squad Gamma (research + proposal)  
**Status:** Proposta — aguardando aprovação antes de qualquer submissão  
**Objetivo:** Forçar re-avaliação de quality score (edições leves) e migrar lembretes para categoria UTILITY  

---

## Contexto

O erro Meta `131049` (`template_quality_rejected`) ocorre quando o template tem
quality score baixo o suficiente para a Meta bloquear o envio — mesmo com status
APPROVED. Editar o template (mesmo mudança mínima) reseta o quality score e força
nova avaliação. Templates que acumulam reclamações de usuários (opt-out, bloquear)
são os mais suscetíveis.

Os 3 lembretes classificados como MARKETING estão bloqueados pelo **conversation cap
mensal** (131049 também cobre o limite de marketing por usuário). Migrá-los para
UTILITY resolve permanentemente — lembretes de reunião são info transacional.

---

## Conteúdo atual dos templates (saída do script — GET-only, 2026-05-11)

### `cadencia_d4_prova` (MARKETING)
```
[BODY]
Olá {{1}}, empresas que implementaram nosso BI reduziram em média 15% dos
custos operacionais nos primeiros 3 meses. 

Quero te mostrar em 20 minutos como isso se aplica ao seu negócio.

[BUTTON - URL]
"Quero ver" → https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp
```

### `cadencia_d1_abertura` (MARKETING)
```
[BODY]
Oi, {{1}}! Aqui e a Bia da Bertuzzi Patrimonial.

Vi que você se cadastrou para entender melhor os dados financeiros do teu
negócio. No nosso diagnóstico em 20 minutos voce já sai com uma visão clara
da saúde financeira do seu negócio!

[BUTTON - URL]
"Eu quero!" → https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp
```

### `reuniao_d4_resultado` (MARKETING)
```
[BODY]
Olha {{1}}, na última reunião que fiz, o empresário descobriu que estava
perdendo R$4 mil por mês num processo que ele nem sabia que existia.

Cada dia sem esse diagnóstico pode ser dinheiro saindo do seu caixa. Me manda
um horário que eu reservo pra você.
```

### `marcar_reuniao__quanto_deu_resultado` (MARKETING)
```
[BODY]
Você sabe exatamente quanto sua empresa lucrou no mês passado?

Não o que entrou na conta. O lucro real — depois de fornecedor, folha, imposto,
tudo.

Se a resposta demorou mais de 10s:

[BUTTON - URL]
"Essa reunião é para você" → https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp
```

### `lembrete_reuniao_15min` (MARKETING — também está na lista dos lembretes)
```
[BODY]
Olá {{1}}, sua reunião começa em 15 minutos (às {{2}}). Estamos te aguardando!

[FOOTER]
BGPGO
```

---

## Parte A — Edições leves nos 5 templates problemáticos

> Regra: a Meta permite editar o texto do body sem nova revisão de categoria —
> a mudança força re-avaliação do quality score zerando o histórico de
> reclamações vinculado àquela versão.

---

### 1. `cadencia_d4_prova`

**Taxa de falha:** 53,5% (43 msgs) — maior da lista

**Conteúdo atual (body):**
> Olá {{1}}, empresas que implementaram nosso BI reduziram em média 15% dos custos operacionais nos primeiros 3 meses.
>
> Quero te mostrar em 20 minutos como isso se aplica ao seu negócio.

**Hipótese do problema:** A palavra "BI" remete a software/produto genérico e pode
estar gerando alta taxa de opt-out em leads que esperavam algo diferente.
O número "15%" soa como claim inflado. Juntos, podem ter acumulado reclamações.

**Proposta de edição leve:**
> Olá {{1}}, empresas que passaram pelo nosso diagnóstico identificaram em média 15% dos custos que passavam despercebidos nos primeiros 3 meses.
>
> Quero te mostrar em 20 minutos como isso se aplica ao seu negócio.

**Mudanças:** "implementaram nosso BI reduziram" → "passaram pelo nosso diagnóstico identificaram"; "custos operacionais" → "custos que passavam despercebidos". Mantém botão e estrutura.

**Justificativa:** Remove "BI" (jargão de software) e alinha a linguagem ao
diagnóstico financeiro — produto que já aparece em todos os outros templates.
O lead reconhece o contexto. A mudança de "reduziram custos" para "identificaram custos" é mais honesta e menos agressiva em compliance Meta.

**Risco:** Baixo. Nenhuma das mudanças altera a natureza MARKETING do template
(ainda tem CTA + botão Calendly). Re-aprovação automática esperada em < 24h.

---

### 2. `cadencia_d1_abertura`

**Taxa de falha:** 16,1% (62 msgs) — maior volume absoluto

**Conteúdo atual (body):**
> Oi, {{1}}! Aqui e a Bia da Bertuzzi Patrimonial.
>
> Vi que você se cadastrou para entender melhor os dados financeiros do teu negócio. No nosso diagnóstico em 20 minutos voce já sai com uma visão clara da saúde financeira do seu negócio!

**Hipótese do problema:** Texto tem dois erros ortográficos ("Aqui e a Bia" sem "é";
"voce" sem acento). A Meta usa sinais de qualidade linguística. Além disso,
"saúde financeira do seu negócio" aparece duas vezes no mesmo parágrafo — redundância
que pode sinalizar template de baixa qualidade.

**Proposta de edição leve:**
> Oi, {{1}}! Aqui é a Bia da Bertuzzi Patrimonial.
>
> Vi que você se cadastrou para entender melhor os dados financeiros do seu negócio. Em 20 minutos de diagnóstico você já tem uma visão clara de onde estão os gargalos financeiros!

**Mudanças:** Corrige "e a Bia" → "é a Bia"; "teu" → "seu"; "voce" → "você"; remove redundância "saúde financeira do seu negócio" final; reformula frase para não repetir o mesmo objeto duas vezes.

**Justificativa:** Correções ortográficas melhoram a percepção de qualidade e
credibilidade da mensagem. A Meta pode penalizar mensagens com erros evidentes.
Nenhuma alteração de CTA ou proposta de valor.

**Risco:** Muito baixo. São apenas correções de texto e reformulação de frase.
Categoria MARKETING mantida.

---

### 3. `reuniao_d4_resultado`

**Taxa de falha:** 28,6% (7 msgs)

**Conteúdo atual (body):**
> Olha {{1}}, na última reunião que fiz, o empresário descobriu que estava perdendo R$4 mil por mês num processo que ele nem sabia que existia.
>
> Cada dia sem esse diagnóstico pode ser dinheiro saindo do seu caixa. Me manda um horário que eu reservo pra você.

**Hipótese do problema:** "R$4 mil por mês" é um número específico que pode parecer
apelativo/manipulativo para a Meta — "urgent language" ou "financial claim" são
gatilhos de quality review. "Cada dia sem isso" reforça urgência artificial.

**Proposta de edição leve:**
> Olha {{1}}, na última reunião que fiz, o empresário identificou onde estava vazando dinheiro num processo que ele nem sabia que existia.
>
> Um diagnóstico de 20 minutos pode revelar isso no seu negócio também. Me manda um horário que eu reservo pra você.

**Mudanças:** Remove "R$4 mil por mês" (claim financeiro específico); remove "Cada dia sem esse diagnóstico pode ser dinheiro saindo" (urgência artificial); substitui por convite direto sem pressão temporal.

**Justificativa:** Claims financeiros específicos ("R$4 mil/mês") combinados com
urgência ("cada dia que passa") são padrões que a Meta identifica como pushy. 
A versão proposta mantém o storytelling de prova mas sem números absolutos.

**Risco:** Baixo-médio. O template continua claramente MARKETING. O risco é que
sem o "R$4 mil" o template perca impacto — avaliar A/B se taxa de conversão cair.

---

### 4. `marcar_reuniao__quanto_deu_resultado`

**Taxa de falha:** 15,3% (196 msgs) — maior volume da lista inteira

**Conteúdo atual (body):**
> Você sabe exatamente quanto sua empresa lucrou no mês passado?
>
> Não o que entrou na conta. O lucro real — depois de fornecedor, folha, imposto, tudo.
>
> Se a resposta demorou mais de 10s:
>
> [BUTTON] "Essa reunião é para você"

**Hipótese do problema:** Template termina com frase incompleta ("Se a resposta
demorou mais de 10s:") — parece um erro de edição. A Meta pode penalizar templates
com estrutura quebrada. Além disso, 196 envios com 15,3% de fail = ~30 falhas
reais, que acumulam como sinal negativo de engajamento.

**Proposta de edição leve:**
> Você sabe exatamente quanto sua empresa lucrou no mês passado?
>
> Não o que entrou na conta. O lucro real — depois de fornecedor, folha, imposto, tudo.
>
> Se a resposta não saiu na hora, esse diagnóstico é pra você:

**Mudanças:** Completa a frase incompleta ("Se a resposta demorou mais de 10s:" →
"Se a resposta não saiu na hora, esse diagnóstico é pra você:"). Mantém o botão e
toda a estrutura.

**Justificativa:** Template com frase incompleta é sinal técnico de má qualidade —
pode estar gerando 131049 pura e simplesmente pela estrutura quebrada. A correção
é cirúrgica: 1 frase alterada, nenhuma mudança de tom ou proposta.

**Risco:** Muito baixo. A mudança resolve um bug de edição. Template continua
MARKETING com mesmo botão.

---

### 5. `lembrete_reuniao_15min`

**Taxa de falha:** 28,6% (14 msgs) — classificado como MARKETING (deveria ser UTILITY)

**Conteúdo atual (body):**
> Olá {{1}}, sua reunião começa em 15 minutos (às {{2}}). Estamos te aguardando!
>
> [FOOTER] BGPGO

**Hipótese do problema:** Conteúdo é claramente UTILITY (lembrete transacional),
mas está cadastrado como MARKETING — por isso consome cota de marketing e está
sujeito ao conversation cap 131049. A edição leve serve como stop-gap enquanto
o novo template UTILITY v2 não é aprovado.

**Proposta de edição leve (stop-gap):**
> Olá {{1}}, sua reunião com a Bertuzzi Patrimonial começa em 15 minutos (às {{2}}). Estamos te aguardando!
>
> Caso precise reagendar, responda aqui.
>
> [FOOTER] BGP — Gestão Patrimonial

**Mudanças:** Adiciona "com a Bertuzzi Patrimonial" para dar mais contexto;
adiciona linha "Caso precise reagendar, responda aqui." (elemento tipicamente
UTILITY); atualiza footer de "BGPGO" para "BGP — Gestão Patrimonial".

**Justificativa:** Edição leve enquanto `lembrete_reuniao_15min_v2_utility` aguarda
aprovação Meta. A linha de reagendamento é padrão de template UTILITY e pode
reduzir reclamações (o usuário sabe que pode responder).

**Risco:** Baixo. Template ainda será MARKETING (categoria não muda com edição).
A solução definitiva é o v2 UTILITY descrito na Parte B.

---

## Parte B — Propostas UTILITY para os lembretes

> Regra Meta: não é possível mudar a categoria de um template existente.
> É necessário criar um novo template com nome diferente e categoria UTILITY.
> O código atual deve ser atualizado para apontar para o novo nome.
> Os templates MARKETING antigos devem ser mantidos por 7 dias como fallback.

---

### Análise dos templates atuais de lembrete

| Template | Categoria atual | Body atual |
|---|---|---|
| `lembrete_reuniao_4h` | **UTILITY** ✅ | "Oi {{1}}! Lembrete: sua reunião de Diagnóstico Financeiro com a Bertuzzi Patrimonial é daqui a 4 horas. 🕓 Nos vemos em breve! Caso precise reagendar, é só responder aqui." + botões Confirmado!/Reagendar |
| `lembrete_reuniao_60min` | MARKETING ❌ | "Olá {{1}}, sua reunião de Diagnóstico Financeiro com a Bertuzzi Patrimonial é daqui a 1 hora. ⏰ Nos vemos em breve! Caso precise reagendar, é só responder aqui." |
| `lembrete_reuniao_1h` | MARKETING ❌ | "Olá {{1}}, sua reunião está marcada para hoje às {{2}} (falta 1 hora). Te esperamos!" |
| `lembrete_reuniao_15min` | MARKETING ❌ | "Olá {{1}}, sua reunião começa em 15 minutos (às {{2}}). Estamos te aguardando!" |

**Observação importante:** `lembrete_reuniao_4h` já está aprovado como UTILITY e
tem o formato ideal (botões de confirmação/reagendamento). Os novos templates v2
seguirão o mesmo padrão.

---

### Proposta UTILITY: `lembrete_reuniao_60min_v2_utility`

**Conteúdo proposto:**
```
[BODY]
Olá {{1}}, sua reunião de Diagnóstico Financeiro com a Bertuzzi Patrimonial
começa em 1 hora. ⏰

Data e horário: {{2}}

Caso precise reagendar, responda aqui.

[FOOTER]
BGP — Gestão Patrimonial

[BUTTONS]
- QUICK_REPLY: "Confirmado!"
- QUICK_REPLY: "Reagendar"
```

**Variáveis:**
- `{{1}}` = nome do contato
- `{{2}}` = data + horário formatados (ex: "11/05/2026 às 15h00")

**Por que passa como UTILITY:** Comunica exclusivamente um fato operacional
(horário da reunião agendada). Sem benefícios, sem CTA promocional, sem
"venha conhecer", sem "oportunidade". Os botões são de confirmação/reagendamento —
ação sobre o próprio serviço contratado.

**Plano de transição:**
1. Submeter o novo template via API (ver payload na Parte C)
2. Aguardar aprovação Meta (~24h)
3. Atualizar `TEMPLATE_MAP` em `packages/api/src/services/wa/meetingReminderWaba.ts`:
   - Linha `60: ['lembrete_reuniao_60min', 'lembrete_reuniao_1h']`
   - → `60: ['lembrete_reuniao_60min_v2_utility', 'lembrete_reuniao_60min', 'lembrete_reuniao_1h']`
   - O sistema já itera pela lista e usa o primeiro APPROVED — o novo virá primeiro
4. Após 7 dias de operação estável, remover `lembrete_reuniao_60min` e `lembrete_reuniao_1h` da lista

---

### Proposta UTILITY: `lembrete_reuniao_1h_v2_utility`

> Nota: `lembrete_reuniao_1h` e `lembrete_reuniao_60min` cobrem o mesmo slot (60min antes).
> O código em `meetingReminderWaba.ts` já os trata como candidatos intercambiáveis para o step 60.
> Um único novo template UTILITY resolve ambos.
> Se preferir manter separados por histórico, use `lembrete_reuniao_60min_v2_utility` — veja acima.

Este template (`lembrete_reuniao_1h_v2_utility`) é opcional se o 60min_v2_utility for aprovado.

**Conteúdo proposto (alternativo com menos variáveis):**
```
[BODY]
Olá {{1}}! Lembrete: sua reunião de Diagnóstico Financeiro com a Bertuzzi
Patrimonial é daqui a 1 hora.

Caso precise reagendar, responda aqui.

[FOOTER]
BGP — Gestão Patrimonial

[BUTTONS]
- QUICK_REPLY: "Confirmado!"
- QUICK_REPLY: "Reagendar"
```

**Variáveis:**
- `{{1}}` = nome do contato

**Por que passa como UTILITY:** Mesmo critério — lembrete puro, sem promoção.

---

### Proposta UTILITY: `lembrete_reuniao_15min_v2_utility`

**Conteúdo proposto:**
```
[BODY]
Olá {{1}}, sua reunião de Diagnóstico Financeiro com a Bertuzzi Patrimonial
começa em 15 minutos. 🕐

Horário: {{2}}

Estamos te aguardando! Se precisar de ajuda para acessar, responda aqui.

[FOOTER]
BGP — Gestão Patrimonial

[BUTTONS]
- QUICK_REPLY: "Confirmado!"
- QUICK_REPLY: "Preciso de ajuda"
```

**Variáveis:**
- `{{1}}` = nome do contato
- `{{2}}` = horário da reunião (ex: "15h00")

**Por que passa como UTILITY:** Último lembrete antes da reunião — informação
operacional pura. Botão "Preciso de ajuda" substitui opt-out por canal de
suporte — reduz reclamações e é padrão UTILITY.

**Plano de transição:**
1. Submeter o novo template via API (ver payload na Parte C)
2. Aguardar aprovação Meta (~24h)
3. Atualizar `TEMPLATE_MAP` em `packages/api/src/services/wa/meetingReminderWaba.ts`:
   - Linha `15: ['lembrete_reuniao_15min']`
   - → `15: ['lembrete_reuniao_15min_v2_utility', 'lembrete_reuniao_15min']`
4. Após 7 dias estável, remover `lembrete_reuniao_15min` da lista

---

## Parte C — Payloads para submissão Meta API (não enviar ainda)

> Estes payloads são apenas para referência. Submeter somente após aprovação
> interna. Endpoint: `POST https://graph.facebook.com/v20.0/{wabaId}/message_templates`
> Header: `Authorization: Bearer {accessToken}`

---

### Payload 1: `lembrete_reuniao_60min_v2_utility`

```json
{
  "name": "lembrete_reuniao_60min_v2_utility",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Olá {{1}}, sua reunião de Diagnóstico Financeiro com a Bertuzzi Patrimonial começa em 1 hora. ⏰\n\nData e horário: {{2}}\n\nCaso precise reagendar, responda aqui.",
      "example": {
        "body_text": [["Oliver", "11/05/2026 às 15h00"]]
      }
    },
    {
      "type": "FOOTER",
      "text": "BGP — Gestão Patrimonial"
    },
    {
      "type": "BUTTONS",
      "buttons": [
        { "type": "QUICK_REPLY", "text": "Confirmado!" },
        { "type": "QUICK_REPLY", "text": "Reagendar" }
      ]
    }
  ]
}
```

---

### Payload 2: `lembrete_reuniao_15min_v2_utility`

```json
{
  "name": "lembrete_reuniao_15min_v2_utility",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Olá {{1}}, sua reunião de Diagnóstico Financeiro com a Bertuzzi Patrimonial começa em 15 minutos. 🕐\n\nHorário: {{2}}\n\nEstamos te aguardando! Se precisar de ajuda para acessar, responda aqui.",
      "example": {
        "body_text": [["Oliver", "15h00"]]
      }
    },
    {
      "type": "FOOTER",
      "text": "BGP — Gestão Patrimonial"
    },
    {
      "type": "BUTTONS",
      "buttons": [
        { "type": "QUICK_REPLY", "text": "Confirmado!" },
        { "type": "QUICK_REPLY", "text": "Preciso de ajuda" }
      ]
    }
  ]
}
```

---

### Payload 3: `lembrete_reuniao_1h_v2_utility` (opcional)

```json
{
  "name": "lembrete_reuniao_1h_v2_utility",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Olá {{1}}! Lembrete: sua reunião de Diagnóstico Financeiro com a Bertuzzi Patrimonial é daqui a 1 hora.\n\nCaso precise reagendar, responda aqui.",
      "example": {
        "body_text": [["Oliver"]]
      }
    },
    {
      "type": "FOOTER",
      "text": "BGP — Gestão Patrimonial"
    },
    {
      "type": "BUTTONS",
      "buttons": [
        { "type": "QUICK_REPLY", "text": "Confirmado!" },
        { "type": "QUICK_REPLY", "text": "Reagendar" }
      ]
    }
  ]
}
```

---

## Parte D — Plano de execução (1 página)

### Visão geral

```
Wave 1 (hoje)    → Edições leves nos 5 templates problemáticos
Wave 2 (hoje)    → Submissão dos 2 novos templates UTILITY (60min + 15min)
Wave 3 (~24h)    → Re-aprovação dos editados + aprovação dos novos UTILITY
Wave 4 (~26h)    → Código: TEMPLATE_MAP atualizado + deploy
Wave 5 (+7d)     → Remoção dos templates MARKETING antigos de lembretes do código
```

---

### Passo a passo

**1. Edições leves — 5 templates problemáticos** (estimativa: 1h de trabalho)

Usar o painel Meta Business Manager ou a API
`POST /v20.0/{templateId}` com o body alterado.
Re-aprovação automática esperada em até 24h (normalmente minutos).

Ordem recomendada (prioridade por taxa × volume):
1. `marcar_reuniao__quanto_deu_resultado` — corrige frase incompleta (bug óbvio)
2. `cadencia_d1_abertura` — corrige erros ortográficos
3. `cadencia_d4_prova` — remove claim "BI" e número absoluto
4. `reuniao_d4_resultado` — suaviza urgência financeira
5. `lembrete_reuniao_15min` — stop-gap enquanto v2_utility aguarda aprovação

**2. Submissão dos novos templates UTILITY** (estimativa: 30min)

Usar os payloads da Parte C.
Submeter em sequência:
1. `lembrete_reuniao_60min_v2_utility`
2. `lembrete_reuniao_15min_v2_utility`

Aprovação UTILITY costuma levar 24h mas pode ser automática se conteúdo for
claramente transacional.

**3. Após aprovação — atualizar código**

Arquivo principal:
`packages/api/src/services/wa/meetingReminderWaba.ts`

Bloco a alterar (linha ~32):
```typescript
// ANTES
const TEMPLATE_MAP: Record<number, string[]> = {
  240: ['lembrete_reuniao_4h'],
  60: ['lembrete_reuniao_60min', 'lembrete_reuniao_1h'],
  15: ['lembrete_reuniao_15min'],
};

// DEPOIS (v2_utility no início da lista — prioridade)
const TEMPLATE_MAP: Record<number, string[]> = {
  240: ['lembrete_reuniao_4h'],
  60: ['lembrete_reuniao_60min_v2_utility', 'lembrete_reuniao_60min', 'lembrete_reuniao_1h'],
  15: ['lembrete_reuniao_15min_v2_utility', 'lembrete_reuniao_15min'],
};
```

O sistema já itera pelos candidatos e usa o primeiro com status APPROVED no banco.
Enquanto o v2 não estiver no banco local, cai para o fallback antigo.

Adicionar os novos templates ao banco local (CloudWaTemplate):
- Rodar sync de templates ou inserir manualmente via painel CRM → WABA → Templates

**4. Manter backups 7 dias**

Os templates MARKETING antigos (`lembrete_reuniao_15min`, `lembrete_reuniao_60min`,
`lembrete_reuniao_1h`) devem permanecer como fallback na lista por pelo menos 7
dias após o v2_utility entrar em produção.

Após 7 dias sem erros 131049 nos lembretes, remover as entradas antigas da lista
`TEMPLATE_MAP` (não precisa deletar da Meta — apenas parar de usar).

---

### Critérios de sucesso

| Métrica | Alvo | Período |
|---|---|---|
| Taxa de erro 131049 nos 5 templates editados | < 5% | 7 dias após re-aprovação |
| Taxa de erro 131049 nos lembretes (v2 utility) | 0% | logo após aprovação |
| Quality score nos templates editados | MEDIUM ou HIGH | 14 dias |
| Volume de envios bem-sucedidos (lembretes) | ≥ 95% | 7 dias |

---

### Arquivos do código que precisam ser alterados (apenas na Wave 4)

| Arquivo | O que muda |
|---|---|
| `packages/api/src/services/wa/meetingReminderWaba.ts` | `TEMPLATE_MAP`: adicionar `_v2_utility` no início das listas de 60 e 15min |
| `packages/api/src/seeds/meetingReminderTemplates.ts` | Adicionar definições dos novos templates para sync local (opcional — pode inserir via painel) |

Nenhum outro arquivo de produção precisa ser alterado.

---

*Gerado por Squad Gamma em 2026-05-11 — somente leitura e proposta, sem submissões ou modificações no banco.*
