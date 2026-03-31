# Migracao da Z-API para WhatsApp Business API Oficial

> **Data**: 2026-03-30
> **Contexto**: A BGPGO (Bertuzzi Patrimonial) usa Z-API (nao-oficial) para envio de mensagens WhatsApp via CRM. Ja sofreu 2 bans (2026-03-26 e 2026-03-28). Este documento detalha tudo que e necessario para migrar para a API oficial do WhatsApp Business.

---

## Indice

1. [Requisitos para Acesso a API Oficial](#1-requisitos-para-acesso-a-api-oficial)
2. [Provedores BSP no Brasil](#2-provedores-bsp-no-brasil)
3. [Templates de Mensagem](#3-templates-de-mensagem)
4. [Janela de Conversa de 24h](#4-janela-de-conversa-de-24h)
5. [Limites e Escalabilidade](#5-limites-e-escalabilidade)
6. [Integracao Tecnica](#6-integracao-tecnica)
7. [Impacto no CRM BGPGO](#7-impacto-no-crm-bgpgo)
8. [Plano de Migracao](#8-plano-de-migracao)
9. [Comparativo Z-API vs API Oficial](#9-comparativo-z-api-vs-api-oficial)

---

## 1. Requisitos para Acesso a API Oficial

### 1.1 Meta Business Manager

- Criar conta em **business.facebook.com** (se ainda nao tiver)
- Informacoes da empresa: nome, CNPJ, endereco, site
- Adicionar administradores da equipe
- Vincular a pagina do Facebook da empresa (se houver)

### 1.2 Verificacao de Empresa (Business Verification)

**Documentos necessarios (Brasil):**

| Documento | Detalhes |
|-----------|----------|
| CNPJ ativo e regularizado | Nome deve ser identico ao cadastrado no Meta Business Manager |
| Contrato social ou certificado de registro | Comprovante de existencia legal da empresa |
| Comprovante de endereco empresarial | Conta de luz, agua, telefone ou extrato bancario |
| Documento do representante legal | RG ou CNH do socio/administrador |
| Site da empresa no ar | Meta verifica que o site existe e corresponde a empresa |

**Processo:**
1. No Meta Business Suite, va em **Configuracoes > Centro de Seguranca > Verificacao de Negocios**
2. Faca upload dos documentos
3. A Meta analisa em **1 a 5 dias uteis**
4. Se reprovado, voce pode reenviar com correcoes

### 1.3 WhatsApp Business Account (WABA)

- Criado dentro do Meta Business Manager
- Pode ter multiplos numeros de telefone vinculados
- Cada WABA tem seus proprios templates, limites e configuracoes

### 1.4 Numero de Telefone

**Pode usar o mesmo numero que esta na Z-API?** SIM, porem:

1. O numero precisa ser **desvinculado** de qualquer instalacao WhatsApp (app pessoal, WhatsApp Business app, ou Z-API)
2. Apos desvincular, leva **ate 3 minutos** para ficar disponivel
3. O numero sera verificado via SMS ou chamada de voz
4. **Historico de conversas NAO e transferido** — comeca do zero
5. Se o numero tiver sido banido pela Meta, NAO podera ser usado na API oficial

**Recomendacao para BGPGO**: Considerando os 2 bans recentes, e mais seguro usar um **numero novo** e fazer warmup gradual. Se o numero antigo nao foi banido permanentemente, pode tentar reusa-lo, mas ha risco.

### 1.5 BSP (Business Solution Provider) — Precisa de um?

**Opcao 1: Direto com Meta (Cloud API)**
- Gratis para usar (paga apenas pelas mensagens)
- Voce gerencia tudo via Meta Business Manager + Graph API
- Mais controle, mas mais trabalho tecnico

**Opcao 2: Via BSP**
- O BSP simplifica onboarding, templates, analytics
- Cobra taxa mensal ou markup por mensagem
- Suporte dedicado
- Recomendado se a equipe tecnica for enxuta

---

## 2. Provedores BSP no Brasil

### 2.1 Comparativo Detalhado

| Provedor | Preco Mensal | Markup/Msg | Suporte PT-BR | Facilidade Node.js | Destaque |
|----------|-------------|------------|----------------|-------------------|----------|
| **360dialog** | EUR 49/mes | 0% (zero markup) | Limitado | 7.5/10 | Mais barato — paga so a taxa Meta |
| **Gupshup** | Gratis (pay-as-you-go) | USD 0.001/msg | Sim | 8.5/10 | Melhor facilidade de integracao |
| **Zenvia** | Sob consulta | Embutido | Excelente (BR) | 7/10 | Empresa brasileira, omnichannel |
| **Twilio** | Gratis (pay-as-you-go) | USD 0.005/msg | Ingles | 9/10 | Melhor documentacao, SDK robusto |
| **Take Blip** | Sob consulta | Embutido | Excelente (BR) | 6/10 | Forte em chatbots, plataforma completa |
| **Wati** | USD 39/mes | Incluido | Limitado | 7/10 | Interface amigavel, bom para PMEs |
| **Cloud API (direto Meta)** | Gratis | 0% | N/A | 8/10 | Sem intermediario, SDK oficial |

### 2.2 Recomendacao para BGPGO

**Para o CRM custom (Node.js/Express), as melhores opcoes sao:**

**1a opcao: Cloud API direto (sem BSP)**
- Zero custo de plataforma
- SDK oficial da Meta para Node.js
- Controle total
- Requer que a equipe gerencie templates e compliance
- BGPGO ja tem equipe tecnica para isso

**2a opcao: 360dialog**
- Zero markup sobre as taxas Meta
- EUR 49/mes fixo
- API compativel com a documentacao oficial do WhatsApp
- Bom custo-beneficio para volume medio

**3a opcao: Gupshup**
- Pay-as-you-go, sem mensalidade
- USD 0.001 por mensagem de markup
- Facilidade de integracao nota 8.5/10
- Bom se quiser subir rapido

---

## 3. Templates de Mensagem

### 3.1 Categorias

| Categoria | Uso | Exemplo SDR B2B |
|-----------|-----|-----------------|
| **Marketing** | Promocoes, novidades, newsletters | "Ola {{1}}, temos uma oportunidade exclusiva em previdencia privada para {{2}}. Posso te contar mais?" |
| **Utility** | Confirmacoes, atualizacoes, lembretes | "Ola {{1}}, sua reuniao com a Bertuzzi esta confirmada para {{2}} as {{3}}." |
| **Authentication** | Codigos OTP, verificacao | "Seu codigo de verificacao BGPGO: {{1}}. Valido por 5 minutos." |

### 3.2 Aprovacao de Templates

- Templates sao submetidos via Meta Business Manager ou API
- Tempo de aprovacao: **ate 24 horas** (geralmente minutos)
- Podem ser **aprovados**, **rejeitados** ou **em revisao**
- Motivos comuns de rejeicao:
  - Conteudo enganoso ou spam
  - Falta de variavel de opt-out
  - Template muito generico sem contexto claro
  - Uso de URL encurtada suspeita

### 3.3 Regras Importantes

- Templates podem conter: texto, variaveis ({{1}}, {{2}}...), botoes (CTA, quick reply), cabecalho (texto/imagem/video/documento), rodape
- **Marketing templates NAO podem ser enviados para numeros +1 (EUA)** desde abril 2025
- Limite de **250 templates por WABA** (pode solicitar aumento)
- Templates inativos por 30+ dias podem ser pausados pela Meta

### 3.4 Templates Sugeridos para SDR B2B (Bertuzzi Patrimonial)

**Template 1 — Primeiro contato (Marketing)**
```
Ola {{1}}, aqui e a {{2}} da Bertuzzi Patrimonial.
Vi que voce demonstrou interesse em {{3}}.
Posso te explicar como funciona e quais os beneficios?

Responda SIM para continuar ou SAIR para nao receber mais mensagens.
```

**Template 2 — Lembrete de reuniao (Utility)**
```
Ola {{1}}, lembrando da sua reuniao com {{2}} amanha, {{3}}, as {{4}}.
Link: {{5}}

Precisa reagendar? Responda aqui.
```

**Template 3 — Follow-up pos-reuniao (Marketing)**
```
Ola {{1}}, obrigado pela reuniao de hoje!
Conforme conversamos, segue o resumo: {{2}}

Qualquer duvida, estou a disposicao.
```

**Template 4 — Reengajamento (Marketing)**
```
Ola {{1}}, faz um tempo que conversamos sobre {{2}}.
Gostaria de retomar? Temos novidades que podem te interessar.

Responda SIM ou SAIR.
```

---

## 4. Janela de Conversa de 24h

### 4.1 Como Funciona

```
Cliente envia mensagem
       |
       v
  [Janela de 24h abre]
       |
       v
  Empresa pode enviar mensagens LIVRES
  (texto, imagem, audio, video, documento,
   botoes, listas, localizacao)
       |
       v
  24h sem resposta do cliente
       |
       v
  [Janela fecha]
       |
       v
  So pode enviar TEMPLATE aprovado
  para reabrir a conversa
```

### 4.2 Dentro da Janela (24h)

- **Texto livre**: sim, qualquer mensagem
- **Midia**: imagens, videos, audios, documentos, stickers
- **Botoes interativos**: quick replies, CTAs, listas
- **Localizacao**: sim
- **Custo**: mensagens de servico sao GRATUITAS (desde nov/2024)
- **Utility templates**: tambem GRATUITOS dentro da janela (desde jul/2025)

### 4.3 Fora da Janela

- SOMENTE templates aprovados pela Meta
- Cada template enviado e cobrado individualmente (modelo per-message desde jul/2025)
- O cliente precisa responder para reabrir a janela

### 4.4 Janela Estendida (72h) — Free Entry Points

- Se o cliente clicar em um anuncio do Facebook/Instagram com CTA "Enviar mensagem WhatsApp", a janela e de **72 horas** (nao 24)
- Essas conversas sao **gratuitas** (free entry point)

### 4.5 Impacto para o SDR/Cadencias

**MUDANCA CRITICA**: Na Z-API, o CRM envia mensagem livre a qualquer momento. Na API oficial:

- **Primeiro contato com lead frio** = obrigatorio usar TEMPLATE
- **Lead respondeu** = janela abre, pode usar texto livre por 24h
- **Lead nao respondeu em 24h** = precisa de novo template para recontato
- **Cadencias automaticas** = cada etapa fora da janela precisa de template

---

## 5. Limites e Escalabilidade

### 5.1 Tiers de Envio (Business-Initiated)

| Tier | Limite (msgs/24h) | Como atingir |
|------|-------------------|--------------|
| **Inicial** | 250 | Conta recem-criada |
| **Tier 1** | 1.000 | Manter quality rating verde |
| **Tier 2** | 10.000 | Volume crescente + qualidade |
| **Tier 3** | 100.000 | Volume alto + qualidade alta |
| **Ilimitado** | Sem limite | Aprovacao especial Meta |

**Atualizacao 2026**: Meta esta removendo os tiers 2K e 10K. Apos Business Verification, a conta vai direto para **100K/dia** (rollout em Q1-Q2 2026).

### 5.2 Quality Rating

| Rating | Cor | Significado |
|--------|-----|-------------|
| Alto | Verde | Poucas denuncias/bloqueios. Elegivel para upgrade de tier |
| Medio | Amarelo | Acima da media em bloqueios. Risco de rebaixamento |
| Baixo | Vermelho | Muitas denuncias. Bloqueado de subir de tier |

**O que afeta negativamente:**
- Usuarios bloqueando o numero
- Usuarios reportando como spam
- Baixa taxa de leitura em marketing templates
- Templates com baixo engajamento

### 5.3 Limite por Usuario

- A Meta limita aproximadamente **2 marketing templates por usuario por dia** (somando TODAS as empresas)
- Se o lead ja recebeu marketing de outras empresas naquele dia, sua mensagem pode ser retida

### 5.4 Portfolio-Level Limits (desde out/2025)

- Limites agora sao por **portfolio** (Business Manager), nao por numero individual
- Todos os numeros do mesmo portfolio compartilham o mesmo limite
- O portfolio herda o maior limite entre seus numeros

### 5.5 Throughput (Velocidade de Envio)

| Plataforma | Msgs/segundo |
|------------|-------------|
| **Cloud API** | ate 1.000 msg/s |
| **Z-API** | ~1-2 msg/s (simulando app) |

A API oficial e **500x+ mais rapida** que a Z-API em throughput puro, porem os limites diarios controlam o volume total.

### 5.6 Comparacao com Z-API

| Aspecto | Z-API | API Oficial |
|---------|-------|-------------|
| Risco de ban | ALTO (nao-oficial) | Baixo (oficial) |
| Limite diario | Nenhum formal (porem ban) | 250 a 100K+ (por tier) |
| Throughput | ~1-2 msg/s | ate 1.000 msg/s |
| Mensagem livre | A qualquer hora | So dentro da janela 24h |
| Template obrigatorio | Nao | Sim (fora da janela) |
| Custo por mensagem | R$ 0 (so paga Z-API) | USD 0.036-0.049 (marketing BR) |
| Verificacao empresa | Nao necessaria | Obrigatoria |

---

## 6. Integracao Tecnica

### 6.1 Cloud API (Hosted by Meta) — RECOMENDADO

- **Hospedada pela Meta** (nao precisa de servidor proprio)
- **On-Premises API foi descontinuada** em outubro/2025 — nao e mais opcao
- Setup via Meta Business Manager + Graph API
- SDK oficial para Node.js disponivel

### 6.2 Configuracao Inicial

1. Criar App no **Meta for Developers** (developers.facebook.com)
2. Adicionar produto "WhatsApp" ao app
3. Configurar WABA e vincular numero
4. Gerar **System User Access Token** (token permanente)
   - No Business Manager > System Users > criar user > atribuir app com permissoes `whatsapp_business_messaging` e `whatsapp_business_management`

### 6.3 Webhooks — Receber Mensagens

```
POST https://seu-servidor.com/webhook/whatsapp
```

**Requisitos:**
- HTTPS obrigatorio (certificado SSL valido, nao self-signed)
- Endpoint deve responder a verificacao GET com `hub.challenge`
- Payload vem em JSON com estrutura padrao Meta

**Exemplo de verificacao (Express/Node.js):**
```javascript
// Verificacao do webhook (GET)
app.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Receber notificacoes (POST)
app.post('/webhook/whatsapp', (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    body.entry?.forEach(entry => {
      entry.changes?.forEach(change => {
        if (change.field === 'messages') {
          const value = change.value;
          const messages = value.messages || [];

          messages.forEach(msg => {
            console.log('De:', msg.from);       // numero do remetente
            console.log('Tipo:', msg.type);      // text, image, audio, etc
            console.log('Texto:', msg.text?.body);
            console.log('Timestamp:', msg.timestamp);
          });
        }
      });
    });
  }

  // SEMPRE retornar 200 rapidamente
  res.sendStatus(200);
});
```

### 6.4 Enviar Template (fora da janela de 24h)

```javascript
const axios = require('axios');

const PHONE_NUMBER_ID = 'seu_phone_number_id';
const ACCESS_TOKEN = 'seu_system_user_token';

async function sendTemplate(to, templateName, languageCode, components) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: to,                    // ex: '5511999999999'
    type: 'template',
    template: {
      name: templateName,      // ex: 'primeiro_contato_sdr'
      language: { code: languageCode },  // ex: 'pt_BR'
      components: components   // variaveis do template
    }
  };

  const response = await axios.post(url, payload, {
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

// Exemplo de uso:
sendTemplate(
  '5511999999999',
  'primeiro_contato_sdr',
  'pt_BR',
  [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: 'Joao' },          // {{1}} = nome
        { type: 'text', text: 'Ana Bertuzzi' },   // {{2}} = vendedor
        { type: 'text', text: 'previdencia privada' } // {{3}} = produto
      ]
    }
  ]
);
```

### 6.5 Enviar Mensagem Livre (dentro da janela de 24h)

```javascript
async function sendFreeText(to, text) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: text }
  };

  const response = await axios.post(url, payload, {
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}
```

### 6.6 Enviar Midia (dentro da janela)

```javascript
async function sendImage(to, imageUrl, caption) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'image',
    image: {
      link: imageUrl,
      caption: caption
    }
  };

  return axios.post(url, payload, {
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
}
```

### 6.7 SDK Oficial da Meta (Node.js)

```bash
npm install whatsapp-cloud-api
# ou o SDK oficial:
# https://github.com/WhatsApp/WhatsApp-Nodejs-SDK
```

**Com o SDK oficial:**
```javascript
import WhatsApp from 'whatsapp';

const wa = new WhatsApp(PHONE_NUMBER_ID);

// Enviar template
await wa.messages.template({
  to: '5511999999999',
  name: 'primeiro_contato_sdr',
  language: { code: 'pt_BR' },
  components: [/* ... */]
});

// Enviar texto livre
await wa.messages.text({
  to: '5511999999999',
  body: 'Ola, tudo bem?'
});
```

---

## 7. Impacto no CRM BGPGO

### 7.1 Arquivos que Precisam Mudar

O CRM atual usa `zapiClient.ts` como cliente unico. A migracao requer:

| Arquivo | Mudanca |
|---------|---------|
| `packages/api/src/services/zapiClient.ts` | Substituir por `whatsappCloudClient.ts` com a Cloud API |
| `packages/api/src/routes/whatsapp-webhook.ts` | Adaptar para o formato de webhook da Meta (diferente da Z-API) |
| `packages/api/src/services/automationActions.ts` | Usar templates para mensagens fora da janela |
| `packages/api/src/services/whatsappBot.ts` | Adaptar parsing de mensagens recebidas |
| `packages/api/src/services/whatsappFollowUp.ts` | Checar janela 24h antes de enviar texto livre |
| `packages/api/src/services/dailyLimitService.ts` | Ajustar limites para os tiers oficiais |
| `packages/api/src/routes/whatsapp-config.ts` | Trocar campos Z-API por Cloud API (phone_number_id, access_token) |
| `packages/api/src/routes/whatsapp-message-templates.ts` | Integrar com API de templates da Meta |
| `packages/api/prisma/schema.prisma` | Atualizar modelo `WhatsAppConfig` |

### 7.2 Logica de Janela 24h (NOVO)

O CRM precisa de um novo conceito: **rastrear se ha janela aberta com cada lead**.

```
Ao receber mensagem do lead:
  -> Salvar lastIncomingMessageAt = now()

Ao enviar mensagem:
  -> Se (now - lastIncomingMessageAt) < 24h:
       Enviar texto livre (gratuito)
  -> Senao:
       Enviar template aprovado (cobrado)
```

Isso requer:
- Novo campo no banco: `lastIncomingMessageAt` na tabela de conversas/leads
- Logica de decisao antes de cada envio
- Templates aprovados para cada tipo de cadencia

### 7.3 Mudanca nas Cadencias

As cadencias automaticas precisam de ajuste fundamental:

**Hoje (Z-API)**: Todas as etapas enviam texto livre
**API Oficial**: Primeiro contato e recontatos apos 24h = template obrigatorio

Sugestao de fluxo:
1. **Etapa 1**: Envia template "primeiro_contato_sdr"
2. **Lead responde**: Janela abre -> BIA (bot IA) conversa em texto livre
3. **Lead nao responde em 24h**: Etapa 2 envia template "followup_1"
4. **Lead responde**: Janela reabre -> continua conversa
5. **Lead nao responde**: Etapa 3 envia template "followup_2"
6. (e assim por diante)

---

## 8. Plano de Migracao

### Fase 1 — Preparacao (1-2 semanas)

- [ ] Criar/verificar Meta Business Manager da BGPGO
- [ ] Submeter documentos para Business Verification (CNPJ, contrato social, etc.)
- [ ] Decidir: Cloud API direto ou via BSP
- [ ] Adquirir numero novo (recomendado) ou preparar migracao do existente
- [ ] Criar app no Meta for Developers

### Fase 2 — Templates (1 semana)

- [ ] Definir todos os templates necessarios (primeiro contato, follow-ups, lembretes, etc.)
- [ ] Submeter templates para aprovacao
- [ ] Testar templates aprovados no sandbox da Meta

### Fase 3 — Desenvolvimento (2-3 semanas)

- [ ] Criar `whatsappCloudClient.ts` com a mesma interface do `zapiClient.ts`
- [ ] Implementar logica de janela 24h
- [ ] Adaptar webhook para formato Meta
- [ ] Adaptar cadencias para usar templates
- [ ] Atualizar schema Prisma (WhatsAppConfig)
- [ ] Testes com numero de sandbox

### Fase 4 — Migracao (1 semana)

- [ ] Registrar numero na Cloud API
- [ ] Configurar webhook de producao
- [ ] Warmup gradual (comecar com 50-100 msgs/dia)
- [ ] Monitorar quality rating
- [ ] Desativar Z-API

### Timeline Total Estimada: 5-7 semanas

---

## 9. Comparativo Z-API vs API Oficial

| Aspecto | Z-API (atual) | API Oficial (Cloud API) |
|---------|---------------|------------------------|
| **Status** | Nao-oficial (risco de ban) | Oficial Meta |
| **Custo plataforma** | ~R$ 100-200/mes | Gratis (Cloud API direto) |
| **Custo por mensagem** | R$ 0 | ~USD 0.036-0.049 (marketing BR) |
| **Mensagem livre** | Qualquer hora | So dentro da janela 24h |
| **Templates** | Nao precisa | Obrigatorio fora da janela |
| **Risco de ban** | ALTO | Baixo (se seguir regras) |
| **Throughput** | ~1-2 msg/s | ate 1.000 msg/s |
| **Limite diario** | Sem limite formal | 250 a 100K+ (por tier) |
| **Verificacao empresa** | Nao | Obrigatoria |
| **Suporte Meta** | Nenhum | Oficial |
| **Historico de conversas** | Mantido no app | Gerenciado via API |
| **Midia/botoes** | Limitado | Completo (imagem, video, botoes, listas) |
| **SDK Node.js** | Proprio Z-API | SDK oficial Meta |
| **Webhooks** | HTTP simples | HTTPS obrigatorio + verificacao |

### Custo Estimado Mensal (BGPGO)

Assumindo ~500 conversas/mes com leads:

| Item | Z-API | Cloud API Direto | 360dialog |
|------|-------|-----------------|-----------|
| Plataforma | R$ 150/mes | R$ 0 | ~R$ 280/mes (EUR 49) |
| Templates marketing (~300/mes) | R$ 0 | ~USD 12 (~R$ 60) | ~R$ 60 |
| Templates utility (~200/mes) | R$ 0 | ~USD 0 (gratis na janela) | ~R$ 0 |
| Mensagens livres | R$ 0 | R$ 0 (gratis) | R$ 0 |
| **Total estimado** | **~R$ 150/mes** | **~R$ 60/mes** | **~R$ 340/mes** |

> Nota: Os valores em USD podem variar. Utility templates dentro da janela de 24h sao gratuitos desde jul/2025. Service conversations (iniciadas pelo cliente) sao 100% gratuitas.

---

## Precos por Mensagem no Brasil (Referencia Jul/2025+)

| Categoria | Custo por mensagem (USD) |
|-----------|-------------------------|
| Marketing | ~USD 0.049 |
| Utility (fora da janela) | ~USD 0.018 |
| Utility (dentro da janela 24h) | GRATIS |
| Authentication | ~USD 0.038 |
| Service (iniciada pelo cliente) | GRATIS |

> Descontos por volume: ate 20% para Utility e Authentication em alto volume. Marketing NAO tem desconto por volume.

---

## Conclusao e Recomendacao

**A migracao para a API oficial e URGENTE** dados os 2 bans recentes. A recomendacao e:

1. **Usar Cloud API direto** (sem BSP) — a equipe tecnica da BGPGO tem capacidade para integrar
2. **Numero novo** — para evitar problemas com historico de bans
3. **Comecar a Business Verification AGORA** — e o passo mais lento (1-5 dias)
4. **Criar templates antes de codar** — aprovacao pode levar 24h
5. **Refatorar `zapiClient.ts`** mantendo a mesma interface publica para minimizar mudancas nos outros servicos

A API oficial custa mais por mensagem (~R$ 60/mes vs R$ 150/mes da Z-API para o volume atual), mas elimina o risco de ban que ja causou disrupcao operacional 2 vezes em uma semana.

---

## Fontes

- [Guia 2025: Verificacao Meta e API WhatsApp](https://weramp.com.br/guia-verificacao-meta-api-whatsapp)
- [Verificar Conta WhatsApp Business 2026](https://www.socialhub.pro/blog/verificar-conta-whatsapp-business-2026-meta-cnpj-recursos-avancados-2/)
- [API Meta WhatsApp: o que e e como funciona em 2026](https://blog.chatsac.com/api-whatsapp-cloud/api-meta-whatsapp-o-que-e/)
- [WhatsApp Business API Oficial: Custos, Funcionamento, Limites](https://aspa.chat/blog/whatsapp-business-api-oficial-custos-funcionamento-limites-brasil)
- [Top 20 Provedores WhatsApp Business API Brasil 2026](https://m.aisensy.com/blog/top-provedores-whatsapp-business-api-brasil/)
- [360dialog Pricing](https://360dialog.com/pricing)
- [WhatsApp API Pricing Brazil 2025](https://www.heltar.com/blogs/whatsapp-api-pricing-in-brazil-2025-cm73idc51007yr1l2xe089d87)
- [Pricing Updates July 2025 - Meta Developers](https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing/)
- [Messaging Limits - Meta Developers](https://developers.facebook.com/docs/whatsapp/messaging-limits/)
- [WhatsApp Messaging Limits 2026](https://chatarmin.com/en/blog/whats-app-messaging-limits)
- [WhatsApp Template Categories Explained](https://www.wuseller.com/blog/whatsapp-template-categories-explained-marketing-vs-utility-vs-authentication-vs-service/)
- [Webhooks - WhatsApp Cloud API - Meta Developers](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/)
- [WhatsApp Node.js SDK (Oficial)](https://github.com/WhatsApp/WhatsApp-Nodejs-SDK)
- [On-Premises API Sunset](https://developers.facebook.com/docs/whatsapp/on-premises/sunset)
- [Cloud API vs On-Premises API](https://support.wati.io/en/articles/11463222-cloud-api-vs-on-premises-api-key-differences-and-choosing-the-right-option)
- [API Oficial WhatsApp: Como Migrar Sem Perder Contatos](https://blog.umbler.com/br/api-oficial-do-whatsapp-como-migrar/)
- [WhatsApp Business Platform Pricing](https://business.whatsapp.com/products/platform-pricing)
- [Upcoming Changes to Messaging Limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/upcoming-messaging-limits-changes/)
