import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env, isProd } from '../env';
import * as schema from './schema';

/**
 * Single shared pg pool + Drizzle instance. Connect through Supabase's session
 * pooler (port 5432) — a persistent Railway container holds a small pool.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Supabase requires TLS; the pooler cert chain is not in the local trust store,
  // so we accept it explicitly (the connection is still encrypted).
  ssl: isProd ? { rejectUnauthorized: false } : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
export { schema };
