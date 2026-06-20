import pino from 'pino';
import { env, isProd } from '../env';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Redact anything that could leak credentials in logs.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-cron-secret"]',
      'password',
      '*.password',
      'service_role_key',
    ],
    remove: true,
  },
  base: isProd ? undefined : { pid: undefined, hostname: undefined },
});
