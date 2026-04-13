import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const PUBLIC_SUPABASE_CLIENT_NAME = 'supabasePublic (anon)';

const noSessionStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

// Public client with no session persistence — for unauthenticated pages like /intake
export const supabasePublic = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'tiavda-qms-intake-public',
    storage: noSessionStorage,
  }
});
