# Guia de Sweep — Rebrand AiMO → Bertuzzi/BGP

Documento de referência para os squads de execução (Wave 2). O Squad ALPHA já
estabeleceu a fundação visual: tokens de cor, fonte Almarena, assets de logo e o
"chrome" da aplicação (layout, navbar, login). Este guia descreve a substituição
mecânica que os demais squads devem aplicar nos arquivos restantes.

> **Escopo já feito pelo ALPHA (NÃO tocar):**
> `src/app/layout.tsx`, `src/components/layout/**`, `src/app/login/**`, e o bloco
> `@theme` + overrides dark em `src/app/globals.css`.

---

## 1. Marca-alvo

| Token | Hex | Origem |
|-------|-----|--------|
| **Petrol** (primária / ação) | `#244C5A` → `petrol-700` | Pantone 7477C |
| **Water** (secundária / realce) | `#ABC7C9` → `water-300` | Pantone 5513C |
| Fonte | **Almarena** | já configurada como `font-sans` global |

Escalas completas geradas no `@theme` de `globals.css`:

### Petrol (acento principal — substitui blue/indigo)
| Tom | Hex |
|-----|-----|
| petrol-50  | `#f1f6f7` |
| petrol-100 | `#dceaec` |
| petrol-200 | `#bcd5d9` |
| petrol-300 | `#8fb7bd` |
| petrol-400 | `#5d8f99` |
| petrol-500 | `#3d717c` |
| petrol-600 | `#305c67` |
| petrol-700 | `#244c5a` ← cor da marca |
| petrol-800 | `#1d3c47` |
| petrol-900 | `#18313a` |
| petrol-950 | `#0e1f25` |

### Water (realce suave / fundos sutis)
| Tom | Hex |
|-----|-----|
| water-50  | `#f4f8f8` |
| water-100 | `#e6efef` |
| water-200 | `#cfe0e1` |
| water-300 | `#abc7c9` ← cor da marca |
| water-400 | `#84a8ab` |
| water-500 | `#648c90` |
| water-600 | `#517176` |
| water-700 | `#445c61` |
| water-800 | `#3a4d51` |
| water-900 | `#334246` |
| water-950 | `#1e292c` |

As utilities (`bg-petrol-600`, `text-petrol-700`, `ring-petrol-500`, `bg-water-100`, etc.)
já existem automaticamente — é só usá-las.

---

## 2. Regra de substituição (o sweep)

**Regra única:** qualquer ocorrência de `blue-<n>` ou `indigo-<n>` vira
`petrol-<n>` — **mesma tonalidade numérica**, **preservando o prefixo de utility
e qualquer variante** (`hover:`, `focus:`, `active:`, `group-hover:`, `dark:`, etc.).

### Tabela de tonalidade (1:1)
| De | Para |
|----|------|
| `blue-50`  / `indigo-50`  | `petrol-50` |
| `blue-100` / `indigo-100` | `petrol-100` |
| `blue-200` / `indigo-200` | `petrol-200` |
| `blue-300` / `indigo-300` | `petrol-300` |
| `blue-400` / `indigo-400` | `petrol-400` |
| `blue-500` / `indigo-500` | `petrol-500` |
| `blue-600` / `indigo-600` | `petrol-600` |
| `blue-700` / `indigo-700` | `petrol-700` |
| `blue-800` / `indigo-800` | `petrol-800` |
| `blue-900` / `indigo-900` | `petrol-900` |
| `blue-950` / `indigo-950` | `petrol-950` |

### Prefixos de utility cobertos (todos)
`bg-`, `text-`, `border-`, `border-l-`/`-r-`/`-t-`/`-b-`, `ring-`, `ring-offset-`,
`from-`, `to-`, `via-` (gradientes), `divide-`, `fill-`, `stroke-`, `placeholder-`,
`decoration-`, `outline-`, `caret-`, `accent-`, `shadow-` (colored shadows).

### Variantes cobertas (todas)
`hover:`, `focus:`, `focus-visible:`, `active:`, `disabled:`, `group-hover:`,
`group-focus:`, `peer-*:`, `dark:`, `md:`/`lg:`/`sm:` e quaisquer combinações
(ex.: `dark:hover:bg-blue-600` → `dark:hover:bg-petrol-600`).

### Exemplos
| Antes | Depois |
|-------|--------|
| `bg-blue-50 text-blue-700` | `bg-petrol-50 text-petrol-700` |
| `hover:bg-indigo-600` | `hover:bg-petrol-600` |
| `focus:ring-2 focus:ring-blue-500` | `focus:ring-2 focus:ring-petrol-500` |
| `border-l-4 border-blue-600` | `border-l-4 border-petrol-600` |
| `bg-gradient-to-r from-blue-500 to-indigo-600` | `bg-gradient-to-r from-petrol-500 to-petrol-600` |
| `dark:text-blue-400` | `dark:text-petrol-400` |
| `fill-blue-500 stroke-indigo-700` | `fill-petrol-500 stroke-petrol-700` |

> Sugestão de regex (revisar manualmente cada match): encontrar
> `(blue|indigo)-(50|100|200|300|400|500|600|700|800|900|950)` e trocar o grupo 1
> por `petrol`, mantendo o grupo 2.

---

## 3. EXCEÇÕES — cores que NÃO mudam

**NÃO alterar** nenhuma destas escalas semânticas. Elas comunicam estado/significado,
não a marca:

`green-` · `emerald-` · `red-` · `rose-` · `yellow-` · `amber-` · `orange-` ·
`purple-` · `violet-` · `cyan-` · `teal-` · `pink-` · `gray-` · `slate-` ·
`zinc-` · `neutral-` · `stone-`

Só **`blue-`** e **`indigo-`** mudam. Tudo o mais permanece intacto.

Exemplos do que **manter**:
- `bg-emerald-500` (sucesso/WhatsApp) → fica
- `text-red-600` (erro/perda) → fica
- `bg-amber-50` (aviso) → fica
- `text-gray-700` (texto neutro) → fica
- `bg-cyan-50` (badge informativo) → fica

---

## 4. Cores hardcoded em hex (inline style / strings)

Alguns componentes usam o hex do azul Tailwind diretamente em `style={{...}}`,
SVGs ou strings. Quando o hex representar o **accent de marca** (azul), troque
pelo petrol equivalente:

| Hex blue antigo (Tailwind) | Equivalente | Petrol |
|----------------------------|-------------|--------|
| `#3b82f6` | blue-500 | `#3d717c` (petrol-500) |
| `#2563eb` | blue-600 | `#305c67` (petrol-600) |
| `#1d4ed8` | blue-700 | `#244c5a` (petrol-700) |
| `#1e40af` | blue-800 | `#1d3c47` (petrol-800) |
| `#60a5fa` | blue-400 | `#5d8f99` (petrol-400) |
| `#eff6ff` | blue-50  | `#f1f6f7` (petrol-50) |
| `#1E3FFF` | accent AiMO legado | `#244C5A` (petrol-700) |

> Atenção: só troque hex que seja claramente accent de marca. Hex de cores
> semânticas (verde de sucesso, vermelho de erro, etc.) ficam como estão.
> Hex em dados de domínio (ex.: cores de etapa do funil salvas no banco, paletas
> de email definidas pelo usuário) **não** devem ser tocados.

---

## 5. Logo, ícone e textos de marca

### Assets disponíveis em `public/`
| Arquivo | Uso |
|---------|-----|
| `bertuzzi-logo.png` | Lockup horizontal **petróleo** — para fundo claro |
| `bertuzzi-logo-white.png` | Lockup horizontal **branco** — para fundo escuro/petróleo |
| `bertuzzi-icon.png` | Símbolo isolado — favicon, estados compactos, avatar fallback |
| `aimo-logo.png` | **LEGADO** — não deletar ainda (migração validada por marketing) |

Regra de fundo: fundo claro → `bertuzzi-logo.png`; fundo escuro/petróleo →
`bertuzzi-logo-white.png`.

### Substituições de logo/texto
| De | Para |
|----|------|
| `/aimo-logo.png` | `/bertuzzi-logo.png` (ou `/bertuzzi-logo-white.png` se fundo escuro) |
| `alt="AiMO"` / `alt="AIMO"` | `alt="Bertuzzi"` |
| `aimocorp.com.br` | `bertuzzipatrimonial.com.br` |
| `"AiMO"` / `"AIMO"` (texto de marca) | `"Bertuzzi"` |
| `BGPGO CRM` / `CRM BGPGO` (wordmark) | logo Bertuzzi + `CRM`, ou `Bertuzzi CRM` |

> O componente `BrandSwitcher` (alterna BGP/AIMO) é mantido por outro squad.
> No `Header`/navbar há um estilo condicional `brand === "AIMO"` que ainda usa o
> hex `#1E3FFF` (stripe legado AiMO). O ALPHA deixou esse condicional intacto
> de propósito — ele só renderiza no modo AIMO (marca sendo descontinuada) e não
> é um accent Bertuzzi. Coordene com o squad do BrandSwitcher antes de remover.

---

## 6. Fonte

`font-sans` já aponta para **Almarena** globalmente (via `next/font/local` no
layout). Não há ação necessária — use `font-sans`, `font-light` (300),
`font-normal` (400) e `font-bold` (700) normalmente. Evite importar `Inter` ou
outras fontes do `next/font/google` em telas novas.

---

## 7. Checklist por arquivo (Wave 2)

Para cada arquivo do seu escopo:
1. Trocar todo `blue-<n>` / `indigo-<n>` por `petrol-<n>` (preservar prefixo e variante).
2. NÃO tocar nas escalas semânticas (seção 3).
3. Trocar hex de accent azul por petrol (seção 4) — só accent de marca.
4. Trocar logo/alt/textos de marca (seção 5).
5. Conferir que `font-sans` é usado (sem reintroduzir Inter).
6. Rodar `npx tsc --noEmit` no `packages/web` ao final.

Há **~865 ocorrências de `blue-`/`indigo-` em ~113 arquivos** fora do escopo do
ALPHA. Distribuídas principalmente em `marketing/`, `waba/`, `conversas/`,
`pipeline/`, `deal/`, `settings/`, `automations/`, `ui/` e páginas de domínio.
