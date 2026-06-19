# Runbook — Migrate QMS to a New Supabase Project

The app is already env-driven (`src/integrations/supabase/client.ts` reads
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`), so switching projects is
mostly an ops task: create the new project, apply schema, move data, repoint env
+ secrets. Follow these steps in order.

## 0. Prerequisites
- Supabase CLI installed and logged in (`supabase login`).
- Access to the OLD project (to export data) and authority to create the NEW one.

## 1. Create the new project
1. Supabase Dashboard → New Project (pick region **ap-southeast-2 / Sydney** to match current, or your preferred).
2. Note the new **project ref**, **URL**, **anon (publishable) key**, and **service_role key**.

## 2. Apply the schema (migrations)
The repo's migrations are the source of truth **after** the Sprint-1 reconciliation.
```bash
supabase link --project-ref <NEW_PROJECT_REF>
supabase db push          # applies everything in supabase/migrations/ in order
```
This recreates all tables, enums, RLS, triggers, RPCs, and the mobilisation
confirmation schema (now version-controlled). No more hand-created dashboard objects.

> If `db push` complains about the migration history table on a brand-new project,
> run `supabase migration repair` per the CLI prompt, or apply with
> `supabase db reset --linked` (DESTRUCTIVE — only on the empty new project).

## 3. Recreate Storage buckets
Create the same private buckets in the new project (Dashboard → Storage):
`quotation-pdfs`, `receipts`, `reports`, `site-visit-photos`.
(Match privacy = private; the app uses signed URLs.)

## 4. Move the data (old → new)
Schema-only is already applied, so dump **data only** from the old project and load it:
```bash
# Export data only from OLD project
supabase db dump --db-url "<OLD_DB_CONNECTION_STRING>" --data-only -f data.sql
# Load into NEW project
psql "<NEW_DB_CONNECTION_STRING>" -f data.sql
```
Connection strings: Dashboard → Project Settings → Database → Connection string (URI).
Move storage objects separately (download from old buckets, re-upload to new), or
skip if starting fresh.

> Order matters if you didn't use a single dump: load parent tables before children
> (clients → enquiries → quotations/payments/mobilisation → tokens). A single
> `--data-only` dump handles ordering for you.

## 5. Recreate auth users
Auth lives in `auth.users` (not in `public`). Either:
- Re-invite the ~10 team members via the app's Team Management (creates fresh logins), **or**
- Use the Supabase CLI/Management API to migrate users.
After users exist, confirm each has the correct `role` in `public.profiles`
(the signup trigger copies `user_metadata.role` → `profiles.role`).

## 6. Set Edge Function secrets (server-side)
In the NEW project: Dashboard → Edge Functions → Secrets (or `supabase secrets set`):
```
BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME,
WATI_API_TOKEN, WATI_BASE_URL,
GOOGLE_SERVICE_ACCOUNT_B64, GOOGLE_DRIVE_ROOT_FOLDER_ID,
ADMIN_EMAIL, ADMIN_WHATSAPP, APP_URL, COMPANY_STATE
```
**Use REAL values this time** — the current project's secrets are dummy placeholders
(email/WhatsApp/Drive silently fail). See `[[supabase-secrets-placeholder]]`.

Deploy the functions:
```bash
supabase functions deploy daily-cron weekly-summary send-email send-whatsapp create-drive-folder invite-user
```

## 7. Configure the cron settings (for daily-cron / weekly-summary)
In the NEW project's SQL editor (real values, not committed):
```sql
ALTER DATABASE postgres SET app.edge_base_url = 'https://<NEW_PROJECT_REF>.supabase.co/functions/v1';
ALTER DATABASE postgres SET app.service_role_key = '<NEW_SERVICE_ROLE_KEY>';
```
Then re-run the schedule block in `supabase/migrations/20260614000004_schedule_cron_jobs.sql`
(or just `db push` already created the jobs — they'll pick up the settings).

## 8. Repoint the app
1. Update `.env` with the NEW values:
   ```
   VITE_SUPABASE_PROJECT_ID=<NEW_PROJECT_REF>
   VITE_SUPABASE_URL=https://<NEW_PROJECT_REF>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<NEW_ANON_KEY>
   ```
2. Update `supabase/config.toml` → `project_id = "<NEW_PROJECT_REF>"`.
3. Update the URL reference in `CLAUDE.md` (documentation only).
4. Update the hosting provider's env vars (Vercel/Netlify/etc.) to the new values and redeploy.

## 9. Smoke test
- Log in; confirm your account has admin/super_admin (role gating works).
- Create a test enquiry → quotation → PDF.
- Submit the public intake form (anon path).
- Open a mobilisation confirmation link (anon RPC path).
- Trigger `daily-cron` manually once and confirm reminders/notifications appear.

## 10. Decommission
Once verified, pause/delete the old project (after a final backup — see the
backup workflows in `.github/workflows/`).
