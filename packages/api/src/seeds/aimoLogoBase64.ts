/**
 * Helper: AIMO Logo como data-URL base64
 *
 * Le `aimo-logo.png` deste mesmo diretorio em tempo de execucao e exporta
 * como string `data:image/png;base64,...`. Usado pelo seed do template AIMO
 * para inlinear a logo no HTML do email — funciona em qualquer ambiente
 * (dev/prod/Resend) sem depender de URL publica/CDN.
 */

import * as fs from 'fs';
import * as path from 'path';

const logoPath = path.resolve(__dirname, 'aimo-logo.png');
const logoBuffer = fs.readFileSync(logoPath);
const logoBase64 = logoBuffer.toString('base64');

export const AIMO_LOGO_DATA_URL = `data:image/png;base64,${logoBase64}`;
