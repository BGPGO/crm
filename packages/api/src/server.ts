import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { responseSerializer, inputSanitizer } from './middleware/serializer';
import { startAllJobs } from './jobs';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// ─── Security & utility middleware ────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Next.js manages CSP
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
      : 'http://localhost:3000',
    credentials: true,
  })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ─── Rate limiting ───────────────────────────────────────────────────────────
// Global: 600 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em breve.' },
});
app.use('/api', globalLimiter);

// Auth: 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
});
app.use('/api/auth/login', authLimiter);

// Webhooks: 120 per minute per IP
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded.' },
});
app.use('/api/webhooks', webhookLimiter);
app.use('/api/whatsapp/webhook', webhookLimiter);
app.use('/api/calendly/webhook', webhookLimiter);
app.use('/api/contracts/webhook', webhookLimiter);

// ─── Serialization layer ─────────────────────────────────────────────────────
// Converts Prisma Decimal→number in responses, sanitizes empty strings in inputs
app.use(responseSerializer());
app.use(inputSanitizer());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[api] Server running on http://localhost:${PORT}`);
  startAllJobs();
});

export default app;
