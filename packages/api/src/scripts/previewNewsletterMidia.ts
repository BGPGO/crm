/**
 * Prévia local da seção "BGP na mídia" da newsletter: faz a busca real
 * (Valor + O Globo), mostra o acervo e renderiza um HTML de exemplo com
 * mocks nas demais seções (sem OpenAI, sem banco, sem envio).
 *
 * Uso: npx tsx src/scripts/previewNewsletterMidia.ts [saida.html]
 */
import { writeFileSync } from 'fs';
import {
  fetchMediaMentions,
  renderNewsletterHtml,
  CuratedNews,
  BlogPost,
} from '../services/newsletterBuilder';

(async () => {
  const mentions = await fetchMediaMentions();
  console.log(`acervo: ${mentions.length} matérias`);
  for (const m of mentions) {
    console.log(`- [${m.veiculo}] ${m.issued?.toISOString().slice(0, 10) ?? 'sem data'} ${m.title}`);
  }
  if (mentions.length === 0) {
    console.error('busca não retornou matérias — nada a renderizar');
    process.exit(1);
  }
  const midia = mentions[0];
  console.log('\nCitação escolhida:', JSON.stringify(midia, null, 2));

  const news: CuratedNews[] = [1, 2, 3].map((i) => ({
    kicker: `Tema · Fonte ${i}`,
    title: `Título da notícia ${i} de exemplo pro layout`,
    summary: 'Resumo de uma frase explicando por que a notícia importa.',
    url: 'https://example.com',
    image: null,
  }));
  const posts: BlogPost[] = [1, 2, 3].map((i) => ({
    titulo: `Post ${i} do BGP Academy de exemplo`,
    meta_description: 'Descrição do post pro layout.',
    featured_image_url: null,
    wix_post_url: 'https://example.com',
    reading_time_min: 5,
  }));

  const out = process.argv[2] || 'newsletter-preview.html';
  writeFileSync(out, renderNewsletterHtml(news, posts, '8 jul 2026', midia));
  console.log(`\nHTML salvo em ${out}`);
})();
