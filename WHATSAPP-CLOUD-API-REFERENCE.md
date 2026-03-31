# WhatsApp Cloud API - Referencia Completa

> **Data de compilacao**: 2026-03-30
> **API Version atual**: v23.0 (usar sempre a mais recente)
> **Base URL**: `https://graph.facebook.com/v23.0`
> **Contexto**: Referencia tecnica para integracao do CRM BGPGO com a API oficial do WhatsApp (Cloud API hospedada pela Meta).

---

## Indice

1. [Setup e Autenticacao](#1-setup-e-autenticacao)
2. [Envio de Mensagens](#2-envio-de-mensagens)
3. [Webhooks (Recebimento)](#3-webhooks-recebimento)
4. [Gerenciamento de Templates](#4-gerenciamento-de-templates)
5. [Janela de 24 Horas e Precificacao](#5-janela-de-24-horas-e-precificacao)
6. [Media (Upload/Download)](#6-media-uploaddownload)
7. [Perfil do Business](#7-perfil-do-business)
8. [Gerenciamento de Numero de Telefone](#8-gerenciamento-de-numero-de-telefone)
9. [Saude, Qualidade e Limites](#9-saude-qualidade-e-limites)
10. [Seguranca e Compliance](#10-seguranca-e-compliance)
11. [Codigos de Erro](#11-codigos-de-erro)
12. [WhatsApp Flows](#12-whatsapp-flows)
13. [Catalogo e Comercio](#13-catalogo-e-comercio)
14. [Migracao e Coexistencia](#14-migracao-e-coexistencia)
15. [Gotchas e Comportamentos Nao-Documentados](#15-gotchas-e-comportamentos-nao-documentados)

---

## 1. Setup e Autenticacao

### 1.1 Criar WABA (WhatsApp Business Account)

1. Criar conta em **business.facebook.com** (Meta Business Manager)
2. Verificar o negocio (documentos da empresa, CNPJ)
3. Criar um App em **developers.facebook.com** com produto "WhatsApp"
4. O app recebe um WABA de teste com numero de sandbox

### 1.2 Registrar Numero de Telefone

**Fluxo de 4 etapas:**

1. Adicionar numero ao WABA (via Meta Business Manager ou API)
2. Solicitar codigo de verificacao:
```
POST /{PHONE_NUMBER_ID}/request_code
{
  "code_method": "SMS",  // ou "VOICE"
  "language": "pt_BR"
}
```
3. Verificar o codigo recebido:
```
POST /{PHONE_NUMBER_ID}/verify_code
{
  "code": "123456"
}
```
4. Registrar o numero para Cloud API:
```
POST /{PHONE_NUMBER_ID}/register
{
  "messaging_product": "whatsapp",
  "pin": "123456"  // PIN de verificacao em 2 etapas (6 digitos)
}
```

### 1.3 Tokens de Acesso

| Tipo | Duracao | Uso |
|------|---------|-----|
| **Temporario** | < 24 horas | Apenas para testes |
| **Permanente (System User)** | Nunca expira | **PRODUCAO** - obrigatorio |

**Como criar token permanente:**
1. Business Settings > Users > System Users
2. Criar System User com role "Admin"
3. Atribuir permissao `whatsapp_business_messaging`
4. Gerar token e armazenar com seguranca

**Header de autenticacao:**
```
Authorization: Bearer {SEU_TOKEN_PERMANENTE}
Content-Type: application/json
```

### 1.4 Permissoes Necessarias

| Permissao | O que permite |
|-----------|---------------|
| `whatsapp_business_messaging` | Enviar/receber mensagens, gerenciar media |
| `whatsapp_business_management` | Gerenciar templates, numeros, WABA |
| `business_management` | Acesso ao Business Manager |

### 1.5 Sandbox vs Producao

- **Sandbox**: numero de teste fornecido pela Meta, pode enviar para ate 5 numeros pre-registrados
- **Producao**: numero proprio verificado, sem limite de destinatarios (sujeito a tiers)
- Para ir para producao: verificar negocio + registrar numero proprio + ter template aprovado

---

## 2. Envio de Mensagens

### Endpoint Unico

```
POST https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}/messages
```

**Headers:**
```
Authorization: Bearer {TOKEN}
Content-Type: application/json
```

**Estrutura base de toda mensagem:**
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "5511999999999",
  "type": "<TIPO_DA_MENSAGEM>",
  "<TIPO_DA_MENSAGEM>": { ... }
}
```

**Resposta de sucesso:**
```json
{
  "messaging_product": "whatsapp",
  "contacts": [{ "input": "5511999999999", "wa_id": "5511999999999" }],
  "messages": [{ "id": "wamid.HBgNNTUxMTk5..." }]
}
```

### 2.1 Mensagem de Texto

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "text",
  "text": {
    "preview_url": true,
    "body": "Ola! Sua proposta esta pronta: https://exemplo.com/proposta"
  }
}
```

- `preview_url`: gera preview de links (default: false)
- Limite: **4096 caracteres** no body
- So pode enviar durante janela de 24h aberta

### 2.2 Mensagem de Template

**Obrigatorio para iniciar conversa fora da janela de 24h.**

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "template",
  "template": {
    "name": "pedido_enviado",
    "language": {
      "code": "pt_BR"
    },
    "components": [
      {
        "type": "header",
        "parameters": [
          {
            "type": "image",
            "image": {
              "link": "https://exemplo.com/header.jpg"
            }
          }
        ]
      },
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Joao" },
          { "type": "text", "text": "12345" },
          { "type": "text", "text": "FedEx Express" }
        ]
      },
      {
        "type": "button",
        "sub_type": "quick_reply",
        "index": 0,
        "parameters": [
          { "type": "payload", "payload": "rastrear_pedido" }
        ]
      }
    ]
  }
}
```

**Tipos de parametro no header:**
- `text` - texto dinamico
- `image` - imagem (link ou media_id)
- `video` - video (link ou media_id)
- `document` - documento (link ou media_id)

**Tipos de parametro no body:**
- `text` - texto
- `currency` - `{ "fallback_value": "R$99,90", "code": "BRL", "amount_1000": 99900 }`
- `date_time` - `{ "fallback_value": "25/03/2026" }`

**Tipos de botao:**
- `quick_reply` - index 0,1,2 + payload
- `url` - index do botao + texto dinamico para URL
- `copy_code` - codigo de copia (ex: OTP)

### 2.3 Mensagem de Imagem

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "image",
  "image": {
    "link": "https://exemplo.com/foto.jpg",
    "caption": "Foto do imovel"
  }
}
```

Ou usando media_id (apos upload):
```json
{
  "image": {
    "id": "MEDIA_ID",
    "caption": "Foto do imovel"
  }
}
```

### 2.4 Mensagem de Video

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "video",
  "video": {
    "link": "https://exemplo.com/video.mp4",
    "caption": "Tour virtual"
  }
}
```

### 2.5 Mensagem de Audio

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "audio",
  "audio": {
    "link": "https://exemplo.com/audio.ogg"
  }
}
```

**Nota**: Audio NAO suporta caption.

### 2.6 Mensagem de Documento

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "document",
  "document": {
    "link": "https://exemplo.com/proposta.pdf",
    "caption": "Proposta comercial",
    "filename": "Proposta_BGPGO.pdf"
  }
}
```

### 2.7 Mensagem de Sticker

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "sticker",
  "sticker": {
    "link": "https://exemplo.com/sticker.webp"
  }
}
```

### 2.8 Mensagem de Localizacao

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "location",
  "location": {
    "latitude": -23.550520,
    "longitude": -46.633308,
    "name": "Escritorio BGPGO",
    "address": "Av. Paulista, 1000, Sao Paulo"
  }
}
```

### 2.9 Mensagem de Contatos

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "contacts",
  "contacts": [
    {
      "name": {
        "formatted_name": "Joao Silva",
        "first_name": "Joao",
        "last_name": "Silva"
      },
      "phones": [
        { "phone": "+5511999999999", "type": "WORK" }
      ],
      "emails": [
        { "email": "joao@empresa.com", "type": "WORK" }
      ],
      "addresses": [
        {
          "street": "Av. Paulista, 1000",
          "city": "Sao Paulo",
          "state": "SP",
          "zip": "01310-100",
          "country": "Brasil",
          "type": "WORK"
        }
      ]
    }
  ]
}
```

### 2.10 Mensagem de Reacao

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "reaction",
  "reaction": {
    "message_id": "wamid.HBgNNTUxMTk5...",
    "emoji": "\ud83d\udc4d"
  }
}
```

Para remover reacao, enviar com `"emoji": ""`.

### 2.11 Responder/Citar Mensagem (Reply)

Adicionar `context` em qualquer tipo de mensagem:
```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "context": {
    "message_id": "wamid.HBgNNTUxMTk5..."
  },
  "type": "text",
  "text": {
    "body": "Sim, recebemos sua mensagem!"
  }
}
```

**GOTCHA**: So pode citar mensagens com ate **30 dias** de idade.

### 2.12 Interactive - Botoes de Resposta

Maximo de **3 botoes**.

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "header": {
      "type": "text",
      "text": "Status do Pedido"
    },
    "body": {
      "text": "Seu pedido #12345 esta em rota. O que deseja fazer?"
    },
    "footer": {
      "text": "Bertuzzi Patrimonial"
    },
    "action": {
      "buttons": [
        {
          "type": "reply",
          "reply": {
            "id": "rastrear",
            "title": "Rastrear"
          }
        },
        {
          "type": "reply",
          "reply": {
            "id": "suporte",
            "title": "Falar com Suporte"
          }
        },
        {
          "type": "reply",
          "reply": {
            "id": "cancelar",
            "title": "Cancelar Pedido"
          }
        }
      ]
    }
  }
}
```

- Cada `title` do botao: max **20 caracteres**
- `id`: max **256 caracteres** (voce recebe isso no webhook quando o usuario clica)

### 2.13 Interactive - Lista

Maximo de **10 itens** no total, organizados em secoes.

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "interactive",
  "interactive": {
    "type": "list",
    "header": {
      "type": "text",
      "text": "Ajuda e Suporte"
    },
    "body": {
      "text": "Como podemos ajudar? Selecione um topico:"
    },
    "footer": {
      "text": "Bertuzzi Patrimonial"
    },
    "action": {
      "button": "Selecionar Topico",
      "sections": [
        {
          "title": "Investimentos",
          "rows": [
            {
              "id": "consorcio",
              "title": "Consorcio",
              "description": "Informacoes sobre consorcio"
            },
            {
              "id": "previdencia",
              "title": "Previdencia",
              "description": "Planos de previdencia"
            }
          ]
        },
        {
          "title": "Suporte",
          "rows": [
            {
              "id": "status_proposta",
              "title": "Status da Proposta",
              "description": "Ver andamento"
            },
            {
              "id": "falar_consultor",
              "title": "Falar com Consultor",
              "description": "Atendimento humano"
            }
          ]
        }
      ]
    }
  }
}
```

- `button` (texto do botao principal): max **20 caracteres**
- `title` de cada row: max **24 caracteres**
- `description` de cada row: max **72 caracteres** (opcional)
- Maximo **10 secoes**, cada uma com ate **10 rows**

### 2.14 Interactive - CTA URL Button

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "interactive",
  "interactive": {
    "type": "cta_url",
    "header": {
      "type": "text",
      "text": "Sua Proposta"
    },
    "body": {
      "text": "Clique no botao abaixo para ver sua proposta personalizada."
    },
    "footer": {
      "text": "Bertuzzi Patrimonial"
    },
    "action": {
      "name": "cta_url",
      "parameters": {
        "display_text": "Ver Proposta",
        "url": "https://exemplo.com/proposta/12345"
      }
    }
  }
}
```

### 2.15 Rate Limits de Envio

| Limite | Valor |
|--------|-------|
| Throughput padrao | **80 msgs/segundo** por numero |
| Throughput maximo (tier Unlimited) | **1.000 msgs/segundo** |
| Par rate limit (mesmo destinatario) | **1 msg a cada 6 segundos** (~10/min) |
| Burst permitido | Ate **45 msgs** em 6s, depois aguardar proporcional |
| Upload de media | **25 requests/segundo** por numero |

**GOTCHA**: O par rate limit (131056) se aplica por par remetente-destinatario. Se enviar muitas mensagens para o MESMO numero em sequencia rapida, sera bloqueado.

---

## 3. Webhooks (Recebimento)

### 3.1 Configuracao

Configurar no App Dashboard > WhatsApp > Configuration:
- **Callback URL**: URL HTTPS do seu servidor
- **Verify Token**: string secreta que voce define
- **Webhook Fields**: marcar `messages` (obrigatorio)

**Requisitos do servidor:**
- HTTPS com certificado valido (NAO aceita self-signed)
- Responder em ate **5-10 segundos** (timeout rigoroso)
- Aceitar payloads de ate **3 MB**

### 3.2 Verificacao do Webhook (GET)

A Meta envia um GET para verificar seu endpoint:

```
GET /webhook?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=RANDOM_STRING
```

**Seu servidor deve:**
1. Verificar que `hub.mode` === `"subscribe"`
2. Verificar que `hub.verify_token` === seu token secreto
3. Responder com HTTP 200 e o valor de `hub.challenge` como body

**Exemplo Node.js:**
```typescript
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});
```

### 3.3 Recebendo Notificacoes (POST)

**Estrutura top-level de TODA notificacao:**
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WABA_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "5511999999999",
              "phone_number_id": "PHONE_NUMBER_ID"
            },
            "contacts": [...],
            "messages": [...],
            "statuses": [...],
            "errors": [...]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

### 3.4 Payload de Mensagem Recebida

```json
{
  "contacts": [
    {
      "profile": { "name": "Joao Silva" },
      "wa_id": "5511999999999"
    }
  ],
  "messages": [
    {
      "from": "5511999999999",
      "id": "wamid.HBgNNTUxMTk5...",
      "timestamp": "1711800000",
      "type": "text",
      "text": { "body": "Ola, gostaria de informacoes" }
    }
  ]
}
```

**Tipos de mensagem recebida (campo `type`):**

| Tipo | Campos | Descricao |
|------|--------|-----------|
| `text` | `text.body` | Mensagem de texto |
| `image` | `image.id`, `image.mime_type`, `image.sha256`, `image.caption` | Imagem |
| `video` | `video.id`, `video.mime_type`, `video.sha256`, `video.caption` | Video |
| `audio` | `audio.id`, `audio.mime_type`, `audio.sha256`, `audio.voice` | Audio (voice=true se gravado) |
| `document` | `document.id`, `document.mime_type`, `document.sha256`, `document.filename`, `document.caption` | Documento |
| `sticker` | `sticker.id`, `sticker.mime_type`, `sticker.sha256`, `sticker.animated` | Sticker |
| `location` | `location.latitude`, `location.longitude`, `location.name`, `location.address` | Localizacao |
| `contacts` | `contacts[].name`, `contacts[].phones[]` | Contato compartilhado |
| `interactive` | `interactive.type`, `interactive.button_reply` ou `interactive.list_reply` | Resposta de botao/lista |
| `button` | `button.text`, `button.payload` | Clique em botao de template |
| `reaction` | `reaction.message_id`, `reaction.emoji` | Reacao a mensagem |
| `order` | `order.catalog_id`, `order.product_items[]` | Pedido de catalogo |
| `system` | `system.body`, `system.type` | Mensagem de sistema |

**Resposta de botao interativo:**
```json
{
  "type": "interactive",
  "interactive": {
    "type": "button_reply",
    "button_reply": {
      "id": "rastrear",
      "title": "Rastrear"
    }
  }
}
```

**Resposta de lista interativa:**
```json
{
  "type": "interactive",
  "interactive": {
    "type": "list_reply",
    "list_reply": {
      "id": "consorcio",
      "title": "Consorcio",
      "description": "Informacoes sobre consorcio"
    }
  }
}
```

**Mensagem com contexto (reply):**
```json
{
  "context": {
    "from": "5511888888888",
    "id": "wamid.MENSAGEM_ORIGINAL"
  },
  "from": "5511999999999",
  "id": "wamid.RESPOSTA",
  "type": "text",
  "text": { "body": "Sim, confirmo" }
}
```

### 3.5 Payload de Status (Mensagens Enviadas)

Cada mensagem enviada pode gerar ate **3 callbacks de status**: sent -> delivered -> read.

```json
{
  "statuses": [
    {
      "id": "wamid.HBgNNTUxMTk5...",
      "status": "delivered",
      "timestamp": "1711800100",
      "recipient_id": "5511999999999",
      "conversation": {
        "id": "CONVERSATION_ID",
        "origin": {
          "type": "business_initiated"
        },
        "expiration_timestamp": "1711886400"
      },
      "pricing": {
        "billable": true,
        "pricing_model": "CBP",
        "category": "business_initiated"
      }
    }
  ]
}
```

**Valores de `status`:**

| Status | Descricao |
|--------|-----------|
| `sent` | Mensagem enviada para servidores WhatsApp |
| `delivered` | Mensagem entregue no dispositivo do usuario |
| `read` | Usuario abriu/leu a mensagem |
| `failed` | Falha na entrega (vem com objeto `errors`) |

**Status `failed` inclui erros:**
```json
{
  "status": "failed",
  "errors": [
    {
      "code": 131047,
      "title": "Re-engagement message",
      "message": "More than 24 hours have passed since the recipient last replied",
      "error_data": {
        "details": "Mensagem fora da janela de 24h"
      }
    }
  ]
}
```

### 3.6 Outros Tipos de Webhook (campo `field`)

| Field | Descricao |
|-------|-----------|
| `messages` | Mensagens recebidas e status de entrega |
| `message_template_status_update` | Template aprovado/rejeitado/pausado/desabilitado |
| `phone_number_quality_update` | Mudanca de qualidade (GREEN/YELLOW/RED) |
| `phone_number_name_update` | Aprovacao/rejeicao de display name |
| `account_update` | Violacoes de politica, restricoes |
| `business_capability_update` | Mudanca de tier de mensagens |
| `security` | Alertas de seguranca |
| `flows` | Disponibilidade de endpoints de Flows |

**Template status update exemplo:**
```json
{
  "field": "message_template_status_update",
  "value": {
    "event": "APPROVED",
    "message_template_id": "123456789",
    "message_template_name": "pedido_enviado",
    "message_template_language": "pt_BR"
  }
}
```

Status possiveis de template: `APPROVED`, `REJECTED`, `PENDING`, `DISABLED`, `PAUSED`, `LIMIT_EXCEEDED`

### 3.7 Verificacao de Assinatura (Seguranca)

Toda requisicao POST inclui header `X-Hub-Signature-256`:

```
X-Hub-Signature-256: sha256=<HASH>
```

**Validacao (Node.js):**
```typescript
import crypto from 'crypto';

function verifyWebhookSignature(rawBody: Buffer, signature: string, appSecret: string): boolean {
  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)  // DEVE ser o body RAW, antes de JSON.parse
    .digest('hex');

  const receivedHash = signature.replace('sha256=', '');

  return crypto.timingSafeEqual(
    Buffer.from(expectedHash, 'hex'),
    Buffer.from(receivedHash, 'hex')
  );
}
```

**GOTCHA CRITICO**: Voce DEVE verificar contra o **body RAW** (Buffer), ANTES de qualquer middleware de parsing JSON. A Meta usa Unicode escapado na geracao da assinatura, entao se o middleware alterar o body, a assinatura nao vai bater.

### 3.8 Comportamento de Retry

| Aspecto | Valor |
|---------|-------|
| Condicao de retry | Endpoint nao retorna HTTP 200 ou timeout |
| Estrategia | Exponential backoff |
| Duracao maxima | **7 dias** de tentativas |
| Apos 7 dias | Notificacao descartada permanentemente |
| Dead letter queue | **Nao existe** |
| Garantia de entrega | At-least-once (pode duplicar) |
| Garantia de ordem | **Nenhuma** (mensagens podem chegar fora de ordem) |

**Regra de ouro**: Responda HTTP 200 IMEDIATAMENTE, processe assincronamente depois (use fila como Redis/Bull).

**Capacidade recomendada pela Meta**: Seus servidores devem aguentar **3x o trafego de saida + 1x o trafego de entrada**.

---

## 4. Gerenciamento de Templates

### 4.1 Criar Template

```
POST https://graph.facebook.com/v23.0/{WABA_ID}/message_templates
```

```json
{
  "name": "pedido_enviado",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
    {
      "type": "HEADER",
      "format": "IMAGE",
      "example": {
        "header_handle": ["HANDLE_DO_UPLOAD"]
      }
    },
    {
      "type": "BODY",
      "text": "Ola {{1}}, seu pedido {{2}} foi enviado via {{3}}.",
      "example": {
        "body_text": [["Joao", "12345", "FedEx"]]
      }
    },
    {
      "type": "FOOTER",
      "text": "Bertuzzi Patrimonial"
    },
    {
      "type": "BUTTONS",
      "buttons": [
        {
          "type": "QUICK_REPLY",
          "text": "Rastrear Pedido"
        },
        {
          "type": "URL",
          "text": "Ver Detalhes",
          "url": "https://exemplo.com/pedido/{{1}}",
          "example": ["https://exemplo.com/pedido/12345"]
        },
        {
          "type": "PHONE_NUMBER",
          "text": "Ligar",
          "phone_number": "+5511999999999"
        }
      ]
    }
  ]
}
```

**Resposta de sucesso:**
```json
{
  "id": "123456789",
  "status": "PENDING",
  "category": "UTILITY"
}
```

### 4.2 Categorias de Template

| Categoria | Uso | Custo |
|-----------|-----|-------|
| `MARKETING` | Promocoes, ofertas, newsletters | **Mais caro** |
| `UTILITY` | Confirmacoes, lembretes, recibos | Medio (gratis dentro CSW) |
| `AUTHENTICATION` | OTP, codigos de verificacao | Medio |

**GOTCHA**: Se a Meta considerar que o conteudo nao bate com a categoria, ela pode reclassificar automaticamente (ex: UTILITY com promocao vira MARKETING).

### 4.3 Componentes do Template

| Componente | Obrigatorio | Formatos/Limites |
|------------|-------------|------------------|
| `HEADER` | Nao | text (60 chars), IMAGE, VIDEO, DOCUMENT |
| `BODY` | **Sim** | Texto com variaveis {{1}}, {{2}}... (1024 chars) |
| `FOOTER` | Nao | Texto simples, 60 chars, SEM variaveis |
| `BUTTONS` | Nao | Max 3 botoes (QUICK_REPLY, URL, PHONE_NUMBER, COPY_CODE) |

**Header media limits:**
- Imagem/video/documento: < 15 MB no header do template

### 4.4 Listar Templates

```
GET https://graph.facebook.com/v23.0/{WABA_ID}/message_templates
    ?fields=name,status,category,language,components
    &status=APPROVED
    &limit=100
```

Filtros disponiveis: `status` (APPROVED, PENDING, REJECTED, PAUSED, DISABLED)

### 4.5 Editar Template

```
POST https://graph.facebook.com/v23.0/{TEMPLATE_ID}
```

**GOTCHA**: So pode editar templates com status `APPROVED`. Templates editados voltam para `PENDING` para re-aprovacao.

### 4.6 Deletar Template

```
DELETE https://graph.facebook.com/v23.0/{WABA_ID}/message_templates
    ?name=pedido_enviado
```

Ou por ID:
```
DELETE https://graph.facebook.com/v23.0/{WABA_ID}/message_templates
    ?hsm_id=TEMPLATE_ID
```

### 4.7 Fluxo de Aprovacao

1. Template criado -> status `PENDING`
2. Meta revisa (geralmente < 24h, pode levar mais)
3. Resultado: `APPROVED`, `REJECTED`, ou `PENDING` (aguardando)
4. Webhook `message_template_status_update` notifica mudancas
5. Templates rejeitados podem ser editados e reenviados

### 4.8 Qualidade e Pausa de Templates

- Templates com muitos bloqueios/reports dos usuarios recebem qualidade baixa
- Meta pode **pausar** templates com qualidade ruim (status `PAUSED`)
- Templates pausados repetidamente sao **desabilitados** permanentemente (status `DISABLED`)
- **NAO ha como apelar** de um template desabilitado

---

## 5. Janela de 24 Horas e Precificacao

### 5.1 Regras da Janela de 24h

**Janela ABRE quando:**
- Cliente envia mensagem para voce
- Cliente faz ou aceita uma ligacao
- Timer de 24h inicia (ou reinicia se ja estava aberta)

**Janela de 72h (entry points gratuitos):**
- Cliente veio de anuncio Click-to-WhatsApp (Facebook/Instagram Ads)
- Cliente veio de botao CTA da pagina do Facebook
- 72h de mensagens GRATUITAS (todos os tipos, incluindo templates)

**Durante janela aberta:**
- Pode enviar QUALQUER tipo de mensagem (texto, media, interativa)
- Mensagens de servico: **GRATUITAS**
- Templates utility: **GRATUITOS** dentro da janela (desde julho 2025)

**Janela FECHADA (sem mensagem do cliente ha >24h):**
- APENAS templates podem ser enviados
- Templates sao COBRADOS conforme categoria

### 5.2 Modelo de Precificacao (Julho 2025+)

**MUDANCA CRITICA**: Desde 1 de julho de 2025, a Meta migrou de cobranca por conversa para **cobranca por mensagem**.

| Tipo | Cobranca | Notas |
|------|----------|-------|
| Mensagens de servico (respostas na janela 24h) | **GRATIS** | Desde nov 2024, ilimitado |
| Templates UTILITY dentro da CSW | **GRATIS** | Desde jul 2025 |
| Templates UTILITY fora da CSW | **PAGO** | Por mensagem |
| Templates MARKETING | **PAGO** | Mais caro, por mensagem |
| Templates AUTHENTICATION | **PAGO** | Por mensagem |
| Entry points gratuitos (72h) | **GRATIS** | Todos os tipos |

**Precos variam por pais** (baseado no codigo de pais do destinatario).

**Descontos por volume**: Desde julho 2025, templates UTILITY e AUTHENTICATION tem desconto progressivo por volume mensal.

### 5.3 Como Verificar se Janela Esta Aberta

A API NAO tem endpoint para checar diretamente se a janela esta aberta. Voce precisa:

1. **Rastrear no seu banco**: salvar timestamp da ultima mensagem recebida de cada contato
2. **Verificar**: `agora - ultima_mensagem_recebida < 24h`
3. **Alternativa**: tentar enviar mensagem free-form; se der erro 131047, a janela esta fechada

**GOTCHA**: O campo `conversation.expiration_timestamp` nos webhooks de status indica quando a janela expira.

---

## 6. Media (Upload/Download)

### 6.1 Upload de Media

```
POST https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}/media
```

**Headers:**
```
Authorization: Bearer {TOKEN}
Content-Type: multipart/form-data
```

**Form data:**
- `file`: arquivo binario
- `type`: MIME type (ex: "image/jpeg")
- `messaging_product`: "whatsapp"

**Resposta:**
```json
{
  "id": "MEDIA_ID"
}
```

**Rate limit**: 25 uploads/segundo por numero.

### 6.2 Obter URL de Download

```
GET https://graph.facebook.com/v23.0/{MEDIA_ID}
```

**Resposta:**
```json
{
  "url": "https://lookaside.fbsbx.com/whatsapp_business/...",
  "mime_type": "image/jpeg",
  "sha256": "HASH",
  "file_size": 123456,
  "id": "MEDIA_ID",
  "messaging_product": "whatsapp"
}
```

### 6.3 Download do Arquivo

```
GET {URL_RETORNADA_ACIMA}
Authorization: Bearer {TOKEN}
```

**GOTCHA**: A URL de download requer o mesmo Bearer token. NAO e uma URL publica.

### 6.4 Deletar Media

```
DELETE https://graph.facebook.com/v23.0/{MEDIA_ID}
```

### 6.5 Tipos Suportados e Limites

| Tipo | Formatos | MIME Types | Max |
|------|----------|------------|-----|
| **Audio** | AAC, AMR, MP3, M4A, OGG (Opus) | audio/aac, audio/amr, audio/mpeg, audio/mp4, audio/ogg | **16 MB** |
| **Documento** | PDF, DOC(X), XLS(X), PPT(X), TXT | application/pdf, application/msword, application/vnd.openxmlformats-*, text/plain | **100 MB** |
| **Imagem** | JPEG, PNG | image/jpeg, image/png | **5 MB** |
| **Sticker estático** | WEBP | image/webp | **100 KB** |
| **Sticker animado** | WEBP | image/webp | **500 KB** |
| **Video** | MP4 (H.264), 3GP | video/mp4, video/3gp | **16 MB** |

### 6.6 Ciclo de Vida do Media ID

- Media IDs expiram apos **30 dias**
- Apos expiracao, voce precisa fazer upload novamente
- Media IDs sao vinculados ao PHONE_NUMBER_ID que fez o upload
- Media recebida (do usuario) tambem expira em 30 dias

**GOTCHA**: Rate limit de download: sem limite fixo de RPS para downloads bem-sucedidos, mas ha throttle baseado em erros (20 erros em 60 minutos aciona bloqueio).

---

## 7. Perfil do Business

### 7.1 Ler Perfil

```
GET https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}/whatsapp_business_profile
    ?fields=about,address,description,email,profile_picture_url,websites,vertical
```

### 7.2 Atualizar Perfil

```
POST https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}/whatsapp_business_profile
```

```json
{
  "messaging_product": "whatsapp",
  "about": "Consultoria em patrimonio e investimentos",
  "address": "Av. Paulista, 1000, Sao Paulo - SP",
  "description": "A Bertuzzi Patrimonial oferece solucoes completas em gestao patrimonial.",
  "email": "contato@bertuzzipatrimonial.app.br",
  "websites": [
    "https://bertuzzipatrimonial.app.br"
  ],
  "vertical": "FINANCE"
}
```

**Campos disponiveis:**

| Campo | Descricao | Limite |
|-------|-----------|--------|
| `about` | Texto "Sobre" (visivel no perfil) | 139 chars |
| `address` | Endereco do negocio | 256 chars |
| `description` | Descricao longa | 512 chars |
| `email` | Email de contato | - |
| `websites` | URLs do negocio | Max 2 URLs |
| `vertical` | Categoria do negocio | enum (FINANCE, HEALTH, etc.) |
| `profile_picture_url` | URL da foto do perfil | Somente leitura (alterar via Business Manager) |

---

## 8. Gerenciamento de Numero de Telefone

### 8.1 Registrar Numero

```
POST https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}/register
{
  "messaging_product": "whatsapp",
  "pin": "123456"
}
```

### 8.2 Desregistrar Numero

```
POST https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}/deregister
{
  "messaging_product": "whatsapp"
}
```

### 8.3 Verificacao em 2 Etapas (2FA PIN)

**Definir/alterar PIN:**
O PIN e definido durante o registro. Para alterar, use o WhatsApp Manager (Settings > Registration PIN).

**GOTCHA**: NAO existe endpoint de API para desabilitar 2FA. Apenas para defini-lo.

**Importante para migracao**: Ao migrar numero de outro provedor, a 2FA deve ser desabilitada ANTES da migracao.

### 8.4 Status do Numero

| Status | Descricao |
|--------|-----------|
| `CONNECTED` | Numero ativo e funcionando |
| `FLAGGED` | Qualidade baixa, em risco de restricao |
| `RESTRICTED` | Nao pode enviar templates de marketing |
| `BANNED` | Numero banido permanentemente |

---

## 9. Saude, Qualidade e Limites

### 9.1 Tiers de Mensagens (Desde Outubro 2025)

**MUDANCA CRITICA**: Desde 7 de outubro de 2025, limites sao por **portfolio de negocio** (compartilhado entre todos os numeros), NAO mais por numero individual.

| Tier | Limite (24h rolling) | Como alcancar |
|------|---------------------|---------------|
| **Tier 0** (nao verificado) | 250 msgs | Default para novos |
| **Tier 1** | 1.000 msgs | Verificar negocio no Business Manager |
| **Tier 2** | 10.000 msgs | Enviar 1.000+ msgs com boa qualidade em 30 dias |
| **Tier 3** | 100.000 msgs | Manter qualidade alta com volume |
| **Tier 4** (Unlimited) | **Ilimitado** | Excelente qualidade sustentada |

**Verificacao de tier**: A Meta avalia upgrades a cada **6 horas** (antes era 24-48h).

**Portfolio herda o maior**: Quando a mudanca entrou, cada portfolio herdou o maior limite entre seus numeros.

### 9.2 Quality Rating

Baseado nos ultimos **7 dias**, ponderado por recencia:

| Rating | Cor | Significado |
|--------|-----|-------------|
| `HIGH` | Verde | Boa qualidade |
| `MEDIUM` | Amarelo | Alerta, pode escalar |
| `LOW` | Vermelho | Risco de FLAGGED/RESTRICTED |

**O que derruba a qualidade:**
- Bloqueios por usuarios
- Reports de spam
- Mute de conversas
- Arquivamento de conversas
- Motivos fornecidos pelos usuarios ao bloquear

**Webhook de mudanca de qualidade:**
```json
{
  "field": "phone_number_quality_update",
  "value": {
    "display_phone_number": "5511999999999",
    "event": "FLAGGED",
    "current_limit": "TIER_1K"
  }
}
```

### 9.3 Throughput (MPS - Messages Per Second)

| Nivel | MPS |
|-------|-----|
| Padrao | ~80 MPS |
| Unlimited tier | Ate 1.000 MPS (auto-upgrade) |

---

## 10. Seguranca e Compliance

### 10.1 Verificacao de Assinatura do Webhook

Ver secao 3.7 para implementacao completa. Pontos criticos:

- **SEMPRE** verificar `X-Hub-Signature-256` em producao
- Usar **comparacao timing-safe** (`crypto.timingSafeEqual`)
- Verificar contra o **body RAW** (antes de JSON.parse)
- App Secret fica em App Dashboard > Settings > Basic

### 10.2 Seguranca de Token

- **NUNCA** embedar token em app mobile/desktop
- Armazenar em variavel de ambiente (`.env`)
- Usar secret managers em producao (AWS Secrets Manager, Vault)
- Tokens so devem existir no servidor backend
- Revisar acessos regularmente no Meta Business Suite

### 10.3 GDPR / Protecao de Dados

- WhatsApp usa criptografia end-to-end para mensagens de usuarios
- Cloud API processa mensagens nos servidores da Meta (dados transitam pela infra Meta)
- Voce e responsavel por obter consentimento (opt-in) antes de enviar mensagens
- Deve oferecer mecanismo de opt-out (ex: responder "SAIR")
- Dados de media expiram em 30 dias nos servidores da Meta

### 10.4 Opt-out Handling

- **Obrigatorio**: oferecer forma do usuario parar de receber mensagens
- Recomendacao: processar palavras-chave como "SAIR", "PARAR", "STOP"
- Desde 2025, usuarios podem marcar "Stop receiving marketing messages" diretamente no WhatsApp
- Quando usuario opt-out de marketing: erro 131050 ao tentar enviar marketing template

---

## 11. Codigos de Erro

### 11.1 Erros de Autorizacao

| Codigo | HTTP | Descricao | Solucao |
|--------|------|-----------|---------|
| 0 | 401 | AuthException - token invalido | Renovar token |
| 3 | - | API Method - permissao insuficiente | Verificar scopes |
| 10 | 403 | Permission Denied | Verificar permissoes do System User |
| 100 | 400 | Invalid parameter | Verificar parametros na request |
| 190 | 401 | Access token expirado | Gerar novo token (usar permanente!) |
| 200-299 | 403 | API Permission | Adicionar permissao necessaria |

### 11.2 Erros de Throttling / Rate Limit

| Codigo | HTTP | Descricao | Solucao |
|--------|------|-----------|---------|
| 4 | 429 | Too Many Calls | Reduzir frequencia de chamadas |
| 80007 | 429 | WABA rate limit | Aguardar e retry com backoff |
| 130429 | 429 | Cloud API throughput limit | Retry com backoff exponencial (4^X segundos) |
| 131048 | 429 | Spam rate limit | Muitas mensagens bloqueadas/flagged. Melhorar qualidade |
| 131056 | 429 | Par rate limit (mesmo destinatario) | Aguardar antes de enviar ao mesmo numero |
| 133016 | 429 | Register/deregister rate limit | Muitas tentativas de registro |

### 11.3 Erros de Mensagem / Entrega

| Codigo | HTTP | Descricao | Solucao |
|--------|------|-----------|---------|
| 131000 | 500 | Erro desconhecido | Retry |
| 131005 | 403 | Access denied | Verificar permissoes |
| 131008 | 400 | Parametro obrigatorio ausente | Verificar payload |
| 131009 | 400 | Parametro invalido | Corrigir valor do parametro |
| 131016 | 500 | Servico indisponivel | Retry com backoff |
| 131021 | 400 | Destinatario = remetente | Nao enviar para si mesmo |
| 131026 | 400 | Msg nao entregavel | Usuario inativo, sem WhatsApp, ou app desatualizado |
| 131031 | 403 | Conta bloqueada | Conta restrita/desabilitada |
| 131037 | 400 | Display name nao aprovado | Aguardar aprovacao do nome |
| 131042 | 402 | Problema de pagamento | Configurar metodo de pagamento |
| 131045 | 400 | Certificado incorreto | Erro no registro do numero |
| 131047 | 400 | **Fora da janela 24h** | Usar template message |
| 131049 | - | Meta optou por nao entregar | Meta suprimiu para manter engajamento |
| 131050 | 400 | Usuario parou marketing | Respeitar opt-out |
| 131051 | 400 | Tipo de mensagem nao suportado | Verificar tipo na doc |
| 131052 | 400 | Erro download de media | Media do usuario nao pode ser baixada |
| 131053 | 400 | Erro upload de media | Problema no upload |
| 131057 | 503 | Conta em manutencao | Aguardar |
| 130472 | - | Numero em experimento | Numero bloqueado por experimento da Meta |
| 130497 | 403 | Pais restrito | Nao pode enviar para este pais |

### 11.4 Erros de Template

| Codigo | HTTP | Descricao | Solucao |
|--------|------|-----------|---------|
| 132000 | 400 | Param count mismatch | Numero de variaveis nao bate com template |
| 132001 | 400 | Template nao existe | Template nao aprovado ou idioma errado |
| 132005 | 400 | Texto hydratado muito longo | Variaveis tornam texto maior que o limite |
| 132007 | 400 | Politica de caracteres violada | Conteudo viola politica do WhatsApp |
| 132012 | 400 | Formato de parametro errado | Formatar parametros corretamente |
| 132015 | 400 | Template pausado | Template com qualidade ruim, pausado |
| 132016 | 400 | Template desabilitado | Template desabilitado permanentemente |
| 132068 | 400 | Flow bloqueado | WhatsApp Flow em estado bloqueado |
| 132069 | 429 | Flow throttled | Max 10 msgs com este Flow em 1 hora |

### 11.5 Erros de Registro

| Codigo | HTTP | Descricao | Solucao |
|--------|------|-----------|---------|
| 133000 | - | Deregistration incompleto | Tentativa anterior falhou |
| 133004 | 503 | Servidor indisponivel | Retry |
| 133005 | 400 | PIN 2FA errado | Corrigir PIN |
| 133006 | 400 | Numero precisa re-verificacao | Verificar novamente |
| 133008 | 429 | Muitas tentativas de PIN | Aguardar |
| 133009 | 429 | PIN digitado rapido demais | Aguardar |
| 133010 | 400 | Numero nao registrado | Registrar o numero primeiro |
| 133015 | 400 | Aguardar antes de registrar | Numero deletado recentemente |
| 135000 | 400 | Erro generico | Verificar parametros |

### 11.6 Estrategia de Retry

```typescript
async function sendWithRetry(payload: any, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await sendMessage(payload);
      return response;
    } catch (error) {
      const code = error.response?.data?.error?.code;

      // Erros que NAO devem ter retry (problema no request)
      if ([131008, 131009, 131021, 131047, 132000, 132001].includes(code)) {
        throw error; // Nao adianta retry
      }

      // Erros de rate limit - retry com backoff
      if ([4, 80007, 130429, 131048, 131056].includes(code)) {
        const waitTime = Math.pow(4, attempt) * 1000; // 1s, 4s, 16s, 64s, 256s
        await sleep(waitTime);
        continue;
      }

      // Erros de servidor - retry com backoff menor
      if ([131000, 131016, 133004].includes(code)) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      throw error; // Erro desconhecido
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

## 12. WhatsApp Flows

### 12.1 O que sao

WhatsApp Flows sao formularios interativos multi-tela dentro do WhatsApp. Permitem coletar dados, criar pesquisas, agendar reunioes e mais, sem o usuario sair do app.

### 12.2 Capacidades

- Campos de texto, dropdowns, date pickers, toggle switches
- Navegacao multi-tela (linear ou condicional)
- Conexao com endpoints externos para dados dinamicos
- Categorias: SURVEY, LEAD_GENERATION, APPOINTMENT_BOOKING, CUSTOMER_SUPPORT, OTHER

### 12.3 Criar Flow via API

```
POST https://graph.facebook.com/v23.0/{WABA_ID}/flows
{
  "name": "Pesquisa Satisfacao",
  "categories": ["SURVEY"]
}
```

### 12.4 Atualizar FlowJSON

```
POST https://graph.facebook.com/v23.0/{FLOW_ID}/assets
```

Upload do FlowJSON que define as telas, campos e navegacao.

### 12.5 Publicar Flow

```
POST https://graph.facebook.com/v23.0/{FLOW_ID}/publish
```

**GOTCHA**: Flows publicados NAO podem ser editados. Voce precisa clonar e criar um novo.

### 12.6 Enviar Mensagem com Flow

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "interactive",
  "interactive": {
    "type": "flow",
    "header": {
      "type": "text",
      "text": "Pesquisa de Satisfacao"
    },
    "body": {
      "text": "Gostaríamos de saber sua opiniao. Clique abaixo para responder."
    },
    "footer": {
      "text": "Bertuzzi Patrimonial"
    },
    "action": {
      "name": "flow",
      "parameters": {
        "flow_message_version": "3",
        "flow_id": "FLOW_ID",
        "flow_cta": "Responder Pesquisa",
        "mode": "published",
        "flow_action": "navigate",
        "flow_action_payload": {
          "screen": "TELA_INICIAL"
        }
      }
    }
  }
}
```

### 12.7 Limitacoes

- Rate limit: max **10 mensagens com o mesmo Flow por hora** (erro 132069)
- Flows so funcionam via API (nao via WhatsApp Business App)
- Endpoint externo pode ter latencia
- Restricoes de quantidade de telas e componentes
- Pagamento nativo nao disponivel em todas as regioes

---

## 13. Catalogo e Comercio

### 13.1 Mensagem de Produto Unico

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "interactive",
  "interactive": {
    "type": "product",
    "body": {
      "text": "Confira nosso plano de previdencia:"
    },
    "footer": {
      "text": "Bertuzzi Patrimonial"
    },
    "action": {
      "catalog_id": "CATALOG_ID",
      "product_retailer_id": "PRODUCT_ID"
    }
  }
}
```

### 13.2 Mensagem de Lista de Produtos

```json
{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "interactive",
  "interactive": {
    "type": "product_list",
    "header": {
      "type": "text",
      "text": "Nossos Produtos"
    },
    "body": {
      "text": "Veja nossas opcoes de investimento:"
    },
    "footer": {
      "text": "Bertuzzi Patrimonial"
    },
    "action": {
      "catalog_id": "CATALOG_ID",
      "sections": [
        {
          "title": "Previdencia",
          "product_items": [
            { "product_retailer_id": "PREV_001" },
            { "product_retailer_id": "PREV_002" }
          ]
        },
        {
          "title": "Consorcio",
          "product_items": [
            { "product_retailer_id": "CONS_001" }
          ]
        }
      ]
    }
  }
}
```

### 13.3 Recebendo Pedidos (Webhook)

```json
{
  "type": "order",
  "order": {
    "catalog_id": "CATALOG_ID",
    "product_items": [
      {
        "product_retailer_id": "PRODUCT_ID",
        "quantity": 1,
        "item_price": 99.90,
        "currency": "BRL"
      }
    ],
    "text": "Observacao do cliente"
  }
}
```

---

## 14. Migracao e Coexistencia

### 14.1 Migrar Numero do WhatsApp Business App para Cloud API

**Processo:**
1. Desabilitar 2FA no WhatsApp Business App
2. Deletar a conta do WhatsApp Business App no celular
3. Adicionar o numero ao WABA via Meta Business Manager
4. Verificar e registrar (ver secao 8.1)

**GOTCHA**: Ao deletar do app, voce PERDE o historico de mensagens do app. Faca backup antes.

### 14.2 Coexistencia (Maio 2025+)

Desde maio 2025, a Meta lancou o modo **Coexistence** que permite usar o **mesmo numero** no WhatsApp Business App E na Cloud API simultaneamente.

**Como funciona:**
- Mensagens sincronizadas entre App e API (ultimos 6 meses)
- App continua funcionando para conversas 1:1
- API para automacoes e envio em escala
- Mensagens via App: gratuitas
- Mensagens via API: cobranca normal da Cloud API

**Requisitos:**
- WhatsApp Business App versao **2.24.17+**
- Onboarding via Embedded Signup com opcao Coexistence

**Limitacoes do Coexistence:**
- Grupos NAO sincronizam
- Mensagens que desaparecem nao funcionam mais em 1:1
- View-once media desabilitada
- Localizacao ao vivo desabilitada
- Listas de transmissao viram somente leitura
- Novas listas de campanha nao podem ser criadas

### 14.3 Migrar de On-Premises API para Cloud API

A On-Premises API foi descontinuada em **outubro 2025**. Todos os usuarios devem migrar para Cloud API.

### 14.4 Migrar Numero entre Provedores (BSPs)

```
POST https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}/migrate
```

Pode ser feito via Embedded Signup sem downtime significativo.

---

## 15. Gotchas e Comportamentos Nao-Documentados

### 15.1 Criticos para Implementacao

1. **Body RAW para verificacao de webhook**: A assinatura DEVE ser verificada contra o body cru, antes de qualquer parsing JSON. A Meta usa Unicode escapado que muda apos parse.

2. **Webhooks podem chegar fora de ordem**: `delivered` pode chegar antes de `sent`. Use timestamps, nao ordem de chegada.

3. **Webhook at-least-once**: Voce PODE receber o mesmo webhook mais de uma vez. Use `message_id` / `status_id` como chave de deduplicacao (Redis com TTL curto).

4. **Erro 131049 (Meta chose not to deliver)**: A Meta pode simplesmente decidir nao entregar sua mensagem de marketing para "manter engajamento do ecossistema". NAO e um erro do seu lado.

5. **Erro 131050 (User stopped marketing)**: Desde 2025, usuarios podem opt-out de marketing direto no WhatsApp sem voce saber. Voce so descobre quando tenta enviar.

6. **Templates podem ser reclassificados**: Voce cria como UTILITY, a Meta pode reclassificar como MARKETING se o conteudo parecer promocional.

7. **Media IDs expiram em 30 dias**: Nao persista media_id no banco como referencia permanente. Baixe e armazene o arquivo.

8. **Par rate limit e silencioso**: O erro 131056 pode pegar voce desprevenido se enviar varias mensagens seguidas para o mesmo contato (ex: mensagem + imagem + documento rapidamente).

9. **Janela de 24h NAO tem API de consulta**: Voce precisa rastrear no seu banco. O unico sinal e o `expiration_timestamp` no webhook de status.

10. **Responder HTTP 200 PRIMEIRO**: Se seu webhook demorar para responder, a Meta vai considerar falha e fazer retry, gerando duplicatas. Processe async.

### 15.2 Mudancas Recentes (2025-2026)

| Data | Mudanca |
|------|---------|
| Abril 2025 | Templates de marketing pausados para numeros dos EUA |
| Maio 2025 | Lancamento do modo Coexistence |
| Julho 2025 | Mudanca para cobranca por mensagem (deprecia por conversa) |
| Julho 2025 | Templates UTILITY gratis dentro da CSW |
| Julho 2025 | Descontos por volume para UTILITY e AUTHENTICATION |
| Outubro 2025 | Limites de mensagens por portfolio (nao mais por numero) |
| Outubro 2025 | Verificacao de tier a cada 6h (antes 24-48h) |
| Outubro 2025 | On-Premises API descontinuada |

### 15.3 Capacidade de Infraestrutura

Para nosso CRM BGPGO, considerando o volume atual:

- **Throughput necessario**: ~80 MPS padrao e mais que suficiente
- **Webhook handling**: Processar async com fila (Bull/Redis)
- **Deduplicacao**: Redis com TTL de 5 minutos usando message_id
- **Media storage**: Baixar e armazenar no Supabase Storage (nao confiar no media_id)
- **Janela tracking**: Tabela `whatsapp_conversations` com `last_customer_message_at`
- **Rate control**: Manter o `dailyLimitService.ts` existente, adaptar para limites da API oficial

---

## Fontes

- [WhatsApp Cloud API - Documentacao Oficial](https://developers.facebook.com/docs/whatsapp/cloud-api/)
- [WhatsApp Business Management API](https://developers.facebook.com/docs/whatsapp/business-management-api/)
- [Messages Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages/)
- [Webhook Components](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components/)
- [Error Codes](https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/)
- [Media Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media/)
- [Messaging Limits](https://developers.facebook.com/docs/whatsapp/messaging-limits/)
- [Pricing Updates July 2025](https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing/)
- [WhatsApp Flows](https://developers.facebook.com/docs/whatsapp/flows/)
- [Template Management](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/)
- [Business Profiles](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/business-profiles/)
- [Registration](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/registration/)
- [Two-Step Verification](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/two-step-verification/)
- [Auth Tokens Blog Post](https://developers.facebook.com/blog/post/2022/12/05/auth-tokens/)
- [WhatsApp Webhook Guide (Hookdeck)](https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices)
- [WhatsApp API Pricing 2026 (respond.io)](https://respond.io/blog/whatsapp-business-api-pricing)
- [Messaging Limits Changes Oct 2025 (Wati)](https://support.wati.io/en/articles/12458014-messaging-limit-updates-effective-oct-7-2025)
- [Error Codes Reference (WA Bridge)](https://wabridge.com/help/whatsapp-cloud-api-error-codes)
- [Supported Media Types (AWS)](https://docs.aws.amazon.com/social-messaging/latest/userguide/supported-media-types.html)
