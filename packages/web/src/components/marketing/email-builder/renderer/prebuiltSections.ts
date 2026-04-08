import { EmailSection } from "@/types/email-builder";

// ---------------------------------------------------------------------------
// PrebuiltBlock type
// ---------------------------------------------------------------------------

export interface PrebuiltBlock {
  id: string;
  name: string;
  description: string;
  category: string;
  sections: EmailSection[];
}

// ---------------------------------------------------------------------------
// Helper — creates an EmailSection with sensible defaults
// ---------------------------------------------------------------------------

function sec(
  id: string,
  type: EmailSection["type"],
  data: EmailSection["data"],
  style: EmailSection["style"] = {},
): EmailSection {
  return {
    id,
    type,
    style: {
      paddingTop: 10,
      paddingBottom: 10,
      paddingLeft: 20,
      paddingRight: 20,
      ...style,
    },
    data,
  };
}

// ---------------------------------------------------------------------------
// Pre-built blocks
// ---------------------------------------------------------------------------

export const PREBUILT_BLOCKS: PrebuiltBlock[] = [
  // 1 — Header com Logo
  {
    id: "prebuilt-header-logo",
    name: "Header com Logo",
    description: "Cabeçalho com logo e nome da empresa",
    category: "Cabeçalho",
    sections: [
      sec("pb-header-1", "header", {
        type: "header",
        logoUrl: "https://placehold.co/200x50/2563eb/ffffff?text=LOGO",
        logoWidth: 150,
        companyName: "Sua Empresa",
        alignment: "center",
        html: "<h1 style=\"margin:0;font-size:24px;\">Sua Empresa</h1>",
      }),
    ],
  },

  // 2 — Hero Completo
  {
    id: "prebuilt-hero",
    name: "Hero Completo",
    description: "Imagem de destaque + texto + botão de ação",
    category: "Hero",
    sections: [
      sec("pb-hero-img", "image", {
        type: "image",
        src: "https://placehold.co/600x300/e2e8f0/64748b?text=Imagem+Destaque",
        alt: "Imagem de destaque",
        width: "full",
        alignment: "center",
      }, { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 }),
      sec("pb-hero-text", "text", {
        type: "text",
        html: "<h2 style=\"margin:0 0 8px 0;font-size:22px;color:#1e293b;\">Bem-vindo ao nosso mundo</h2><p style=\"margin:0;color:#64748b;font-size:16px;\">Descubra como podemos ajudar você a alcançar seus objetivos. Nossa plataforma foi criada pensando em você.</p>",
      }, { paddingTop: 20, paddingBottom: 10 }),
      sec("pb-hero-btn", "button", {
        type: "button",
        text: "Agendar Reunião",
        url: "https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp",
        alignment: "center",
        buttonColor: "#2563eb",
        textColor: "#ffffff",
        borderRadius: 6,
        size: "lg",
      }, { paddingTop: 5, paddingBottom: 20 }),
    ],
  },

  // 3 — Conteúdo 2 Colunas
  {
    id: "prebuilt-2col",
    name: "Conteúdo 2 Colunas",
    description: "Layout de duas colunas com texto lado a lado",
    category: "Conteúdo",
    sections: [
      sec("pb-2col", "columns", {
        type: "columns",
        layout: "50-50",
        gap: 16,
        columns: [
          {
            html: "<h3 style=\"margin:0 0 8px 0;font-size:18px;color:#1e293b;\">Coluna Esquerda</h3><p style=\"margin:0;color:#64748b;font-size:14px;\">Adicione seu conteúdo aqui. Use textos, imagens e links para engajar seus leitores.</p>",
          },
          {
            html: "<h3 style=\"margin:0 0 8px 0;font-size:18px;color:#1e293b;\">Coluna Direita</h3><p style=\"margin:0;color:#64748b;font-size:14px;\">Organize informações de forma visual e clara. Duas colunas ajudam a manter o email dinâmico.</p>",
          },
        ],
      }, { paddingTop: 20, paddingBottom: 20 }),
    ],
  },

  // 4 — CTA Destaque
  {
    id: "prebuilt-cta",
    name: "CTA Destaque",
    description: "Chamada para ação com fundo colorido e botão",
    category: "CTA",
    sections: [
      sec("pb-cta-spacer1", "spacer", {
        type: "spacer",
        height: 20,
      }, { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 }),
      sec("pb-cta-text", "text", {
        type: "text",
        html: "<h2 style=\"margin:0 0 8px 0;font-size:22px;color:#ffffff;text-align:center;\">Oferta Especial!</h2><p style=\"margin:0;color:#e2e8f0;font-size:16px;text-align:center;\">Aproveite esta oportunidade única. Desconto exclusivo por tempo limitado.</p>",
      }, { backgroundColor: "#7c3aed", paddingTop: 30, paddingBottom: 10, paddingLeft: 30, paddingRight: 30 }),
      sec("pb-cta-btn", "button", {
        type: "button",
        text: "Agendar Reunião",
        url: "https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp",
        alignment: "center",
        buttonColor: "#22c55e",
        textColor: "#ffffff",
        borderRadius: 8,
        size: "lg",
      }, { backgroundColor: "#7c3aed", paddingTop: 10, paddingBottom: 30, paddingLeft: 30, paddingRight: 30 }),
      sec("pb-cta-spacer2", "spacer", {
        type: "spacer",
        height: 20,
      }, { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 }),
    ],
  },

  // 5 — Newsletter
  {
    id: "prebuilt-newsletter",
    name: "Newsletter",
    description: "Template completo de newsletter com header, conteúdo e rodapé",
    category: "Template",
    sections: [
      sec("pb-nl-header", "header", {
        type: "header",
        logoUrl: "https://placehold.co/180x45/1e293b/ffffff?text=NEWS",
        logoWidth: 140,
        companyName: "Newsletter",
        alignment: "center",
        html: "<h1 style=\"margin:0;font-size:22px;\">Newsletter</h1>",
      }, { backgroundColor: "#1e293b", paddingTop: 20, paddingBottom: 20 }),
      sec("pb-nl-intro", "text", {
        type: "text",
        html: "<h2 style=\"margin:0 0 12px 0;font-size:20px;color:#1e293b;\">Novidades da Semana</h2><p style=\"margin:0;color:#64748b;font-size:15px;\">Confira as principais atualizações e novidades que preparamos especialmente para você.</p>",
      }, { paddingTop: 24, paddingBottom: 16 }),
      sec("pb-nl-div1", "divider", {
        type: "divider",
        color: "#e2e8f0",
        thickness: 1,
        style: "solid",
        width: 100,
      }, { paddingTop: 0, paddingBottom: 0 }),
      sec("pb-nl-cols", "columns", {
        type: "columns",
        layout: "50-50",
        gap: 16,
        columns: [
          {
            html: "<h3 style=\"margin:0 0 8px 0;font-size:16px;color:#1e293b;\">Destaque 1</h3><p style=\"margin:0;color:#64748b;font-size:14px;\">Resumo do primeiro destaque da semana com as informações mais relevantes.</p>",
          },
          {
            html: "<h3 style=\"margin:0 0 8px 0;font-size:16px;color:#1e293b;\">Destaque 2</h3><p style=\"margin:0;color:#64748b;font-size:14px;\">Resumo do segundo destaque com novidades e atualizações importantes.</p>",
          },
        ],
      }, { paddingTop: 16, paddingBottom: 16 }),
      sec("pb-nl-div2", "divider", {
        type: "divider",
        color: "#e2e8f0",
        thickness: 1,
        style: "solid",
        width: 100,
      }, { paddingTop: 0, paddingBottom: 0 }),
      sec("pb-nl-footer", "footer", {
        type: "footer",
        alignment: "center",
        html: "<p style=\"margin:0;font-size:12px;color:#94a3b8;\">Você recebeu este email porque se inscreveu na nossa newsletter.<br/><a href=\"#\" style=\"color:#2563eb;\">Cancelar inscrição</a></p>",
      }, { paddingTop: 16, paddingBottom: 16 }),
    ],
  },

  // 6 — Rodapé Padrão
  {
    id: "prebuilt-footer",
    name: "Rodapé Padrão",
    description: "Divisor + redes sociais + texto de descadastro",
    category: "Rodapé",
    sections: [
      sec("pb-ft-div", "divider", {
        type: "divider",
        color: "#e2e8f0",
        thickness: 1,
        style: "solid",
        width: 80,
      }, { paddingTop: 10, paddingBottom: 10 }),
      sec("pb-ft-social", "social", {
        type: "social",
        alignment: "center",
        iconSize: 24,
        links: [
          { platform: "Instagram", url: "https://instagram.com/" },
          { platform: "LinkedIn", url: "https://linkedin.com/" },
          { platform: "WhatsApp", url: "https://wa.me/" },
        ],
      }, { paddingTop: 10, paddingBottom: 10 }),
      sec("pb-ft-footer", "footer", {
        type: "footer",
        alignment: "center",
        html: "<p style=\"margin:0;font-size:12px;color:#94a3b8;\">Sua Empresa Ltda. — Todos os direitos reservados.<br/>Você recebeu este email porque se cadastrou em nossa plataforma.<br/><a href=\"#\" style=\"color:#2563eb;\">Cancelar inscrição</a></p>",
      }, { paddingTop: 8, paddingBottom: 16 }),
    ],
  },

  // 7 — Barra Social
  {
    id: "prebuilt-social-bar",
    name: "Barra Social",
    description: "Barra com ícones de todas as principais redes sociais",
    category: "Social",
    sections: [
      sec("pb-social", "social", {
        type: "social",
        alignment: "center",
        iconSize: 28,
        links: [
          { platform: "Facebook", url: "https://facebook.com/" },
          { platform: "Instagram", url: "https://instagram.com/" },
          { platform: "LinkedIn", url: "https://linkedin.com/" },
          { platform: "Twitter/X", url: "https://x.com/" },
          { platform: "YouTube", url: "https://youtube.com/" },
          { platform: "WhatsApp", url: "https://wa.me/" },
          { platform: "TikTok", url: "https://tiktok.com/" },
        ],
      }, { paddingTop: 16, paddingBottom: 16 }),
    ],
  },

  // 8 — Imagem + Texto
  {
    id: "prebuilt-img-text",
    name: "Imagem + Texto",
    description: "Imagem seguida de bloco de texto descritivo",
    category: "Conteúdo",
    sections: [
      sec("pb-it-img", "image", {
        type: "image",
        src: "https://placehold.co/600x250/f1f5f9/475569?text=Imagem",
        alt: "Imagem ilustrativa",
        width: "full",
        alignment: "center",
      }, { paddingTop: 10, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 }),
      sec("pb-it-text", "text", {
        type: "text",
        html: "<h3 style=\"margin:0 0 8px 0;font-size:18px;color:#1e293b;\">Título da Seção</h3><p style=\"margin:0;color:#64748b;font-size:15px;\">Adicione uma descrição detalhada sobre o conteúdo da imagem acima. Use este espaço para contar sua história e engajar seus leitores.</p>",
      }, { paddingTop: 16, paddingBottom: 20 }),
    ],
  },
];
