import type { Request, Response, NextFunction } from 'express';
import { drizzle } from 'drizzle-orm/node-postgres';
import { verifySupabaseJwt } from '../auth/jwt';
import { forbidden, unauthorized } from '../lib/errors';
import { supabaseAdmin } from '../lib/supabase';
import { pool, tenantStore, schema } from '../db';

export type Role = 'super_admin' | 'admin' | 'mobilization_lead' | 'viewer';
const ROLES: Role[] = ['super_admin', 'admin', 'mobilization_lead', 'viewer'];

export interface AuthContext {
  userId: string;
  email?: string;
  role: Role;
  /** The tenant this request operates within (null only for platform admins with no org). */
  orgId: string | null;
  /** Platform owner — can use /admin/* cross-org routes; never sees business data. */
  isPlatformAdmin: boolean;
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

    const role: Role = ROLES.includes(profile.role as Role) ? (profile.role as Role) : 'viewer';
    req.auth = {
      userId,
      email: typeof claims.email === 'string' ? claims.email : undefined,
      role,
      orgId: (profile.org_id as string | null) ?? null,
      isPlatformAdmin: !!profile.is_platform_admin,
      claims: claims as Record<string, unknown>,
    };

    // Bind a dedicated connection carrying the tenant GUCs so RLS applies to
    // every query made through the `db` Proxy during this request.
    const client = await pool.connect();
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      client.query('RESET ALL').catch(() => undefined).finally(() => client.release());
    };
    res.on('finish', release);
    res.on('close', release);

    try {
      await client.query('RESET ALL');
      if (req.auth.orgId) {
        await client.query("select set_config('app.current_org_id', $1, false)", [req.auth.orgId]);
      }
      if (req.auth.isPlatformAdmin) {
        await client.query("select set_config('app.platform_admin', 'true', false)");
      }
    } catch (e) {
      release();
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
