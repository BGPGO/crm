import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;

  if (statusCode === 500) {
    console.error(err.stack || err.message);
  }

  const body: { error: string; details?: unknown } = {
    error: statusCode === 500
      ? 'Erro interno do servidor'
      : (err.message || 'Internal Server Error'),
  };

  if (err.details !== undefined && statusCode !== 500) {
    body.details = err.details;
  }

  res.status(statusCode).json(body);
}

export function createError(
  message: string,
  statusCode = 500,
  details?: unknown
): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.details = details;
  return err;
}
