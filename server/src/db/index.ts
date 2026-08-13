import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AsyncLocalStorage } from 'node:async_hooks';
import { env, isProd } from '../env';
import * as schema from './schema';

/**
 * Single shared pg pool. Each authenticated request checks out a dedicated
 * connection, sets `app.current_org_id` (+ `app.platform_admin`) on it, and runs
 * inside an AsyncLocalStorage context so every query made through the exported
 * `db` Proxy uses that connection — which means Postgres RLS (org_isolation,
 * FORCE) scopes the request to its tenant. The connection is reset+released when
 * the response finishes.
 */
// Supabase's SESSION pooler (port 5432) hard-caps concurrent clients (default 15).
// Our `max` MUST stay safely under that cap: if we try to open more, the pooler
// rejects with `EMAXCONNSESSION` and the request 500s. Excess acquisitions above
// `max` simply queue in node-postgres (up to connectionTimeoutMillis) instead of
// failing. Configurable via DB_POOL_MAX; default 10 leaves headroom for the
// occasional out-of-band connection (migrations, one-off scripts).
const POOL_MAX = Math.max(2, Math.min(Number(process.env.DB_POOL_MAX) || 10, 14));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Supabase requires TLS; the pooler cert chain isn't in the local trust store.
  ssl: isProd ? { rejectUnauthorized: false } : { rejectUnauthorized: false },
});

// The pooler can drop idle connections; without this handler node-postgres would
// emit an unhandled 'error' on the idle client and crash the process.
pool.on('error', (err) => {
  console.error('[pg pool] idle client error (recovered):', err.message);
});

type DB = NodePgDatabase<typeof schema>;

const baseDb: DB = drizzle(pool, { schema });

export interface TenantContext {
  orgId: string | null;
  isPlatformAdmin: boolean;
  userId: string;
  db: DB;
}

export const tenantStore = new AsyncLocalStorage<TenantContext>();

/** Current request's org id (null for platform-admin / no-tenant contexts). */
export function currentOrgId(): string | null {
  return tenantStore.getStore()?.orgId ?? null;
}

/** Org id for stamping inserts — throws if there is no tenant context. */
export function requireOrgId(): string {
  const orgId = tenantStore.getStore()?.orgId;
  if (!orgId) throw new Error('No tenant (org) context for this operation');
  return orgId;
}

/** True when the current context is a platform admin. */
export function isPlatformAdminCtx(): boolean {
  return tenantStore.getStore()?.isPlatformAdmin ?? false;
}

/**
 * Transparent tenant-aware Drizzle handle. Inside a request it forwards to the
 * connection bound by the auth middleware (RLS-scoped); otherwise to the base
 * pool (no org context → RLS returns nothing on business tables, fail-closed).
 */
export const db: DB = new Proxy(baseDb, {
  get(_target, prop, receiver) {
    const active = tenantStore.getStore()?.db ?? baseDb;
    const value = Reflect.get(active, prop, receiver);
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(active) : value;
  },
}) as DB;

/**
 * Run `fn` with a dedicated connection bound to a tenant context (programmatic
 * use: cron per-org loops, admin operations on a specific org). The request path
 * uses the auth middleware instead, which ties release to the response.
 */
export async function runWithTenant<T>(
  ctx: { orgId: string | null; isPlatformAdmin?: boolean; userId?: string },
  fn: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('RESET ROLE; RESET ALL');
    if (ctx.orgId) await client.query("select set_config('app.current_org_id', $1, false)", [ctx.orgId]);
    if (ctx.isPlatformAdmin) await client.query("select set_config('app.platform_admin', 'true', false)");
    await client.query('SET ROLE app_tenant');
    const boundDb = drizzle(client, { schema });
    return await tenantStore.run(
      { orgId: ctx.orgId, isPlatformAdmin: !!ctx.isPlatformAdmin, userId: ctx.userId ?? '', db: boundDb },
      fn,
    );
  } finally {
    try { await client.query('RESET ROLE; RESET ALL'); } catch { /* ignore */ }
    client.release();
  }
}

/**
 * Run async thunks strictly one at a time (never concurrently). REQUIRED for the
 * per-request single-connection model: firing multiple queries with
 * `Promise.all([db…, db…])` runs them on the same bound connection at once, which
 * trips node-postgres's "client is already executing a query" and can corrupt the
 * connection. Pass THUNKS (`() => db.select()…`) so each query is created and
 * awaited only when the previous one has finished.
 */
export async function series<T extends readonly unknown[]>(
  thunks: readonly [...{ [K in keyof T]: () => Promise<T[K]> }],
): Promise<T> {
  const out = [] as unknown[];
  for (const thunk of thunks) out.push(await (thunk as () => Promise<unknown>)());
  return out as unknown as T;
}

export { schema };
