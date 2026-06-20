import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { env } from './env';
import { logger } from './lib/logger';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';

export function createApp() {
  const app = express();

  // Behind Railway's proxy — needed for correct client IPs (rate limiting).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());

  const origins =
    env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: origins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Cron-Secret'],
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    pinoHttp({
      logger,
      // Quiet successful health checks to keep logs readable.
      autoLogging: { ignore: (req) => req.url === '/api/health' || req.url === '/api/health/ready' },
    }),
  );

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: 'rate_limited', message: 'Too many requests' } },
    }),
  );

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
