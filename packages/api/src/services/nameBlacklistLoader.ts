/**
 * Loader do custom blacklist de nomes (WhatsAppConfig.nameBlacklist).
 *
 * Separado do utils/nameSanitizer pra manter o sanitizer sem dependência de Prisma
 * (ele é importado por muitos módulos e fica mais leve/testável sem DB).
 *
 * Chame `loadNameBlacklistFromDB()`:
 *   - Uma vez no startup do servidor (antes do primeiro sanitizeGreetingName)
 *   - Após cada save da config BIA (pra refletir mudanças do admin)
 */

import prisma from '../lib/prisma';
import { setCustomBlacklist } from '../utils/nameSanitizer';

/**
 * Lê nameBlacklist do WhatsAppConfig e aplica no cache do sanitizer.
 * Em caso de erro (DB fora, tabela sem linha), mantém o baseline ativo — fail-safe.
 */
export async function loadNameBlacklistFromDB(): Promise<void> {
  try {
    const config = await prisma.whatsAppConfig.findFirst({
      select: { nameBlacklist: true },
    });

    const terms = config?.nameBlacklist ?? [];
    setCustomBlacklist(terms);
    console.log(`[nameBlacklistLoader] Custom blacklist carregada (${terms.length} termos)`);
  } catch (err) {
    console.error('[nameBlacklistLoader] Falha ao carregar custom blacklist — usando só baseline:', err);
    setCustomBlacklist([]);
  }
}
