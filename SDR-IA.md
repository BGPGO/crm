# SDR IA — Módulo de Assistente de Vendas Inteligente

## O que é

O SDR IA é um módulo da plataforma BGPGO que conversa automaticamente com leads,
qualifica oportunidades via lead scoring e agenda reuniões para o time de vendas.

## Branch de desenvolvimento

```
feature/sdr-ia
```

## Como começar

```bash
# 1. Clone o repositório
gh repo clone BGPGO/crm

# 2. Entre na pasta e troque para a branch
cd crm
git checkout feature/sdr-ia

# 3. Instale as dependências
npm install

# 4. Configure o .env (peça as credenciais ao time)
cp packages/api/.env.example packages/api/.env

# 5. Rode o projeto
npm run dev --workspace=packages/api    # backend porta 3001
npm run dev --workspace=packages/web    # frontend porta 3000
```

## Estrutura do módulo

```
packages/
├── api/src/
│   ├── routes/sdr/          ← rotas REST do SDR IA
│   │   ├── index.ts         ← router principal
│   │   ├── conversations.ts ← CRUD de conversas
│   │   ├── sequences.ts     ← sequências automáticas
│   │   └── lead-scoring.ts  ← scoring de leads
│   └── services/sdr/        ← lógica de negócio / integração IA
│
├── web/src/
│   ├── app/sdr/             ← páginas do módulo
│   └── components/sdr/      ← componentes visuais
│
└── shared/src/types/
    └── sdr.ts               ← tipos/enums compartilhados (já criado)
```

## Entidades compartilhadas (NÃO duplicar)

O SDR IA usa as mesmas entidades do CRM. Não crie tabelas separadas para:

- **Contact** — o lead com quem o SDR conversa
- **Deal** — a negociação que pode ser criada/atualizada pelo SDR
- **Activity** — toda interação do SDR vira um registro no timeline
- **Task** — SDR pode criar tarefas para o vendedor (ex: "Ligar para lead X")
- **User** — vendedores que recebem leads qualificados

## Entidades novas (a criar no Prisma)

| Tabela | Descrição |
|--------|-----------|
| `Conversation` | Conversa entre SDR IA e um lead |
| `ConversationMessage` | Mensagens individuais da conversa |
| `LeadScore` | Pontuação calculada do lead |
| `SdrSequence` | Sequência automática de contato |
| `SdrSequenceStep` | Passos da sequência (esperar, enviar, etc.) |

Os tipos já estão definidos em `packages/shared/src/types/sdr.ts`.

## Regras importantes

1. **Mesmo banco Supabase** — não crie outro projeto Supabase
2. **Mesmo auth** — use o middleware `requireAuth` que já existe
3. **Registre no Activity** — toda ação do SDR (mensagem enviada, lead qualificado, reunião agendada) deve gerar um registro em Activity
4. **Não mexa nas rotas do CRM** — suas rotas ficam em `routes/sdr/`, não altere `routes/deals.ts` etc.
5. **Tipos no shared** — interfaces e enums novos vão em `packages/shared/src/types/sdr.ts`

## Próximos Passos

- [ ] Criar modelos no Prisma (`Conversation`, `ConversationMessage`, `LeadScore`, `SdrSequence`, `SdrSequenceStep`)
- [ ] Implementar rotas CRUD de conversas
- [ ] Implementar lead scoring básico
- [ ] Integrar com API de IA (Claude/OpenAI) para gerar respostas
- [ ] Implementar sequências automáticas de contato
- [ ] Dashboard do SDR com métricas (conversas ativas, leads qualificados, reuniões agendadas)
- [ ] Integração com WhatsApp (Evolution API ou similar)
- [ ] Transfer to human — escalar para vendedor quando lead está pronto
