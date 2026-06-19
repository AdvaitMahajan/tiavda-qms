# Supabase Migration Plan — Move to Own Project

## Why
The current Supabase project (plastttfmuixaumzzbig, Sydney region) was created via Lovable under Advait's workspace. We don't have dashboard access or the service_role key. Creating a fresh project under Amarnath's own Supabase account gives full control.

---

## Step 1 — Create New Supabase Project

1. Go to https://supabase.com/dashboard (sign in with GitHub)
2. Click **"New Project"**
3. Settings:
   - **Organization:** Amarnath Pandey
   - **Name:** QMS
   - **Region:** ap-south-1 (Mumbai) — closer to users than current Sydney
   - **Database password:** set and save somewhere safe
4. Wait for project to provision (~2 minutes)
5. Go to **Project Settings → API** and copy:
   - Project URL
   - anon (public) key
   - service_role (secret) key

---

## Step 2 — Recreate Database Schema

Run SQL in the new project's **SQL Editor** (Dashboard → SQL Editor → New Query).
We need to recreate all 15 tables with their columns, constraints, indexes, triggers, and RLS policies:

1. **profiles** — user profiles linked to auth.users
2. **clients** — client contact info
3. **intake_tokens** — shareable form links (32-char, 7-day expiry, single-use)
4. **intake_submissions** — submitted intake form data
5. **rate_matrix** — city/structure/soil-type pricing (unique constraint on combo)
6. **enquiries** — central entity, auto ref TIV-YYYY-NNNN via trigger
7. **quotations** — 4 variants per enquiry (A/B/C/D), one approved at a time
8. **communication_log** — emails and WhatsApp messages
9. **follow_ups** — scheduled follow-up tasks
10. **payments** — advance and final payment tracking
11. **mobilisation** — site visit scheduling
12. **job_completion** — site completion, report delivery, final bill dates
13. **job_reminders** — 3-day/2-day/1-day reminders per job
14. **notifications** — in-app notifications
15. **enquiry_events** — full audit log of status changes
16. **app_settings** — key-value config store

**Claude will generate the full SQL migration script from the existing types.ts and codebase.**

---

## Step 3 — Create Storage Buckets

In Dashboard → Storage, create:
- `quotation-pdfs` (private)
- `receipts` (private)
- `reports` (private)

Set appropriate RLS policies (authenticated users can upload/read).

---

## Step 4 — Update Environment Variables

Update `.env`:
```
VITE_SUPABASE_PROJECT_ID="<new-project-ref>"
VITE_SUPABASE_PUBLISHABLE_KEY="<new-anon-key>"
VITE_SUPABASE_URL="https://<new-project-ref>.supabase.co"
```

---

## Step 5 — Set Supabase Secrets for Edge Functions

In Dashboard → Project Settings → Edge Functions (or via CLI):
```
SENDGRID_API_KEY=<value>
WATI_API_TOKEN=<value>
WATI_BASE_URL=<value>
GOOGLE_SERVICE_ACCOUNT_B64=<value>
GOOGLE_DRIVE_ROOT_FOLDER_ID=<value>
ADMIN_EMAIL=<value>
ADMIN_WHATSAPP=<value>
APP_URL=<your-deployed-url>
COMPANY_STATE=<value>
```

---

## Step 6 — Deploy Edge Functions

Link the new project and deploy:
```bash
supabase link --project-ref <new-project-ref>
supabase functions deploy invite-user
supabase functions deploy daily-cron
supabase functions deploy weekly-summary
```

---

## Step 7 — Configure Auth Settings

In Dashboard → Authentication → URL Configuration:
- **Site URL:** your app's deployed URL (e.g., https://your-domain.com)
- **Redirect URLs:** add your app URL + `/reset-password`

In Dashboard → Authentication → Email Templates:
- Update confirmation and password reset email templates if needed

Auth → Settings:
- Disable "Enable email confirmations" if you want admin-created users to log in immediately
- Or keep it enabled and ensure invite-user function uses `email_confirm: true`

---

## Step 8 — Seed Admin User

Run the seed script with the new service_role key:
```bash
SUPABASE_SERVICE_ROLE_KEY="<new-service-role-key>" node scripts/seed-admin.mjs
```

Credentials:
- Email: amarnathpandey9907@gmail.com
- Password: Amarnath@0320
- Role: super_admin

---

## Step 9 — Test Everything

- [ ] Login works
- [ ] Dashboard loads data
- [ ] Create a client
- [ ] Create an enquiry
- [ ] Rate matrix CRUD
- [ ] Quotation generation + PDF
- [ ] Team management (create user, reset password)
- [ ] Forgot password email arrives and redirects correctly
- [ ] Intake form submission
- [ ] File uploads (quotation PDFs, receipts)

---

## Step 10 — Cleanup

- Remove old project references from `supabase/.temp/`
- Update `supabase/.temp/project-ref` with new ref
- Optionally disconnect old project from Lovable

---

## Notes
- No production data to migrate — fresh start is clean
- Mumbai region (ap-south-1) will be faster for Indian users
- We get full dashboard access: SQL editor, logs, auth management, storage
- Service role key enables proper admin operations
