# Migration to New Account (GitHub · Supabase · Vercel · Railway)

Moves the whole project to the consolidated account behind
**github.com/AdvaitMahajan**. One GitHub repo drives two deploys:

- **Vercel** → frontend (repo root, Vite app)
- **Railway** → backend (root directory `server/`)
- **Supabase** → database + Storage + Auth

> Current state: the frontend still talks to Supabase **directly**; the Railway
> API runs in parallel and isn't consumed yet (rewire is a later task). So after
> this migration the app works exactly as today, plus the API is deployed.

Fill in the placeholders as you go:
`<NEW_REF>` `<NEW_DB_PASSWORD>` `<NEW_ANON_KEY>` `<NEW_SERVICE_ROLE_KEY>`
`<VERCEL_URL>` `<RAILWAY_URL>` `<CRON_SECRET>`

---

## 0. Prerequisites
- Supabase CLI: `npm i -g supabase` then `supabase login`
- A GitHub Personal Access Token (or `gh auth login`) for the AdvaitMahajan account
- Local git remotes are already set:
  - `origin` → `https://github.com/AdvaitMahajan/tiavda-qms.git` (new)
  - `old` → `https://github.com/Amar030521/tiavda-qms.git` (backup)

---

## 1. Create the new GitHub repo + push
1. Create an **empty** repo `tiavda-qms` under the AdvaitMahajan account
   (github.com/new — no README/gitignore, it already exists locally).
   Or via CLI: `gh repo create AdvaitMahajan/tiavda-qms --private`
2. Push:
   ```bash
   git push -u origin main
   ```
   (Authenticate as AdvaitMahajan when prompted / with the PAT.)

---

## 2. Create the new Supabase project
1. Dashboard → **New Project** under the AdvaitMahajan-linked org.
   - Name: `QMS`  ·  Region: **ap-south-1 (Mumbai)**  ·  set `<NEW_DB_PASSWORD>`.
2. Settings → API: copy **Project URL**, **anon key** (`<NEW_ANON_KEY>`),
   **service_role key** (`<NEW_SERVICE_ROLE_KEY>`). Project ref = `<NEW_REF>`.
3. Apply the schema (SQL Editor → run, in order):
   - `supabase/migrations/00000000000000_full_schema.sql`
   - then each later `supabase/migrations/*.sql` in filename order.
   (Or `supabase link --project-ref <NEW_REF>` then `supabase db push`.)
4. Storage → create the buckets (private): `quotation-pdfs`, `receipts`,
   `reports`, `site-visit-photos`, `intake-uploads`. (The first four are also
   created by the schema's storage section; add `intake-uploads`.)
5. Auth → URL Configuration: Site URL = `<VERCEL_URL>`, add redirect
   `<VERCEL_URL>/reset-password`.

---

## 3. Move the data (old → new)
Schema is already applied, so dump **data only** and load it:
```bash
# from OLD project (Settings → Database → Connection string → URI)
supabase db dump --db-url "<OLD_DB_URI>" --data-only -f data.sql
# into NEW project
psql "<NEW_DB_URI>" -f data.sql
```
A single `--data-only` dump preserves FK ordering. Move storage objects
separately (download from old buckets, re-upload to new) or skip if starting fresh.

> If you'd rather start clean (no production data yet per the runbook history),
> skip this step entirely.

---

## 4. Recreate auth users
`auth.users` is not in `public`. Either:
- Re-invite the ~10 team members via the app's Team Management (or
  `POST /api/team/users` once the API is wired), **or**
- Migrate via the Supabase Management API / CLI.
After they exist, confirm each `public.profiles.role` is correct (the
`on_auth_user_created` trigger copies `user_metadata.role`).

---

## 5. Repoint local config to the new project
Once you have `<NEW_REF>` + keys, update:
- `supabase/config.toml` → `project_id = "<NEW_REF>"`
- `CLAUDE.md` → the Supabase URL line (docs only)
- root `.env` (frontend, gitignored — copy from `.env.example`):
  ```
  VITE_SUPABASE_PROJECT_ID=<NEW_REF>
  VITE_SUPABASE_URL=https://<NEW_REF>.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=<NEW_ANON_KEY>
  ```
- `server/.env` (backend, gitignored — copy from `server/.env.example`):
  ```
  DATABASE_URL=postgresql://postgres.<NEW_REF>:<NEW_DB_PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
  SUPABASE_URL=https://<NEW_REF>.supabase.co
  SUPABASE_ANON_KEY=<NEW_ANON_KEY>
  SUPABASE_SERVICE_ROLE_KEY=<NEW_SERVICE_ROLE_KEY>
  CRON_SECRET=<CRON_SECRET>
  CORS_ORIGINS=<VERCEL_URL>
  # + real BREVO / WATI / GOOGLE secrets (no longer placeholders)
  ```
> Tell me `<NEW_REF>` + anon key and I'll edit `config.toml` / `CLAUDE.md` for you.

---

## 6. Vercel (frontend)
1. Vercel (AdvaitMahajan) → **Add New Project** → import `AdvaitMahajan/tiavda-qms`.
2. Framework: Vite. Root: repo root. Build `npm run build`, output `dist`.
   (`vercel.json` already has the SPA rewrite.)
3. Env vars: `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY` (the new values).
4. Deploy → note `<VERCEL_URL>`; put it back into Supabase Auth (step 2.5).

---

## 7. Railway (backend)
1. Railway (AdvaitMahajan) → **New Project → Deploy from GitHub** →
   `AdvaitMahajan/tiavda-qms`.
2. Service settings → **Root Directory = `server/`** (Dockerfile auto-detected).
3. Variables: everything from `server/.env.example` with real values
   (`DATABASE_URL`, `SUPABASE_*`, `CRON_SECRET`, `CORS_ORIGINS=<VERCEL_URL>`,
   `APP_URL=<VERCEL_URL>`, Brevo/WATI/Google).
4. Health check path: `/api/health/ready`. Deploy → note `<RAILWAY_URL>`.
5. **Cron** (Railway → Cron, or a scheduler) — POST with header
   `X-Cron-Secret: <CRON_SECRET>`:
   - daily `0 3 * * *` → `<RAILWAY_URL>/api/cron/daily`
   - weekly `0 4 * * 1` → `<RAILWAY_URL>/api/cron/weekly`

---

## 8. Smoke test
- `curl <RAILWAY_URL>/api/health/ready` → `{"status":"ready","db":"up"}`
- Open `<VERCEL_URL>` → log in → dashboard loads → create a client/enquiry.
- Public intake link submits.
- Trigger `POST <RAILWAY_URL>/api/cron/daily` once (with the secret) → check logs.

---

## 9. Decommission old
After verifying, pause/delete the old Supabase project and archive the old
GitHub repo. Keep a final backup first.

---

## What's NOT done yet (separate tasks)
1. **Rewire the React app** to call the Railway API instead of `supabase-js`
   (the API is deployed but unused until then).
2. **`org_id` multi-tenancy** migration on the new database.
