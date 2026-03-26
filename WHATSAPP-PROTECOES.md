# Proteções Anti-Ban WhatsApp

> **Contexto**: Em 2026-03-26 a conta do WhatsApp (Z-API) foi banida após rodar cadências
> automatizadas sem throttling. Este documento descreve todas as proteções implementadas
> para evitar que isso aconteça novamente.

---

## 1. Visão Geral — Canais de Envio

O sistema tem **5 canais** que enviam mensagens proativas pelo WhatsApp:

| Canal | Arquivo | Quando dispara |
|-------|---------|----------------|
| **Cadências** | `automationEngine.ts` → `automationActions.ts` | Cron a cada 60s processa enrollments pendentes |
| **Follow-up do bot** | `followUpScheduler.ts` → `whatsappFollowUp.ts` | setTimeout event-driven após bot enviar msg |
| **Campanhas** | `whatsapp-campaigns.ts` | Manual — operador clica "Iniciar" |
| **Reminders de reunião** | `meetingReminderScheduler.ts` | setTimeout X minutos antes da reunião |
| **Reminders backup** | `automationCron.ts` → `processOverdueReminders()` | Cron a cada 60s (rede de segurança) |

Todos compartilham o **mesmo limite diário** controlado pelo `dailyLimitService.ts`.

---

## 2. Matriz de Proteções por Canal

| Proteção | Cadências | Follow-up bot | Campanhas | Reminders | Reminder backup |
|----------|-----------|---------------|-----------|-----------|-----------------|
| `canSend()` (limite diário) | Engine + Actions | Scheduler | Sim | Sim | Sim |
| `registerSent()` (contagem) | Actions | Scheduler | Sim | Sim | Sim |
| Business hours (8h-18h seg-sex) | Sim | Sim | Sim | Nao* | Nao* |
| Opt-out check | Sim | Sim | Sim | Sim | Sim |
| Contato frio (max 5 msgs) | Sim | Sim | Nao | N/A | N/A |
| Delay entre envios | 30-90s aleatorio | Event-driven | 25-120s aleatorio | N/A | N/A |
| Cap por lote/ciclo | Max 10/ciclo | 1 por vez | 12-25 por lote | N/A | N/A |
| Anti-duplicacao | Atomic claim | Race guard | Optimistic lock | SENT atomico | SENT atomico |

> *Reminders de reuniao nao checam business hours de proposito — um lembrete as 7h da manha e legitimo.

---

## 3. Limite Diario e Warmup

### Servico: `dailyLimitService.ts`

Controla o volume total de mensagens proativas por dia (timezone Brasilia).
Armazena na tabela `whatsAppDailyVolume` com campos: `campaign`, `followUp`, `reminder`, `total`.

### Progressao do Warmup

Ativado automaticamente quando `cadenceEnabled` ou `followUpEnabled` sao ligados
(via `whatsapp-config.ts`). Dados no `WhatsAppConfig`:

| Campo | Descricao |
|-------|-----------|
| `warmupEnabled` | Liga/desliga o warmup |
| `warmupStartDate` | Data de inicio (definida automaticamente) |
| `dailyMessageLimit` | Limite final apos warmup (default 200) |

**Faixas progressivas** (conservadoras, ajustadas apos o ban):

| Periodo | Limite/dia | Logica |
|---------|-----------|--------|
| Dia 0 (mesmo dia) | 10 | Conta recem-criada |
| Dias 1-3 | 10 | Aquecimento inicial |
| Dias 4-7 | 25 | Primeira semana |
| Dias 8-14 | 50 | Segunda semana |
| Dias 15-21 | 80 | Terceira semana |
| Dias 22-30 | 120 | Quarto semana |
| Dias 31-45 | 160 | Consolidacao |
| Dia 46+ | `dailyMessageLimit` | Limite configurado (default 200) |

> **IMPORTANTE**: Os limites anteriores (20→50→100→200→400) eram agressivos demais
> e contribuiram para o ban. Os novos limites sao ~60% menores.

### API do servico

```typescript
canSend(): Promise<boolean>       // true se volume.total < limite do dia
registerSent(source): Promise<void> // incrementa campaign|followUp|reminder + total
getDailyLimit(): Promise<number>  // retorna limite atual baseado no warmup
getRemainingToday(): Promise<number> // limite - total
```

---

## 4. Throttle nas Cadencias

### Problema original

O `automationEngine.ts` processava TODOS os enrollments pendentes a cada tick do cron (60s).
Se 50 leads tinham `nextActionAt <= now`, os 50 disparavam em < 1 segundo — rajada
que o WhatsApp detecta como spam.

### Solucao implementada (`automationEngine.ts`)

```
Constantes:
  WHATSAPP_MAX_PER_CYCLE = 10   // max WhatsApp por tick do cron
  WHATSAPP_MIN_DELAY_S   = 30   // delay minimo entre envios
  WHATSAPP_MAX_DELAY_S   = 90   // delay maximo entre envios
```

**Fluxo por ciclo do cron:**

1. Busca todos enrollments com `nextActionAt <= now`
2. Claim atomico: empurra `nextActionAt` 5min pro futuro
3. Para cada enrollment:
   - Se nao e WhatsApp → executa normalmente (sem delay)
   - Se e WhatsApp:
     a. Checa `canSend()` → se esgotou, reagenda pra 8h do dia seguinte
     b. Se ja enviou `WHATSAPP_MAX_PER_CYCLE` neste ciclo → reagenda com delay aleatorio
     c. Se nao e o primeiro do ciclo → `sleep(30-90s)` antes de enviar
     d. Executa a action
     e. Incrementa contador do ciclo

**Resultado**: Maximo 10 WhatsApp por minuto, com 30-90s entre cada.

---

## 5. Protecao de Contato Frio

### Problema

Enviar mensagens para contatos que **nunca responderam** e o maior fator de ban.
O WhatsApp interpreta como spam quando voce manda varias mensagens sem resposta.

### Solucao

Implementada em 3 pontos:

1. **`automationActions.ts` → `sendWhatsApp()`**: antes de enviar, verifica se existe
   alguma mensagem com `sender: 'CLIENT'` na conversa. Se nao existe e ja foram enviadas
   5+ mensagens de bot/humano → retorna `success: false` com motivo "Cold contact".

2. **`automationActions.ts` → `sendWhatsAppAI()`**: mesma logica acima.

3. **`followUpScheduler.ts` → `executeFollowUp()`**: antes de enviar follow-up, mesma
   checagem. Se contato frio com 5+ msgs → cancela todos os follow-ups pendentes.

### Limites

- **Threshold**: 5 mensagens enviadas (BOT + HUMAN) sem nenhuma resposta do CLIENT
- Contagem por conversa (`whatsAppConversation`)
- **Nao se aplica** a reminders de reuniao (reuniao ja confirmada = contexto diferente)
- **Nao se aplica** a campanhas (decisao do operador)

---

## 6. Campanhas — Protecoes Existentes

As campanhas (`whatsapp-campaigns.ts`) ja tinham boas protecoes antes do ban:

- **Delay aleatorio entre mensagens**:
  - 25-45s (60% das mensagens)
  - 45-75s (30% das mensagens)
  - 75-120s (10% das mensagens)
- **Pausa por lote**: 3-10 minutos apos cada lote de 12-25 mensagens
- **Circuit breaker**: 5 erros consecutivos = pausa a campanha
- **`canSend()`/`registerSent()`**: respeitam limite diario
- **Business hours**: nao inicia fora do horario
- **Opt-out**: pula contatos que fizeram opt-out
- **Personalizacao**: templates com `{{name}}`, `{{company}}`, `{{email}}`

---

## 7. Follow-up do Bot — Arquitetura

### Por que existem 2 arquivos?

| Arquivo | Papel |
|---------|-------|
| `followUpScheduler.ts` | **Orquestrador** — decide QUANDO enviar. Gerencia timeouts, checa limites, agenda/cancela |
| `whatsappFollowUp.ts` | **Executor** — COMO enviar. Gera mensagem via OpenAI, envia via Z-API, salva no historico |

O scheduler chama `sendFollowUp()` do whatsappFollowUp. Sao complementares, nao duplicados.

### Fluxo

1. Bot envia mensagem → chama `scheduleNextFollowUp(conversationId)`
2. Scheduler carrega steps de follow-up (CASUAL → REFORCO → ENCERRAMENTO)
3. Cria registros no banco para visibilidade no frontend
4. Seta `setTimeout` para o proximo step
5. Quando o timeout dispara → `executeFollowUp()`:
   - Re-checa estado (lead respondeu? opt-out? meeting? human attention?)
   - Checa contato frio (max 5 msgs sem resposta)
   - Checa business hours
   - Checa `canSend()`
   - Chama `sendFollowUp()` → gera msg via OpenAI → envia via Z-API
   - Registra `registerSent('followUp')`
   - Agenda o proximo step

### Interrupcoes automaticas

- **Lead responde** → `interruptCadenceOnResponse()` pausa cadencia, bot assume
- **Muda de etapa** → `interruptCadenceOnStageChange()` cancela cadencias da etapa anterior
- **Meeting booked** → scheduler para de enviar
- **Human attention** → scheduler para de enviar
- **Opt-out** → scheduler para de enviar

---

## 8. Reminders de Reuniao

### Scheduler principal (`meetingReminderScheduler.ts`)

- Agenda lembretes via `setTimeout` baseado em `minutesBefore` da reuniao
- Steps configuráveis no banco (`meetingReminderStep`)
- Defaults: 4h antes, 1h antes, 15min antes
- Templates com `{{nome}}`, `{{data}}`, `{{hora}}`, `{{falta}}`

### Cron backup (`automationCron.ts` → `processOverdueReminders`)

- Roda a cada 60s como rede de seguranca
- Pega reminders PENDING vencidos e FAILED (apos 5min)
- Verifica Z-API conectada antes de tentar
- Anti-duplicacao: marca SENT antes de enviar

### Protecoes

- `canSend()`/`registerSent('reminder')` em ambos
- Opt-out check
- Verifica se reuniao ainda esta ativa
- Verifica se reuniao nao passou
- **NAO checa business hours** (intencional — lembrete as 7h e valido)
- **NAO checa contato frio** (reuniao confirmada = contexto diferente)

---

## 9. Warmup Automatico

Ao ativar `cadenceEnabled` ou `followUpEnabled` pela primeira vez (via PUT `/api/whatsapp/config`),
o sistema automaticamente:

1. Seta `warmupEnabled = true`
2. Seta `warmupStartDate = new Date()`

Isso garante que nenhuma conta nova comece enviando 200 msgs/dia.

**Condicao**: so ativa se `warmupEnabled === false` E `warmupStartDate === null`.
Se o warmup ja foi completado e desativado manualmente, nao reativa.

---

## 10. Dashboard de Status

O endpoint `GET /api/whatsapp/status` retorna todas as metricas:

```json
{
  "daily": {
    "limit": 50,
    "used": 23,
    "remaining": 27,
    "breakdown": { "campaign": 0, "followUp": 18, "reminder": 5 }
  },
  "warmup": {
    "enabled": true,
    "startDate": "2026-03-26T...",
    "currentDay": 3,
    "currentLimit": 10,
    "phase": "Dias 1-3"
  },
  "protections": {
    "businessHours": true,
    "dailyLimit": true,
    "warmupActive": true,
    "optOutEnabled": true,
    "circuitBreaker": true,
    "randomDelay": true
  }
}
```

---

## 11. Checklist para Nova Conta WhatsApp

Ao conectar um numero novo:

1. Verificar que `warmupEnabled = true` e `warmupStartDate` e a data de hoje
2. Manter `cadenceEnabled = false` nos primeiros 3 dias (so follow-ups manuais)
3. Enviar mensagens para contatos que JA responderam antes (contatos quentes)
4. Na primeira semana, maximo 10-25 msgs/dia
5. Monitorar denuncias no painel do Z-API
6. So ativar cadencias apos dia 7+
7. Evitar templates identicos para muitos contatos — preferir `SEND_WHATSAPP_AI`

---

## 12. Arquivos Relevantes

| Arquivo | O que faz |
|---------|-----------|
| `services/dailyLimitService.ts` | Controle de volume diario + warmup |
| `services/automationEngine.ts` | Motor de cadencias com throttle |
| `services/automationActions.ts` | Actions de envio (WhatsApp, email, etc) |
| `services/followUpScheduler.ts` | Orquestrador de follow-ups do bot |
| `services/whatsappFollowUp.ts` | Gerador/executor de follow-ups |
| `services/meetingReminderScheduler.ts` | Agendador de lembretes de reuniao |
| `jobs/automationCron.ts` | Cron do engine + backup de reminders |
| `jobs/warmupJob.ts` | Log diario do warmup (00:05) |
| `routes/whatsapp-campaigns.ts` | Envio de campanhas com throttle |
| `routes/whatsapp-config.ts` | Config + auto-ativacao do warmup |
| `routes/whatsapp-status.ts` | Dashboard de status/metricas |
| `utils/sendingWindow.ts` | Business hours + feriados brasileiros |
