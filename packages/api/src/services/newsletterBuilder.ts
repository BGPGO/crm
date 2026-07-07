/**
 * Montagem automática da edição semanal BGP Insights:
 *   1. Posts do blog: ContIA (PostgREST, seo_articles status=publicado)
 *   2. Notícias: feeds RSS de veículos conhecidos → curadoria via OpenAI
 *   3. Imagem da notícia: enclosure do RSS → og:image da página → card BGP
 *   4. Render do HTML (mobile-first, <a data-slot> em todo botão)
 */
import OpenAI from 'openai';
import prisma from '../lib/prisma';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const LOGO_URL = 'https://messenger.bertuzzipatrimonial.com.br/brand/bgp-logo.png';
const SYMBOL_URL = 'https://messenger.bertuzzipatrimonial.com.br/brand/bgp-symbol.png';
const BLOG_URL = 'https://www.bertuzzipatrimonial.com.br/blog';
const SITE_URL = 'https://www.bertuzzipatrimonial.com.br';
const INSTAGRAM_URL = 'https://www.instagram.com/bertuzzipatrimonial';

const RSS_FEEDS: { source: string; url: string }[] = [
  { source: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/' },
  { source: 'Treasy', url: 'https://www.treasy.com.br/feed/' },
  { source: 'Exame', url: 'https://exame.com/feed/' },
  { source: 'NeoFeed', url: 'https://neofeed.com.br/feed/' },
  { source: 'Brazil Journal', url: 'https://braziljournal.com/feed/' },
  { source: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/' },
  { source: 'E-Investidor', url: 'https://einvestidor.estadao.com.br/feed/' },
];

export interface FeedItem {
  source: string;
  title: string;
  link: string;
  pubDate: Date | null;
  image: string | null;
}

export interface CuratedNews {
  kicker: string; // ex.: "Gestão · Treasy"
  title: string;
  summary: string;
  url: string;
  image: string | null;
}

export interface BlogPost {
  titulo: string;
  meta_description: string | null;
  featured_image_url: string | null;
  wix_post_url: string;
  reading_time_min: number | null;
}

// ─── Posts do blog (ContIA via PostgREST) ────────────────────────────────────

export async function fetchBlogPosts(): Promise<BlogPost[]> {
  const base = process.env.CONTIA_SUPABASE_URL;
  const key = process.env.CONTIA_SUPABASE_SERVICE_KEY;
  if (!base || !key) {
    throw new Error('CONTIA_SUPABASE_URL / CONTIA_SUPABASE_SERVICE_KEY não configuradas');
  }
  const url =
    `${base}/rest/v1/seo_articles` +
    `?status=eq.publicado&wix_post_url=not.is.null` +
    `&select=titulo,meta_description,featured_image_url,wix_post_url,published_at,reading_time_min` +
    `&order=published_at.desc&limit=6`;
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`ContIA PostgREST ${res.status}`);
  const rows = (await res.json()) as BlogPost[];
  // Preferir posts com capa própria; completar com os demais
  const comCapa = rows.filter((r) => r.featured_image_url?.includes('supabase'));
  const resto = rows.filter((r) => !comCapa.includes(r));
  return [...comCapa, ...resto].slice(0, 3);
}

// ─── Feeds RSS ───────────────────────────────────────────────────────────────

function xmlTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFeedItems(): Promise<FeedItem[]> {
  const since = Date.now() - 7 * 24 * 3600 * 1000;
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async ({ source, url }) => {
      const res = await fetchWithTimeout(url, 12000);
      if (!res.ok) throw new Error(`${source} ${res.status}`);
      const xml = await res.text();
      const items: FeedItem[] = [];
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const block = m[1];
        const title = decodeEntities(xmlTag(block, 'title'));
        const link = xmlTag(block, 'link');
        if (!title || !link) continue;
        const pubRaw = xmlTag(block, 'pubDate');
        const pubDate = pubRaw ? new Date(pubRaw) : null;
        if (pubDate && !isNaN(pubDate.getTime()) && pubDate.getTime() < since) continue;
        const enc =
          block.match(/<enclosure[^>]*url="(https?:[^"]+\.(?:jpe?g|png|webp)[^"]*)"/i)?.[1] ||
          xmlTag(block, 'mediaurl') ||
          block.match(/<media:content[^>]*url="(https?:[^"]+)"/i)?.[1] ||
          null;
        items.push({ source, title, link, pubDate, image: enc });
        if (items.length >= 12) break;
      }
      return items;
    })
  );
  const all: FeedItem[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
    else console.warn('[newsletter] feed falhou:', r.reason?.message || r.reason);
  }
  return all;
}

// ─── Curadoria por IA ────────────────────────────────────────────────────────

export async function curateNews(items: FeedItem[]): Promise<CuratedNews[]> {
  if (items.length === 0) return [];
  const list = items
    .map((it, i) => `${i}. [${it.source}] ${it.title}`)
    .join('\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Você é o editor da newsletter semanal da BGP (Bertuzzi Gestão Patrimonial), lida por donos e ' +
          'gestores de médias empresas brasileiras, clientes de gestão financeira, controladoria e BI. ' +
          'Escolha as 3 notícias mais relevantes e DIVERSAS entre si (temas diferentes) da lista. ' +
          'Priorize: gestão financeira, crédito/juros, economia real, gestão empresarial, IA aplicada a negócios. ' +
          'Evite: política partidária, esportes, celebridades, cultura pop. ' +
          'Responda JSON: {"picks":[{"index":<número da lista>,"kicker":"<Tema · Fonte>","title":"<título reescrito conciso, máx 90 chars>","summary":"<1 frase, por que importa pro leitor, máx 140 chars>"}]}',
      },
      { role: 'user', content: list },
    ],
    temperature: 0.4,
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}') as {
    picks?: { index: number; kicker: string; title: string; summary: string }[];
  };
  const picks = (parsed.picks || []).slice(0, 3);
  const out: CuratedNews[] = [];
  for (const p of picks) {
    const item = items[p.index];
    if (!item) continue;
    out.push({
      kicker: p.kicker || item.source,
      title: p.title || item.title,
      summary: p.summary || '',
      url: item.link,
      image: item.image,
    });
  }
  return out;
}

// ─── Imagem da notícia (og:image quando o RSS não trouxe) ────────────────────

export async function resolveNewsImage(news: CuratedNews): Promise<string | null> {
  if (news.image) return news.image;
  try {
    const res = await fetchWithTimeout(news.url, 8000);
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 300000);
    const og =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1] ||
      html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
    return og || null;
  } catch {
    return null;
  }
}

// ─── Render do HTML ──────────────────────────────────────────────────────────

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function newsThumb(news: CuratedNews, slot: string): string {
  if (news.image) {
    return `<a href="${esc(news.url)}" style="text-decoration:none;" data-slot="${slot}">
              <img src="${esc(news.image)}" alt="" width="150" height="100"
                   style="display:block; width:150px; height:100px; object-fit:cover; border-radius:8px; border:0; background-color:#eef2f3;">
            </a>`;
  }
  return `<a href="${esc(news.url)}" style="text-decoration:none;" data-slot="${slot}">
            <div style="width:150px; height:100px; border-radius:8px; background-color:#244C5A; text-align:center; line-height:100px; font-size:0;">
              <img src="${SYMBOL_URL}" alt="" height="34" style="vertical-align:middle; height:34px; width:auto; opacity:0.9;">
            </div>
          </a>`;
}

function newsItem(news: CuratedNews, idx: number, last: boolean): string {
  const slot = `noticia-${idx + 1}`;
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"${last ? '' : ' style="border-bottom:1px solid #eef2f3;"'}>
        <tr>
          <td valign="top" class="stack news-text" style="padding:${last ? '20px 18px 26px 0' : '20px 18px 20px 0'};">
            <div style="font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#ABC7C9; font-weight:700; margin-bottom:6px;">${esc(news.kicker)}</div>
            <a href="${esc(news.url)}" data-slot="${slot}"
               style="font-size:16.5px; line-height:1.4; color:#244C5A; font-weight:700; text-decoration:none;">
              ${esc(news.title)}
            </a>
            <div style="font-size:13.5px; line-height:1.55; color:#5a7079; margin-top:6px;">
              ${esc(news.summary)}
            </div>
          </td>
          <td width="150" valign="top" class="stack news-thumb" style="padding:${last ? '20px 0 26px' : '20px 0'};">
            ${newsThumb(news, slot)}
          </td>
        </tr>
      </table>`;
}

function postCard(post: BlogPost, slot: string): string {
  const img = post.featured_image_url || '';
  return `
            <a href="${esc(post.wix_post_url)}" style="text-decoration:none;" data-slot="${slot}">
              <img src="${esc(img)}" alt="${esc(post.titulo)}" width="265"
                   style="display:block; width:100%; border-radius:8px; border:0; background-color:#eef2f3;">
            </a>
            <div style="font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#8aa0a8; margin:12px 0 6px;">${post.reading_time_min || 5} min</div>
            <a href="${esc(post.wix_post_url)}" data-slot="${slot}"
               style="font-size:16px; line-height:1.35; color:#244C5A; font-weight:700; text-decoration:none;">
              ${esc(post.titulo)}
            </a>
            <div style="font-size:13.5px; line-height:1.55; color:#5a7079; margin-top:6px;">
              ${esc(post.meta_description || '')}
            </div>`;
}

export function renderNewsletterHtml(news: CuratedNews[], posts: BlogPost[], dateLabel: string): string {
  const [destaque, post2, post3] = posts;
  const preheader = news.map((n) => n.title).slice(0, 2).join(', ');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BGP Insights — ${esc(dateLabel)}</title>
<style>
  @media only screen and (max-width: 520px) {
    .px { padding-left: 22px !important; padding-right: 22px !important; }
    .stack { display: block !important; width: 100% !important; }
    .news-text { padding-right: 0 !important; padding-bottom: 6px !important; }
    .news-thumb { padding-top: 0 !important; padding-bottom: 22px !important; }
    .news-thumb img, .news-thumb div { width: 100% !important; height: 170px !important; line-height: 170px !important; }
    .col-l { padding-right: 0 !important; }
    .col-r { padding-left: 0 !important; padding-top: 26px !important; }
    .cta-txt { display: block !important; width: 100% !important; }
    .cta-btn { display: block !important; width: 100% !important; text-align: left !important; padding-top: 16px !important; }
    .hero-title { font-size: 23px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#eef2f3; font-family:'Segoe UI', Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased;">

<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
  ${esc(preheader)} — sua semana em 5 minutos.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2f3;">
<tr><td align="center" style="padding:32px 16px;">

  <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px; width:100%;">

    <!-- HEADER -->
    <tr><td class="px" style="background-color:#ffffff; border-radius:12px 12px 0 0; padding:28px 40px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="left" valign="middle">
            <img src="${LOGO_URL}" alt="BGP" height="34" style="display:block; height:34px; width:auto;">
          </td>
          <td align="right" valign="middle" style="font-size:12px; color:#8aa0a8; letter-spacing:1.5px; text-transform:uppercase;">
            Edição semanal · ${esc(dateLabel)}
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- HERO -->
    <tr><td class="px" style="background-color:#244C5A; padding:36px 40px;">
      <div style="font-size:12px; letter-spacing:3px; text-transform:uppercase; color:#ABC7C9; margin-bottom:10px;">BGP Insights</div>
      <div class="hero-title" style="font-size:28px; line-height:1.25; color:#ffffff; font-weight:700;">
        Sua semana em gestão<br>financeira, em 5 minutos.
      </div>
      <div style="font-size:15px; line-height:1.6; color:#c9dadd; margin-top:14px;">
        Três movimentos do mercado e três conteúdos do BGP Academy que valem sua atenção — direto ao ponto, sem achismo.
      </div>
    </td></tr>

    <!-- RADAR DO SETOR -->
    <tr><td class="px" style="background-color:#ffffff; padding:36px 40px 12px;">
      <div style="font-size:13px; letter-spacing:2.5px; text-transform:uppercase; color:#244C5A; font-weight:700;">
        ▪&nbsp; Radar do setor
      </div>
      <div style="height:1px; background-color:#dfe8ea; margin:12px 0 4px;"></div>
${news.map((n, i) => newsItem(n, i, i === news.length - 1)).join('\n')}
    </td></tr>

    <!-- BGP ACADEMY -->
    <tr><td class="px" style="background-color:#ffffff; padding:36px 40px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px; letter-spacing:2.5px; text-transform:uppercase; color:#244C5A; font-weight:700; padding-bottom:4px;">
            ▪&nbsp; BGP Academy
          </td>
          <td align="right" style="font-size:13px;">
            <a href="${BLOG_URL}" data-slot="academy-ver-todos" style="color:#4d7d8f; text-decoration:none;">ver todos →</a>
          </td>
        </tr>
      </table>
      <div style="height:1px; background-color:#dfe8ea; margin:12px 0 24px;"></div>

      <a href="${esc(destaque.wix_post_url)}" style="text-decoration:none;" data-slot="academy-destaque">
        <img src="${esc(destaque.featured_image_url || '')}" alt="${esc(destaque.titulo)}" width="560"
             style="display:block; width:100%; border-radius:10px; border:0; background-color:#eef2f3;">
      </a>
      <div style="padding:18px 2px 26px;">
        <div style="font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#8aa0a8; margin-bottom:8px;">Destaque da semana · ${destaque.reading_time_min || 5} min de leitura</div>
        <a href="${esc(destaque.wix_post_url)}" data-slot="academy-destaque"
           style="font-size:21px; line-height:1.3; color:#244C5A; font-weight:700; text-decoration:none;">
          ${esc(destaque.titulo)}
        </a>
        <div style="font-size:14.5px; line-height:1.6; color:#5a7079; margin-top:10px;">
          ${esc(destaque.meta_description || '')}
        </div>
        <a href="${esc(destaque.wix_post_url)}" data-slot="academy-destaque"
           style="display:inline-block; margin-top:14px; font-size:14px; font-weight:600; color:#244C5A; text-decoration:none; border-bottom:2px solid #ABC7C9; padding-bottom:2px;">
          Ler artigo completo →
        </a>
      </div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="48%" valign="top" class="stack col-l" style="padding-right:10px;">
${postCard(post2, 'academy-post-2')}
          </td>
          <td width="48%" valign="top" class="stack col-r" style="padding-left:10px;">
${postCard(post3, 'academy-post-3')}
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- CTA -->
    <tr><td class="px" style="background-color:#ffffff; padding:8px 40px 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ABC7C9; border-radius:10px;">
        <tr><td style="padding:28px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td valign="middle" class="cta-txt"><div style="font-size:18px; font-weight:700; color:#1d3d48;">Quer clareza sobre os números da sua empresa?</div>
                <div style="font-size:13.5px; color:#3d5a64; margin-top:4px;">Converse com um especialista da BGP — sem compromisso.</div>
              </td>
              <td align="right" valign="middle" width="160" class="cta-btn">
                <a href="${SITE_URL}" data-slot="cta-falar"
                   style="display:inline-block; background-color:#244C5A; color:#ffffff; font-size:14px; font-weight:600; text-decoration:none; padding:12px 24px; border-radius:6px;">
                  Falar com a BGP
                </a>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>

    <!-- FOOTER -->
    <tr><td class="px" style="background-color:#244C5A; border-radius:0 0 12px 12px; padding:28px 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td valign="middle">
            <img src="${SYMBOL_URL}" alt="BGP" height="22" style="display:block; height:22px; width:auto; opacity:0.9;">
          </td>
          <td align="right" style="font-size:12px; color:#8fb0b8;">
            <a href="${BLOG_URL}" data-slot="footer-blog" style="color:#ABC7C9; text-decoration:none;">Blog</a>
            &nbsp;·&nbsp;
            <a href="${INSTAGRAM_URL}" data-slot="footer-instagram" style="color:#ABC7C9; text-decoration:none;">Instagram</a>
            &nbsp;·&nbsp;
            <a href="#" data-slot="footer-descadastrar" style="color:#8fb0b8; text-decoration:none;">Descadastrar</a>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:16px; font-size:11px; line-height:1.6; color:#6f95a0;">
            Você recebe este email porque é cliente ou se cadastrou em um dos nossos conteúdos.<br>
            BGP · Bertuzzi Gestão Patrimonial — Porto Alegre/RS
          </td>
        </tr>
      </table>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}

// ─── Orquestração ────────────────────────────────────────────────────────────

export async function buildEdition(opts?: { isTest?: boolean }): Promise<{ id: string; subject: string }> {
  const [posts, feedItems] = await Promise.all([fetchBlogPosts(), fetchFeedItems()]);
  if (posts.length < 3) throw new Error(`ContIA retornou só ${posts.length} posts publicados`);

  const curated = await curateNews(feedItems);
  if (curated.length < 3) throw new Error(`Curadoria retornou só ${curated.length} notícias`);

  const withImages = await Promise.all(
    curated.map(async (n) => ({ ...n, image: await resolveNewsImage(n) }))
  );

  const now = new Date();
  const dateLabel = now.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).replace(/\./g, '');
  const ddmm = now.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  const html = renderNewsletterHtml(withImages, posts, dateLabel);
  const subject = `BGP Insights — Sua semana em gestão financeira · ${ddmm}`;

  // extractLinks importado dinamicamente evitaria ciclo, mas não há ciclo aqui:
  const { extractLinks } = await import('./newsletterService');
  const links = extractLinks(html);

  const edition = await prisma.newsletterEdition.create({
    data: { subject, html, links: links as object, isTest: Boolean(opts?.isTest) },
  });
  return { id: edition.id, subject };
}
