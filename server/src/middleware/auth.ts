import type { Request, Response, NextFunction } from 'express';
import { drizzle } from 'drizzle-orm/node-postgres';
import { verifySupabaseJwt } from '../auth/jwt';
import { forbidden, unauthorized } from '../lib/errors';
import { supabaseAdmin } from '../lib/supabase';
import { pool, tenantStore, schema } from '../db';

export type Role =
  | 'super_admin'
  | 'admin'
  | 'mobilization_lead'
  // Operations roles (see 20260724000002_team_roles_and_directory).
  | 'execution_head'
  | 'execution'
  | 'planning'
  | 'reporting'
  | 'accounts'
  | 'lab'
  | 'viewer';
// Any role not listed here is downgraded to 'viewer' below, so this MUST stay
// in sync with the user_role enum.
const ROLES: Role[] = [
  'super_admin', 'admin', 'mobilization_lead',
  'execution_head', 'execution', 'planning', 'reporting', 'accounts', 'lab',
  'viewer',
];

export interface AuthContext {
  userId: string;
  email?: string;
  role: Role;
  /** The tenant this request operates within (null only for platform admins with no org). */
  orgId: string | null;
  /** Platform owner — can use /admin/* cross-org routes; never sees business data. */
  isPlatformAdmin: boolean;
  /** Per-org feature flags (quotations/payments/site_visits/comms). */
  features: Record<string, boolean>;
  claims: Record<string, unknown>;
}

/**
 * Enforcing auth gate. Verifies the bearer token, resolves the caller's tenant +
 * role from the `profiles` table (authoritative — read via service role so it is
 * not subject to RLS), then binds a dedicated pooled connection with
 * `app.current_org_id` set and runs the rest of the request inside the tenant
 * AsyncLocalStorage context. The connection is reset + released on response end.
 *
 * Mount on every protected route (each domain router already does router.use).
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw unauthorized('Missing bearer token');
    const token = header.slice('Bearer '.length).trim();
    if (!token) throw unauthorized('Empty bearer token');

    const claims = await verifySupabaseJwt(token);
    if (!claims.sub) throw unauthorized('Token missing subject');
    const userId = String(claims.sub);

    // Authoritative tenant + role from profiles (service role bypasses RLS, so
    // this one lookup does not create a chicken-and-egg with org_isolation).
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('org_id, role, is_active, is_platform_admin')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw unauthorized('Could not resolve profile');
    if (!profile) throw forbidden('No profile for this user');
    if (profile.is_active === false) throw forbidden('Account is deactivated');

    // Resolve the org's feature flags + status (suspended orgs are blocked).
    let features: Record<string, boolean> = {};
    if (profile.org_id) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('status, features')
        .eq('id', profile.org_id)
        .maybeSingle();
      if (org?.status === 'suspended' && !profile.is_platform_admin) {
        throw forbidden('This organization is suspended. Contact the platform administrator.');
      }
      features = (org?.features as Record<string, boolean>) ?? {};
    }

    const role: Role = ROLES.includes(profile.role as Role) ? (profile.role as Role) : 'viewer';
    req.auth = {
      userId,
      email: typeof claims.email === 'string' ? claims.email : undefined,
      role,
      orgId: (profile.org_id as string | null) ?? null,
      isPlatformAdmin: !!profile.is_platform_admin,
      features,
      claims: claims as Record<string, unknown>,
    };

    // Bind a dedicated connection carrying the tenant GUCs so RLS applies to
    // every query made through the `db` Proxy during this request.
    const client = await pool.connect();
    let released = false;
    let finished = false;
    // Normal completion: the handler has awaited all its queries, so the
    // connection is idle — reset the tenant GUCs and return it to the pool.
    const releaseClean = (): void => {
      if (released) return;
      released = true;
      client.query('RESET ROLE; RESET ALL').catch(() => undefined).finally(() => client.release());
    };
    // Client aborted / disconnected before the response finished: the handler may
    // still have a query in flight on this connection. Resetting or returning it
    // now would hand a BUSY connection to the next request (→ "client is already
    // executing a query" and a poisoned pool that cascades into errored requests).
    // Discard it instead — pg removes it from the pool and opens a fresh one.
    const releaseAborted = (): void => {
      if (released) return;
      released = true;
      try { client.release(new Error('request aborted — connection discarded')); } catch { /* already gone */ }
    };
    res.on('finish', () => { finished = true; releaseClean(); });
    res.on('close', () => { if (!finished) releaseAborted(); });

    try {
      await client.query('RESET ROLE; RESET ALL');
      // Always set the GUC, even with no org. RESET ALL leaves a custom GUC as
      // the empty string rather than unsetting it, and every org_isolation policy
      // casts it with `current_setting(...)::uuid` — so ''::uuid raises "invalid
      // input syntax for type uuid" and fails the query. Postgres evaluates that
      // cast even when the platform-admin branch of the OR already matched, which
      // made every RLS-protected read 500 for a platform admin with no org. The
      // all-zero uuid matches no row, and platform admins are allowed by the
      // policy's other branch.
      await client.query("select set_config('app.current_org_id', $1, false)", [
        req.auth.orgId ?? '00000000-0000-0000-0000-000000000000',
      ]);
      if (req.auth.isPlatformAdmin) {
        await client.query("select set_config('app.platform_admin', 'true', false)");
      }
      // Become the NOBYPASSRLS role so org_isolation policies are enforced.
      await client.query('SET ROLE app_tenant');
    } catch (e) {
      releaseClean();
      throw e;
    }

    const boundDb = drizzle(client, { schema });
    tenantStore.run(
      { orgId: req.auth.orgId, isPlatformAdmin: req.auth.isPlatformAdmin, userId, db: boundDb },
      () => next(),
    );
  } catch (err) {
    next(err);
  }
}

/** Helper to read a guaranteed-present auth context inside protected handlers. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
