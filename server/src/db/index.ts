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
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Each request holds a connection for its lifetime (incl. external calls), so
  // keep comfortable headroom over expected concurrency.
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Supabase requires TLS; the pooler cert chain isn't in the local trust store.
  ssl: isProd ? { rejectUnauthorized: false } : { rejectUnauthorized: false },
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

export { schema };
