# Plataforma BGPGO

Plataforma unificada de vendas e marketing da BGPGO. Inclui três módulos:

| Módulo | Branch | Status | Descrição |
|--------|--------|--------|-----------|
| **CRM** | `main` | Em produção | Pipeline de vendas, contatos, negociações |
| **Marketing** | `main` | Planejado | Campanhas de email, automações, segmentações |
| **SDR IA** | `feature/sdr-ia` | Em desenvolvimento | Assistente IA que conversa com leads e qualifica |

> Para trabalhar no SDR IA: `git checkout feature/sdr-ia` — veja [SDR-IA.md](SDR-IA.md)

## Tech Stack

| Camada     | Tecnologia                          |
|------------|-------------------------------------|
| Frontend   | Next.js 14 + React + Tailwind CSS  |
| Backend    | Node.js + Express + Prisma ORM     |
| Banco      | PostgreSQL (Supabase)               |
| Monorepo   | npm workspaces                      |

## Infraestrutura

- **Supabase**: `gqjgbwzxlqkwvrtorhvb.supabase.co`
- **Credenciais**: em `packages/api/.env` (NÃO commitar)

## Estrutura

```
crm/
├── CLAUDE.md
├── package.json          ← raiz do monorepo
├── packages/
│   ├── api/              ← backend Express + Prisma
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   ├── services/
│   │   │   └── server.ts
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── .env          ← credenciais (gitignored)
│   ├── web/              ← frontend Next.js
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   └── lib/
│   │   └── package.json
│   └── shared/           ← tipos compartilhados
│       └── src/
```

## Fluxo da Operação

### Entrada de Leads
- Leads entram via **webhook** das landing pages (GreatPages)
- Webhook recebe dados do formulário + tracking (UTM, origem, etc.)
- Lead é armazenado automaticamente no Supabase
- Configuração de webhooks (entrada e saída) nas settings do CRM

### Funil de Vendas (Pipeline)
Etapas fixas do funil:
1. **Lead** — entrada automática via webhook
2. **Contato Feito** — primeiro contato realizado
3. **Marcar Reunião** — agendamento pendente
4. **Reunião Marcada** — reunião confirmada
5. **Proposta Enviada** — proposta foi enviada
6. **Aguardando Dados** — esperando documentos/dados do cliente
7. **Aguardando Assinatura** — contrato enviado, aguardando
8. **Ganho Fechado** — venda concluída

### Regras do Funil
- **Perda**: pode marcar como perdido em qualquer etapa, precisa informar motivo
- **Filtros**: ver negociações em andamento / perdidas / ganhas
- **Venda**: ao marcar como venda, move automaticamente para "Ganho Fechado" e status = vendido
- **Kanban**: drag-and-drop entre colunas

### Negociação (Deal) — ao abrir
- Todas as informações editáveis
- **Contato**: nome, telefone, email + opção de adicionar mais contatos
- **Empresa**: nome, CNPJ, site, Instagram, etc.
- **Responsável**: vendedor responsável pela negociação
- **Produtos**: nome, recorrência, valor (com valor total calculado)
- **Tarefas**: lista de tarefas vinculadas
- **Classificação**: código Conta Azul, site, campos livres
- **Histórico**: timeline de tudo — entrada, mudanças de etapa, tarefas, anotações
- **Datas**: criação, alterações no funil, previsão de fechamento

### Relatórios / BI
- Extração de relatórios de vendas
- Possibilidade de integrar com BI externo
- Webhook de saída para extrair dados

### Configurações
- Webhooks de entrada (receber leads)
- Webhooks de saída (enviar dados para BI/outros sistemas)
- Pipeline (etapas, cores)
- Motivos de perda
- Fontes de leads
- Produtos
- Equipe e responsáveis

## WhatsApp — Proteções Anti-Ban

Todas as proteções contra ban do WhatsApp estão documentadas em **[WHATSAPP-PROTECOES.md](WHATSAPP-PROTECOES.md)**.
Inclui: limites diários, warmup, throttle, contatos frios, matriz de proteções por canal.

> **IMPORTANTE**: Qualquer novo canal de envio WhatsApp DEVE implementar `canSend()`/`registerSent()` do `dailyLimitService.ts`.

## Comandos

```bash
npm install                                    # instalar deps
npm run dev --workspace=packages/api           # backend (porta 3001)
npm run dev --workspace=packages/web           # frontend (porta 3000)
npx prisma db push --schema=packages/api/prisma/schema.prisma   # sync schema
npx prisma generate --schema=packages/api/prisma/schema.prisma  # gerar client
```


