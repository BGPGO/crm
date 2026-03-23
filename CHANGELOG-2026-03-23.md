# Changelog — 2026-03-23 | Branch: feature/melhorias-crm-v2

## Commit 1: feat: 14 melhorias de UX no CRM

### Chat e Mensagens (itens 1, 3)
- **Enter = nova linha, Ctrl+Enter = envia** — input substituído por textarea auto-resize na página de conversas e no sidebar WhatsApp do deal
- **Editar mensagem** — botão lápis em mensagens próprias, edição inline, campo `editedAt` no schema, rota `PUT /whatsapp/conversations/:id/messages/:messageId`, mostra "(editada)" ao lado do timestamp

### Tarefas (itens 2, 6, 12)
- **Combobox de títulos** — sugestões predefinidas (Reunião marcada, Follow Up, Ligar, Cobrar, Desligar) + título customizado, tanto na tela de tarefas quanto dentro da negociação
- **Data/hora no Kanban** — tarefas atrasadas em vermelho com badge "Atrasada", hoje mostra horário em laranja, futuras com dd/MM HH:mm
- **Botão adiar tarefa** — dropdown com relógio (1h, 2h, amanhã, 2 dias, próxima semana, próximo mês), calcula nova data automaticamente

### Anotações Rich Text (itens 4, 4.1)
- **Campo maior** — mínimo 8 linhas, redimensionável (resize-y)
- **Editor Tiptap** — toolbar com negrito, itálico, H2/H3, listas, links. Salva como HTML, renderiza com DOMPurify. Ctrl+Enter salva. Compatível com anotações antigas em texto puro

### UX Pipeline e Filtros (itens 5, 7, 10, 11)
- **Título da aba** — muda para "Nome do Deal | CRM BGPGO" ao abrir negociação, restaura ao sair
- **Ordenação "Mais antigos"** — nova opção no dropdown, backend + frontend
- **Filtros persistidos** — sessionStorage mantém filtros, view e filtros avançados ao navegar entre pipeline e deals
- **Filtro "Com tarefa atrasada"** — checkbox nos filtros avançados, query Prisma filtra deals com tarefas vencidas não concluídas

### Card da Negociação (itens 8, 13)
- **Data de criação** — campo somente leitura na sidebar, formatado dd/MM/yyyy HH:mm
- **Editar contato inline** — ícone de lápis, campos nome/telefone/email editáveis, validação básica, salva via PUT existente

### Ações em Massa (itens 9, 14)
- **Encerrar em massa** — checkboxes na tabela de lista, barra de ações com contagem, modal de confirmação com dropdown de motivos de perda, rota batch `PATCH /api/deals/batch/status` com transação atômica
- **Filtro data com horário** — inputs datetime-local nos 4 pares de filtro de data, retrocompatível

### Arquivos novos
- `packages/web/src/components/ui/RichTextEditor.tsx`
- `packages/web/src/components/ui/TaskTitleCombobox.tsx`
- `packages/web/src/components/ui/PostponeDropdown.tsx`
- `packages/web/src/components/pipeline/BatchLostModal.tsx`

### Dependências adicionadas (web)
- @tiptap/react, @tiptap/starter-kit, @tiptap/extension-link, @tiptap/pm, @tiptap/extension-placeholder
- @tailwindcss/typography
- dompurify, @types/dompurify

---

## Commit 2: fix: corrige matching do webhook Calendly por email exato

### Bug Calendly (item 15)
- **Causa raiz**: matching por primeiro nome + proximidade temporal confundia leads homônimos (ex: dois "Flávio" com 15min de diferença)
- **Removido**: fuzzy name matching (primeiro nome com contains + janela de tempo) e "recent LP lead" (pegava qualquer lead recente sem checar identidade)
- **Mantido**: match por email (primário, case-insensitive) e telefone (fallback, últimos 9 dígitos)
- **Melhorado**: match por nome exige unicidade — se 2+ contatos têm o mesmo nome, recusa e cria novo contato
- **Logs detalhados** em cada etapa do matching (FINAL MATCH / NO MATCH)

### Testes
- 3 testes com vitest: match por email com nomes similares, recusa nome ambíguo, dois leads homônimos em sequência
- `packages/api/vitest.config.ts` criado
- Scripts `test` e `test:watch` adicionados ao package.json da API

### Arquivos novos
- `packages/api/src/__tests__/calendly-webhook-matching.test.ts`
- `packages/api/vitest.config.ts`

---

## Commit 3: feat: adiciona ação WAIT_FOR_RESPONSE no construtor de automações

### Backend
- **Schema**: novo enum `WAIT_FOR_RESPONSE` em `AutomationActionType`
- **automationActions.ts**: handler que seta `nextActionAt` + metadata (`awaitingResponse`, `channel`, `responseReceived`)
- **automationEngine.ts**: branching — `trueStepId` (não respondeu) / `falseStepId` (respondeu), limpa metadata após decisão
- **automations.ts**: validação do novo tipo + modo teste (segue caminho "não respondeu")
- **waitForResponseService.ts**: service compartilhado `checkAndCancelWaitForResponse(contactId)` — busca enrollments ativos esperando resposta, marca `responseReceived: true` e antecipa `nextActionAt`
- **whatsapp-webhook.ts**: chama o service fire-and-forget quando cliente envia mensagem
- **email-tracking.ts**: chama o service fire-and-forget quando email é aberto

### Frontend
- **WaitForResponseNode.tsx**: node âmbar no builder visual, config de horas (1-720) + canal (WhatsApp/Email/Qualquer)
- **FlowCanvas.tsx**: branching visual com labels "Sem resposta" (vermelho) / "Respondeu" (verde)
- **FlowNode.tsx**: registro do tipo com cor âmbar
- **FlowAddNodeMenu.tsx**: disponível na lista de ações

### Arquivos novos
- `packages/api/src/services/waitForResponseService.ts`
- `packages/web/src/components/automations/nodes/WaitForResponseNode.tsx`

---

## Commit 4: fix: corrige sistema de lembretes pré-reunião

### Problemas encontrados
- Z-API desconectada descartava lembretes silenciosamente (sem log, sem retry)
- setTimeout em memória perdia lembretes no restart do servidor
- sendText falhava sem marcar como FAILED no banco (ficava PENDING pra sempre)
- Lookup de opt-out por phone exato falhava com formatos diferentes

### Correções em meetingReminderScheduler.ts
- **Logs em todos os pontos de falha** — Z-API down, sem contato, opt-out, erro de envio
- **Anti-duplicação** — marca SENT antes de enviar via `updateMany` atômico, reverte para FAILED se sendText falhar
- **Opt-out por contactId** — não depende mais de formato exato do telefone

### Rede de segurança em automationCron.ts
- **processOverdueReminders()** — roda no cron existente (60s), após processEnrollments
- Busca lembretes PENDING vencidos + FAILED com mais de 5min (retry)
- Verifica Z-API uma única vez por ciclo
- Cancela lembretes órfãos e de reuniões já passadas
- Mesma trava anti-duplicação (marca SENT antes de enviar)
- Limitado a 10 por ciclo para não sobrecarregar

---

## Resumo geral

| Métrica | Valor |
|---------|-------|
| Arquivos modificados | 28 |
| Arquivos novos | 8 |
| Linhas adicionadas | ~3.600 |
| Linhas removidas | ~570 |
| Dependências novas | 8 (web) + 1 (api: vitest) |
| Itens do MELHORIAS-CRM.md | 14/14 + 1 bug |
| Features extras | WAIT_FOR_RESPONSE, fix lembretes |
