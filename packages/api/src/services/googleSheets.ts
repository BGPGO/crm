import { createSign } from 'node:crypto';

/**
 * Leitura de Google Sheets via service account (JWT RS256 → access token).
 * Sem dependências novas — mesmo modelo da integração GA4 do ContIA.
 *
 * Env:
 *   GOOGLE_SHEETS_SA_KEY — JSON da chave do service account (string minificada).
 *                          O service account precisa de acesso Leitor na planilha.
 */

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function getServiceAccount(): ServiceAccountKey | null {
  const rawJson = process.env.GOOGLE_SHEETS_SA_KEY;
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson) as ServiceAccountKey;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    console.error('[googleSheets] GOOGLE_SHEETS_SA_KEY não é um JSON válido');
    return null;
  }
}

function base64url(input: object): string {
  return Buffer.from(JSON.stringify(input)).toString('base64url');
}

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const sa = getServiceAccount();
  if (!sa) return null;

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!data.access_token) {
    console.error('[googleSheets] Falha ao obter access token:', data.error ?? data);
    return null;
  }

  // Cache por ~50min (token vale 60min)
  cachedToken = { token: data.access_token, expiresAt: Date.now() + 50 * 60 * 1000 };
  return data.access_token;
}

/**
 * Lê valores de uma planilha. Range sem nome de aba (ex.: "A1:Z") lê a primeira aba.
 * Retorna null em erro de auth/rede; matriz de linhas (possivelmente vazia) em sucesso.
 */
export async function readSheetValues(spreadsheetId: string, range: string): Promise<string[][] | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
  });

  const data = (await res.json()) as { values?: string[][]; error?: { code: number; message: string } };
  if (data.error) {
    console.error(`[googleSheets] Erro ${data.error.code} ao ler planilha: ${data.error.message}`);
    return null;
  }
  return data.values ?? [];
}
