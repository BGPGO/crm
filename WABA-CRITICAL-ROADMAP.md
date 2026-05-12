# Roadmap dos templates CRITICAL

> Snapshot 2026-05-12 (atualizado). Atualizar conforme métricas evoluem (`/api/wa/templates/health` ou painel `/waba/templates`).
>
> **Atualização 2026-05-12 ~15h SP**: todos os 5 templates editados foram **re-aprovados** pela Meta. `lembrete_reuniao_15min` foi **recategorizado pra UTILITY** (isento de 131049). Novo template `lead_recebido_v1_utility` aprovado e em uso via nova automação `Lead → Boas-vindas UTILITY (WABA)`.

## Resumo

| Template | Fail rate 7d | Status Meta | Estratégia |
|----------|-------------|-------------|------------|
| `cadencia_d4_prova` | 53,5% | APPROVED (re-eval) | Manter pausado, observar 7d, reescrever conteúdo se taxa não cair |
| `cadencia_d1_abertura` | 27,4% | APPROVED (re-eval) | Substituir por UTILITY de acknowledgment quando aprovar |
| `marcar_reuniao__quanto_deu_resultado` | 28,4% | APPROVED (re-eval) | Aguardar re-eval, se piorar, retirar do funil |
| `lembrete_reuniao_15min` | 35,7% | APPROVED **UTILITY** ✅ | Meta recategorizou pra UTILITY após nossa edit. Saiu do cap 131049 sem precisar do v2. Mantém v2_utility como alternativa. |
| `lembrete_reuniao_60min` | 20% | APPROVED | **Já substituído** por `_v2_utility` no `TEMPLATE_MAP` — fica como fallback |

---

## Por template

### 1. `cadencia_d4_prova` — 53,5% fail (pior)

**Contexto**: 4º toque da cadência "Lead → Contato Feito", focado em prova social. Conteúdo atual (após edit):
> "Empresas que passaram pelo nosso diagnóstico identificaram em média 15% dos custos que passavam despercebidos..."

**Por que tão crítico**: provavelmente combinação de (a) base saturada já no 4º toque, (b) claim quantitativo ("15% dos custos") aciona alertas de quality, (c) público alvo BGP é alto-valor → mais assediado por marketing financeiro de outras marcas.

**Estratégia em camadas**:

**Curto prazo (próximas 24-72h)**:
- Cadência onde ele vive (`Cadência Lead → Contato Feito — WABA`) está PAUSADA — não vai enviar até reativação manual
- Aguardar re-evaluation Meta (status já APPROVED, quality_score em UNKNOWN = sem dados acumulados)

**Médio prazo (1-2 semanas)**:
- Quando reativar a cadência, **REDUZIR FREQUÊNCIA**: trocar enrollment automático por entry manual (só leads que SDR avaliou como qualificados)
- A/B test: criar `cadencia_d4_prova_v2_storytelling` sem claims numéricos, mais narrativa

**Longo prazo**:
- Considerar **eliminar do 7-step**: substituir D4 por nada (espaçar D3→D5 mais) OU por um **toque humano** (notificação pro SDR ligar)
- O retorno marginal de cada toque após D3 cai exponencialmente — vale rever se justifica o risco quality

---

### 2. `cadencia_d1_abertura` — 27,4% fail

**Contexto**: PRIMEIRO toque após lead entrar pela LP. Crítico ter porque inicia o relacionamento.

**Edit feito**: correção ortográfica ("e a Bia" → "é a Bia", "voce" → "você") + reformulação pra remover redundância.

**Estratégia em camadas**:

**Curto prazo**:
- O novo template **`lead_recebido_v1_utility`** (submetido hoje, PENDING) **substitui parcialmente** esse template. Pra leads novos que entrarem com cadência pausada, ele atende com 0% de 131049.

**Médio prazo (quando UTILITY for aprovado)**:
- Criar cadência `Lead → Acknowledgment UTILITY` com 1 step só (o novo UTILITY).
- O `cadencia_d1_abertura` antigo permanece como **2º toque** da cadência marketing (D2 do novo enroll), pra quando reativarmos a cadência completa.
- Em vez de ser D1, vira D2 → menos pressão sobre quality.

**Longo prazo**:
- Reescrever o conteúdo pra ser mais conversacional/menos transacional ("Vi que você se cadastrou... posso te perguntar 2 coisas pra preparar a melhor conversa?"). Convidar resposta = abre janela 24h = sai do cap.

---

### 3. `marcar_reuniao__quanto_deu_resultado` — 28,4% fail / 196 envios (maior volume)

**Contexto**: Template usado quando lead entra no estágio "Marcar reunião" e ainda não agendou. Disparado por mudança de stage no funil.

**Edit feito**: completou frase incompleta ("Se a resposta demorou mais de 10s:" → "Se a resposta não saiu na hora, esse diagnóstico é pra você:").

**Estratégia em camadas**:

**Curto prazo**:
- Cadência "Etapa 3 — Marcar reunião WABA" PAUSADA — não envia até reativação
- Quando reativar, monitorar primeiros 20 envios pra ver se a edit melhorou

**Médio prazo**:
- Se taxa continuar >15% após reativação: **substituir por UTILITY** com texto tipo:
  > "Olá {{1}}, recebemos seu interesse em fazer o diagnóstico financeiro com a Bertuzzi. Para agendar, escolha um horário: {{link}}"
- Esse formato passa UTILITY (info operacional sobre serviço já contratado/solicitado)

**Longo prazo**:
- Funil ideal: lead entra em "Marcar Reunião" → envia 1 UTILITY com link de agenda → se não agenda em 48h, **SDR liga** (não outro template)

---

### 4. `lembrete_reuniao_15min` — 35,7% fail (RESOLVIDO 2026-05-12)

**Status**: ✅ **Meta recategorizou pra UTILITY** após nossa edição que tornou o texto mais transacional (adicionamos "Caso precise reagendar, responda aqui" + "com a Bertuzzi Patrimonial" no body). Status atual no Meta: APPROVED, category UTILITY.

**Implicação**: o template antigo agora **já é isento de 131049** (UTILITY não tem cap cross-business). Não precisa nem usar o v2.

**TEMPLATE_MAP** atual:
```typescript
15: ['lembrete_reuniao_15min_v2_utility', 'lembrete_reuniao_15min'],
```

Sistema usa o v2_utility primeiro. Se algum dia v2 ficar indisponível, o antigo agora **também é UTILITY** → cobertura dupla, ambos isentos do cap.

**Próxima ação**: deixar como está. failRate7d vai cair conforme janela 7d rola (envios antigos saem da janela).

---

### 5. `lembrete_reuniao_60min` — 20% fail

**Status**: substituído por `lembrete_reuniao_60min_v2_utility` (APPROVED, em uso desde commit `2cb1255`).

**TEMPLATE_MAP** atual:
```typescript
60: ['lembrete_reuniao_60min_v2_utility', 'lembrete_reuniao_60min', 'lembrete_reuniao_1h'],
```

Mesmo plano do 15min: monitorar 7 dias, remover antigos se v2 mantém 0%.

---

## Princípios gerais derivados

1. **UTILITY sempre que possível**: tudo que é "info operacional sobre serviço solicitado" passa UTILITY. Confirmações, lembretes, status. Custo: criar template novo (não dá pra mudar categoria de existente).

2. **Reduzir steps de marketing**: cadência de 7 toques é demais pra um lead frio. Considerar 3-4 toques + handoff humano após D3.

3. **Variar conteúdo entre toques**: alta repetição estilística → fadiga. Mesma estrutura ("Olá X, X estatística, agenda aqui") em D1 a D7 = quality cai.

4. **Trocar broadcast por trigger comportamental**: ao invés de "enviar pra X mil contatos", enviar apenas a quem **fez algo recente** (abriu email, clicou link, respondeu mensagem). Quality cresce com base engajada.

5. **Espaçamento mínimo de 48h entre MARKETING pro mesmo contato**: implementar como código (próxima iteração — per-user marketing throttle local).

6. **Reativação gradual após YELLOW**: quando voltar GREEN, reativar 1 cadência por vez, com 1/3 do volume usual, ramping em 7 dias.

---

## Métricas-alvo (acompanhamento via `/api/wa/templates/health`)

| Métrica | Atual | Alvo curto prazo (14d) | Alvo médio prazo (60d) |
|---------|-------|----------------------|----------------------|
| % CRITICAL templates | 5/36 (14%) | <2/36 | 0 |
| Quality rating | YELLOW | GREEN | GREEN sustentado |
| 131049 rate global | 6,3% (24h) | <3% | <1% |
| Templates UTILITY ativos | 4 | 6+ | 8+ |
