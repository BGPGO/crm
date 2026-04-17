/**
 * Middleware de validação de API key — exclusivo para endpoints de integração externa.
 *
 * Lê o header X-API-Key e compara com ANALYTICS_API_KEY do ambiente.
 * Não substitui o JWT normal do CRM — é usado em paralelo nos endpoints de export.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Valida o header X-API-Key contra a variável de ambiente ANALYTICS_API_KEY.
 * Retorna 401 se ausente ou inválida.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = process.env.ANALYTICS_API_KEY;

  if (!expectedKey) {
    res.status(500).json({ error: 'ANALYTICS_API_KEY não configurada no servidor' });
    return;
  }

  const providedKey = req.headers['x-api-key'];

  if (!providedKey || providedKey !== expectedKey) {
    res.status(401).json({ error: 'API key inválida ou ausente. Forneça o header X-API-Key.' });
    return;
  }

  next();
}
