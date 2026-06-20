import type { Request, Response, NextFunction } from 'express';
import { verifySupabaseJwt } from '../auth/jwt';
import { unauthorized } from '../lib/errors';

export type Role = 'super_admin' | 'admin' | 'mobilization_lead' | 'viewer';
const ROLES: Role[] = ['super_admin', 'admin', 'mobilization_lead', 'viewer'];

export interface AuthContext {
  userId: string;
  email?: string;
  role: Role;
  /** Tenancy seam — null today (single tenant); populated from the JWT once org_id ships. */
  orgId: string | null;
  claims: Record<string, unknown>;
}

function resolveRole(claims: { app_metadata?: { role?: unknown }; user_metadata?: { role?: unknown } }): Role {
  const candidate = claims.app_metadata?.role ?? claims.user_metadata?.role;
  return ROLES.includes(candidate as Role) ? (candidate as Role) : 'viewer';
}

/**
 * Enforcing auth gate: rejects any request without a valid bearer token and
 * attaches the verified AuthContext to req.auth. Mount on every protected route.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw unauthorized('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) throw unauthorized('Empty bearer token');

    const claims = await verifySupabaseJwt(token);
    if (!claims.sub) throw unauthorized('Token missing subject');

    req.auth = {
      userId: String(claims.sub),
      email: typeof claims.email === 'string' ? claims.email : undefined,
      role: resolveRole(claims),
      orgId:
        (claims.app_metadata?.org_id as string | undefined) ??
        (claims.user_metadata?.org_id as string | undefined) ??
        null,
      claims: claims as Record<string, unknown>,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Helper to read a guaranteed-present auth context inside protected handlers. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
