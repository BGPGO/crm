// Abrir o WhatsApp (app desktop, com fallback pro navegador) num número.
//
// Usado pelos botões de "ligar pelo WhatsApp": abre o chat do lead no app —
// a ligação em si é feita pelo botão de chamada dentro do próprio WhatsApp
// (não existe deep link público que já inicie a chamada).

/** Normaliza pra formato internacional BR: dígitos + prefixo 55 quando faltar. */
export function waPhoneDigits(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  return digits.length <= 11 ? `55${digits}` : digits;
}

/**
 * Tenta abrir o app do WhatsApp direto no número; se o protocolo não tiver
 * handler (app não instalado), cai pro wa.me em nova aba após um instante.
 */
export function openWhatsAppChat(rawPhone: string): void {
  const phone = waPhoneDigits(rawPhone);
  window.location.href = `whatsapp://send?phone=${phone}`;
  setTimeout(() => {
    // Se o app abriu, o navegador perdeu o foco — não abre o fallback.
    if (document.hasFocus()) {
      window.open(`https://wa.me/${phone}`, "_blank", "noopener,noreferrer");
    }
  }, 1800);
}
