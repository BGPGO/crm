# Melhorias CRM BGPGO — Prompt para execução multi-agent

> Cole este prompt inteiro dentro do Claude Code na pasta `crm/`.
> Ele vai distribuir o trabalho em agentes paralelos.
> Após implementar, rode `npm run dev` nos dois workspaces e teste cada item.

---

## PROMPT

```
Preciso implementar 14 melhorias no CRM BGPGO + investigar 1 bug. O projeto é um monorepo com:
- Frontend: packages/web (Next.js 14 + React + Tailwind)
- Backend: packages/api (Express + Prisma + Supabase/PostgreSQL)
- Shared: packages/shared

Leia o CLAUDE.md e o schema.prisma antes de começar. Rode em paralelo os agentes abaixo, cada um responsável por um bloco. Após cada bloco, o agente deve verificar que compila (npm run build) e criar testes básicos onde aplicável.

---

### AGENTE 1 — Chat e Mensagens (itens 1, 3)

**Item 1: Enter cria parágrafo no chat/mensagem**
- No campo de envio de mensagem (WhatsApp/chat), Enter (ou Shift+Enter) deve inserir quebra de linha (\n → <br> ou parágrafo)
- Ctrl+Enter envia a mensagem
- Garantir que a mensagem salva e exibe com as quebras de linha preservadas

**Item 3: Editar mensagem no chat**
- Adicionar botão de editar em mensagens já enviadas (somente as próprias)
- Ao clicar, o texto volta pro campo de edição
- Salvar atualiza a mensagem no banco e mostra "(editada)" ao lado do timestamp

Testar: enviar mensagem com parágrafos, verificar exibição; editar mensagem e confirmar que atualiza.

---

### AGENTE 2 — Tarefas (itens 2, 6, 12)

**Item 2: Lista suspensa de títulos comuns ao criar tarefa**
- No modal "Nova Tarefa", o campo Título deve ter um combobox (autocomplete/dropdown)
- Opções predefinidas: "Reunião marcada", "Follow Up", "Ligar", "Cobrar", "Desligar"
- Permitir digitar título customizado também (não apenas as opções)
- As opções predefinidas podem vir de uma constante no frontend por enquanto

**Item 6: Mostrar data/hora nas tarefas do card no Kanban**
- Nos cards do pipeline (Kanban), as tarefas devem exibir: nome da tarefa > data > hora
- Tarefas atrasadas: texto em vermelho (text-red-500 ou similar)
- Tarefas de hoje: mostrar horário visível
- Tarefas futuras: já funciona, manter como está

**Item 12: Botão rápido de adiar tarefa**
- Ao lado da tarefa (no card ou dentro da negociação), adicionar ícone de relógio/adiar
- Ao clicar, dropdown com opções:
  - "Para daqui 1 hora"
  - "Para daqui 2 horas"
  - "Para amanhã" (mesmo horário)
  - "Para daqui 2 dias"
  - "Para próxima semana" (segunda-feira, mesmo horário)
  - "Para próximo mês"
- Cada opção calcula a nova data automaticamente e atualiza via API

Testar: criar tarefa com dropdown, verificar exibição de data/hora no kanban, adiar tarefa e confirmar nova data.

---

### AGENTE 3 — Anotações e Rich Text (itens 4, 4.1)

**Item 4: Campo de anotações maior**
- O textarea de anotações dentro do card deve ter no mínimo 8 linhas (rows=8)
- Deve ser redimensionável (resize-y) para o usuário expandir se quiser

**Item 4.1: Rich text nas anotações**
- Substituir o textarea simples por um editor rich text leve (ex: Tiptap, ou react-quill se já estiver no projeto)
- Suporte mínimo: negrito, itálico, títulos (h2, h3), listas, links
- Salvar como HTML no banco
- Exibir no histórico com a formatação preservada
- Manter atalho Ctrl+Enter para salvar

Testar: criar anotação com negrito e título, salvar, verificar no histórico que renderiza formatado.

---

### AGENTE 4 — UX do Pipeline e Filtros (itens 5, 7, 10, 11)

**Item 5: Título da aba do navegador = nome do card**
- Quando o usuário abre uma negociação (deal), o document.title deve mudar para o nome da negociação
- Ex: "Cesar - Corassa | CRM BGPGO" em vez de apenas "CRM BGPGO"
- Ao voltar para o pipeline, restaurar o título padrão

**Item 7: Ordenação "Mais antigos"**
- No dropdown de ordenação do pipeline, adicionar opção "Mais antigos" (order by createdAt ASC)
- Opções existentes: Mais recentes, Próximas tarefas, Maior valor, Menor valor
- A nova opção deve funcionar tanto no Kanban quanto na lista

**Item 10: Persistir filtros ao entrar/sair de cards**
- Quando o usuário aplica filtros (data, etapa, etc.) e abre um card, ao voltar os filtros devem continuar aplicados
- Usar URL query params (searchParams) ou estado persistido (sessionStorage/zustand) para manter os filtros
- Não resetar filtros na navegação de ida e volta

**Item 11: Filtro por "tarefa atrasada"**
- Adicionar opção de filtro no pipeline: "Com tarefa atrasada"
- Filtra negociações que possuem pelo menos uma tarefa com dueDate < now e não concluída
- Pode ser implementado como filtro no frontend (se já carrega tarefas) ou via query no backend

Testar: abrir card e voltar (filtros mantidos), ordenar por mais antigos, filtrar por tarefa atrasada.

---

### AGENTE 5 — Card da Negociação (itens 8, 13)

**Item 8: Mostrar data de criação no card**
- Na sidebar esquerda do card (onde tem Qualificação, Valor total, Data de fechamento, Fonte...)
- Adicionar campo "Data de criação" com o valor formatado (dd/MM/yyyy HH:mm)
- Posicionar próximo ao campo "Valor total" ou "Qualificação"
- Somente leitura

**Item 13: Editar contato do lead dentro do card**
- Na seção "Contatos" dentro do card, ao lado do nome/telefone/email, adicionar ícone de editar (lápis)
- Ao clicar, os campos ficam editáveis inline
- Salvar alterações via API (PUT no contato)
- Validação básica de email e telefone

Testar: verificar data de criação visível no card, editar email de contato e confirmar que salva.

---

### AGENTE 6 — Ações em Massa e Filtros Avançados (itens 9, 14)

**Item 9: Encerrar negociações em massa (marcar como perdido)**
- Na view de lista (tabela), quando selecionar múltiplas negociações, adicionar botão "Encerrar" ou "Marcar como perdido"
- Ao clicar, abrir modal pedindo o motivo de perda (dropdown com motivos existentes)
- Aplicar o status "perdido" + motivo em todas as selecionadas via API batch
- Mostrar confirmação: "Tem certeza que deseja encerrar X negociações?"

**Item 14: Filtro de data com horário**
- Nos filtros de "Data de Criação", "Última Alteração", etc., adicionar campo de horário (HH:mm) junto à data
- Input tipo datetime-local ou date + time separados
- Permitir filtrar ex: "criados de sexta 18:00 até segunda 08:00" para contar leads do fim de semana

Testar: selecionar 3 negociações e encerrar em massa, filtrar por data+hora e verificar resultados.

---

### AGENTE 7 — Investigação de Bug (item 15)

**Item 15: Bug no Calendly — leads com nomes parecidos trocados**
- Investigar o webhook do Calendly que cria/avança negociações
- O problema: dois leads "Flávio" entraram com ~15min de diferença, o sistema misturou os dados
  - Lead 1 (Flavio Mattos, flavio.mattos@clorup.com.br) ficou em "Marcar reunião" sem avançar
  - Lead 2 recebeu o avanço para "Reunião agendada" mas com email errado (flaviokms@gmail.com)
- Hipótese: o matching do webhook usa nome parcial e confundiu os dois
- Verificar: como o webhook identifica o lead existente (por email? por nome? por telefone?)
- Corrigir: o matching deve ser por email exato OU por ID, nunca por nome parcial
- Adicionar log detalhado no webhook de Calendly para debug futuro
- Escrever teste que simula dois leads com mesmo primeiro nome entrando em sequência

---

## Após todos os agentes terminarem:

1. Rodar `npm run build` nos dois workspaces para garantir que compila
2. Rodar os testes criados
3. Listar o que foi alterado com `git diff --stat`
4. Fazer commit organizado por bloco (1 commit por agente)
```

---

## Checklist de Validação Manual (pós-implementação)

Depois de rodar o prompt, teste no localhost (web :3000, api :3001):

- [ ] **Chat**: Enter = parágrafo, Shift+Enter = envia. Mensagem editável.
- [ ] **Tarefas**: dropdown de títulos comuns funciona. Adiar tarefa com 1 clique.
- [ ] **Kanban cards**: tarefa mostra data+hora, vermelho se atrasada.
- [ ] **Anotações**: rich text (negrito, título) salva e renderiza no histórico.
- [ ] **Aba do browser**: mostra nome do card quando aberto.
- [ ] **Ordenação**: "Mais antigos" aparece e funciona.
- [ ] **Filtros**: persistem ao entrar/sair de cards. Filtro "tarefa atrasada" funciona.
- [ ] **Card**: data de criação visível. Contato editável.
- [ ] **Massa**: selecionar N leads → encerrar como perdido funciona.
- [ ] **Filtro data**: campo de horário funciona (testar filtro de fim de semana).
- [ ] **Calendly**: webhook identifica lead por email/ID, não por nome.
