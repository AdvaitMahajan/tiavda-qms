// Create the first super_admin login on the new project using the service-role
// key (creates an email-confirmed user so they can log in immediately).
//
//   cd server && node scripts/create-admin.mjs
//
// Reads from server/.env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_ADMIN_EMAIL,
//   SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME (optional)
import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
const NAME = process.env.SEED_ADMIN_NAME || 'Administrator';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
  console.error('❌ Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD in server/.env');
  process.exit(1);
}
if (!SUPABASE_URL.includes('yikgnboolunszxtrmbfz')) {
  console.error('❌ Refusing: SUPABASE_URL is not the new project (yikgnboolunszxtrmbfz).');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await sb.auth.admin.createUser({
  email: SEED_ADMIN_EMAIL,
  password: SEED_ADMIN_PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: NAME, role: 'super_admin' },
});

if (error) {
  console.error('❌', error.message);
  process.exit(1);
}

console.log(`✅ Admin user created: ${data.user.id}  (${SEED_ADMIN_EMAIL})`);

// Ensure the profile row reflects super_admin (the on_auth_user_created trigger
// also sets this from user_metadata; this is a belt-and-suspenders update).
const { error: upErr } = await sb
  .from('profiles')
  .update({ role: 'super_admin', is_active: true })
  .eq('id', data.user.id);

if (upErr) console.log(`⚠ profile role update failed: ${upErr.message}`);
else console.log('✅ profile role set to super_admin — you can now log in.');
