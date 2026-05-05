/**
 * Helper: AIMO Logo como data-URL base64
 *
 * Le `aimo-logo.png` de packages/api/public/ no carregamento do modulo e
 * exporta como string `data:image/png;base64,...`. Usado pelo seed do
 * template AIMO e pelos wrappers de email para inlinear a logo no HTML —
 * funciona em qualquer ambiente (dev/prod/Resend) sem depender de URL
 * publica/CDN.
 *
 * IMPORTANTE: o PNG fica em `packages/api/public/` porque e o unico
 * diretorio (alem de dist/ e prisma/) copiado pelo Dockerfile da API
 * pra imagem final. NAO mover pra src/ — em prod o asset some.
 *
 * Robustez: tenta varios caminhos. Se nenhum funcionar (asset ausente
 * em build raro), exporta string vazia em vez de derrubar a API.
 */

import * as fs from 'fs';
import * as path from 'path';

function loadLogoDataUrl(): string {
  // __dirname em dev (tsx watch) = packages/api/src/seeds/
  // __dirname em prod (node dist) = packages/api/dist/seeds/
  // Em ambos, ../../public/aimo-logo.png aponta pra packages/api/public/
  const candidates = [
    path.resolve(__dirname, '../../public/aimo-logo.png'),
    path.resolve(__dirname, '../public/aimo-logo.png'),
    path.resolve(process.cwd(), 'public/aimo-logo.png'),
    path.resolve(process.cwd(), 'packages/api/public/aimo-logo.png'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const buffer = fs.readFileSync(candidate);
        return `data:image/png;base64,${buffer.toString('base64')}`;
      }
    } catch {
      // tenta o proximo
    }
  }

  console.warn(
    '[aimoLogoBase64] aimo-logo.png nao encontrado em nenhum candidato; ' +
      'data-URL vazio. Verifique packages/api/public/aimo-logo.png no build.',
  );
  return '';
}

export const AIMO_LOGO_DATA_URL: string = loadLogoDataUrl();
