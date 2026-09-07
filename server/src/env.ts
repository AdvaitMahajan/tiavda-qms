import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralised, validated environment. Importing this module anywhere guarantees
 * the process has a well-formed configuration — or it exits immediately with a
 * clear message instead of failing deep inside a request.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.string().default('info'),

  CORS_ORIGINS: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_JWT_SECRET: z.string().optional(),

  CRON_SECRET: z.string().optional(),

  // Master key for AES-GCM encryption of per-org integration secrets at rest.
  // Optional so the API boots without it; provisioning/sending integrations that
  // rely on encrypted org keys will error clearly if it is missing.
  ENCRYPTION_KEY: z.string().optional(),

  // Integrations — optional so the API boots without them; the relevant routes
  // return a clear error if a required secret is missing at call time.
  BREVO_API_KEY: z.string().optional(),
  SENDER_EMAIL: z.string().optional(),
  SENDER_NAME: z.string().optional(),
  WATI_API_TOKEN: z.string().optional(),
  WATI_BASE_URL: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_B64: z.string().optional(),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_WHATSAPP: z.string().optional(),
  APP_URL: z.string().optional(),
  // Set to 'false' to stop this instance running scheduled jobs (e.g. if the API
  // is ever scaled to more than one replica and only one should schedule).
  SCHEDULER_ENABLED: z.string().optional(),
  // OAuth client for "Connect Google Drive" (scope drive.file — the app only
  // ever touches files it created, so no Google verification is needed).
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  COMPANY_STATE: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:');
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
