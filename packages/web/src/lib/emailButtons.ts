// Detecção e edição de botões (CTAs) dentro do HTML do corpo de um email.
//
// Por que parser de DOM e não regex: a detecção NÃO pode depender de a IA
// emitir um atributo mágico (`data-cta`) em todo botão — o modelo esquece de
// marcar uns e outros, e aí o botão some do painel de edição (bug reportado
// pela Fernanda: email com vários botões, só o último aparecia pra editar).
// Aqui tratamos como botão qualquer <a> que TENHA data-cta OU simplesmente
// tenha cara de botão (fundo preenchido + padding, ou inline-block arredondado
// com padding). Ordem dos atributos no style é irrelevante.

export interface EmailButton {
  text: string;
  href: string;
  /** Índice entre os botões detectados, em ordem de documento. Estável para o mesmo HTML. */
  index: number;
}

function isButtonLike(a: Element): boolean {
  // Selo explícito da IA — caminho feliz.
  if (a.hasAttribute("data-cta")) return true;

  const style = (a.getAttribute("style") ?? "").toLowerCase();
  if (!style) return false;

  const hasBg =
    /background(-color)?\s*:/.test(style) &&
    !/background(-color)?\s*:\s*(transparent|none|inherit|initial)/.test(style);
  const hasPadding =
    /(^|;)\s*padding\s*:/.test(style) || /padding-(top|bottom|left|right)\s*:/.test(style);
  const inlineBlock = /display\s*:\s*inline-block/.test(style);
  const rounded = /border-radius\s*:/.test(style);

  // Botão "cheio": fundo colorido + padding (cobre o template da IA e o inserido manualmente).
  if (hasBg && hasPadding) return true;
  // Botão "pílula/contornado": inline-block + cantos arredondados + padding.
  if (inlineBlock && rounded && hasPadding) return true;

  return false;
}

/** Lista todos os botões (CTAs) presentes no HTML do corpo do email. */
export function extractButtons(html: string): EmailButton[] {
  if (typeof window === "undefined" || !html) return [];

  const doc = new DOMParser().parseFromString(html, "text/html");
  const buttons: EmailButton[] = [];
  let i = 0;
  for (const a of Array.from(doc.querySelectorAll("a"))) {
    if (!isButtonLike(a)) continue;
    buttons.push({
      href: a.getAttribute("href") ?? "",
      text: (a.textContent ?? "").trim(),
      index: i++,
    });
  }
  return buttons;
}

/**
 * Troca o href do N-ésimo botão detectado (mesma ordenação de extractButtons),
 * mexendo SÓ naquele <a>. Editar por posição — e não por string de href — evita
 * que botões com link idêntico (comum, já que a IA repete o mesmo Calendly)
 * sejam alterados todos juntos.
 */
export function replaceButtonHrefAt(html: string, index: number, newHref: string): string {
  if (typeof window === "undefined" || !html) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  let i = 0;
  for (const a of Array.from(doc.querySelectorAll("a"))) {
    if (!isButtonLike(a)) continue;
    if (i === index) {
      a.setAttribute("href", newHref);
      break;
    }
    i++;
  }
  return doc.body.innerHTML;
}
