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
// Key by X-Forwarded-For (real client IP behind Traefik) instead of socket IP
// Without this, all users behind the proxy share one bucket
const keyGenerator = (req: express.Request) =>
  (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';

// Global: 2000 requests per minute per real IP
// 3+ concurrent users × ~20 req/page load × frequent navigation = high volume
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 2000,
  keyGenerator,
  validate: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em breve.' },
});
app.use('/api', globalLimiter);

// Auth: 20 attempts per 15 minutes per real IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator,
  validate: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
});
app.use('/api/auth/login', authLimiter);

// Webhooks: 300 per minute per real IP (Z-API, Calendly, GreatPages send bursts)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  keyGenerator,
  validate: false,
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
app.listen(PORT, async () => {
  console.log(`[api] Server running on http://localhost:${PORT}`);
  // Sync business hours from DB config into sendingWindow module
  try {
    const { default: prisma } = await import('./lib/prisma');
    const { setBusinessHours } = await import('./utils/sendingWindow');
    const cfg = await prisma.whatsAppConfig.findFirst({
      select: { businessHoursStart: true, businessHoursEndWeekday: true, businessHoursEndSaturday: true },
    });
    if (cfg) setBusinessHours(cfg.businessHoursStart, cfg.businessHoursEndWeekday, cfg.businessHoursEndSaturday);
  } catch { /* non-fatal */ }
  startAllJobs();
});

export default app;
