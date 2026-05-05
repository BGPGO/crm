import { Request, Response, NextFunction } from 'express';
import { Brand } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      brand: Brand;
    }
  }
}

export function brandContext(req: Request, _res: Response, next: NextFunction) {
  const headerValue = req.header('X-Brand');
  req.brand = headerValue === 'AIMO' ? 'AIMO' : 'BGP';
  next();
}
