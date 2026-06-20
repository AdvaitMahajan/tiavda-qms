import {
  createRemoteJWKSet,
  jwtVerify,
  decodeProtectedHeader,
  type JWTPayload,
} from 'jose';
import { env } from '../env';
import { unauthorized } from '../lib/errors';

/**
 * Verifies Supabase-issued access tokens. Supports BOTH signing schemes:
 *   - Asymmetric (ES256/RS256) via the project JWKS endpoint — current default.
 *   - Legacy HS256 via the shared SUPABASE_JWT_SECRET — older projects.
 *
 * Every token is checked for a valid signature, the correct issuer, the
 * `authenticated` audience, and expiry (enforced by jose). This is the single
 * trust boundary for the whole API.
 */
const issuer = `${env.SUPABASE_URL}/auth/v1`;
const audience = 'authenticated';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

const hsKey = env.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
  : null;

export interface SupabaseClaims extends JWTPayload {
  email?: string;
  phone?: string;
  role?: string; // postgres role ("authenticated"), NOT the app role
  app_metadata?: Record<string, unknown> & { role?: string; org_id?: string };
  user_metadata?: Record<string, unknown> & { role?: string; org_id?: string };
}

export async function verifySupabaseJwt(token: string): Promise<SupabaseClaims> {
  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    throw unauthorized('Malformed access token');
  }

  try {
    if (alg && alg.startsWith('HS')) {
      if (!hsKey) {
        throw unauthorized('HS256 token rejected: SUPABASE_JWT_SECRET not configured');
      }
      const { payload } = await jwtVerify(token, hsKey, { issuer, audience });
      return payload as SupabaseClaims;
    }
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer,
      audience,
      algorithms: ['ES256', 'RS256'],
    });
    return payload as SupabaseClaims;
  } catch (err) {
    // Preserve our explicit unauthorized() above; collapse jose errors to 401.
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw unauthorized('Invalid or expired access token');
  }
}
