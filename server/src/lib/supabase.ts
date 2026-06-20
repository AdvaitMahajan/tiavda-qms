import { createClient } from '@supabase/supabase-js';
import { env } from '../env';

/**
 * Service-role Supabase client — used ONLY on the server for the capabilities we
 * still delegate to Supabase rather than reimplement:
 *   - Storage (signed URLs, uploads/downloads on private buckets)
 *   - Auth admin (create user, reset password) for the ported invite-user fn
 *
 * This key bypasses RLS, so it must never be exposed to the browser and every
 * route that uses it enforces auth/role checks itself.
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
