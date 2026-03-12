import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import prisma from '../lib/prisma';

// ── Auth cache ──────────────────────────────────────────────────────────────
const AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const authCache = new Map<string, { user: NonNullable<Awaited<ReturnType<typeof resolveUserFromDB>>>; expiresAt: number }>();

// Cleanup expired entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of authCache) {
    if (entry.expiresAt <= now) authCache.delete(key);
  }
}, 60_000);

/**
 * Extracts the Bearer token from the Authorization header.
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

/**
 * Resolves the Supabase JWT into a Prisma User (no cache).
 */
async function resolveUserFromDB(token: string) {
  const {
    data: { user: supabaseUser },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !supabaseUser?.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: supabaseUser.email },
  });

  if (!user || !user.isActive) return null;

  return user;
}

/**
 * Resolves user with in-memory cache (TTL 5min).
 */
async function resolveUser(token: string) {
  const now = Date.now();
  const cached = authCache.get(token);
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  const user = await resolveUserFromDB(token);
  if (user) {
    authCache.set(token, { user, expiresAt: now + AUTH_CACHE_TTL });
  }
  return user;
}

/**
 * Mandatory auth middleware.
 * Returns 401 if no valid token is present.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido' });
    }

    const user = await resolveUser(token);
    if (!user) {
      return res.status(401).json({ error: 'Token inválido ou usuário não encontrado' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Falha na autenticação' });
  }
}

/**
 * Optional auth middleware.
 * Attaches user if a valid token is present, but does NOT block the request otherwise.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const token = extractToken(req);
    if (token) {
      const user = await resolveUser(token);
      if (user) {
        req.user = user;
      }
    }
  } catch {
    // silently ignore auth errors in optional mode
  }
  next();
}
