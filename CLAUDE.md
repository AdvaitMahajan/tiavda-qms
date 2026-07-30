# QMS — Project Brain

> Dev: `npm run dev` (frontend, Vite) · API: `cd server && npm run dev` (Express on :8080)

## What We Are Building
A Quotation Management System (QMS) for a geotechnical consultancy firm. It replaces a manual workflow — WhatsApp enquiries, Excel quotations, verbal mobilisation — with a production web platform. Being taken **multi‑tenant (SaaS)** so it can be sold to multiple consultancy firms.

## Business Context
- Product: Geotechnical QMS (consultants, Pune/Bangalore)
- Built/operated by: Mindmap Digital (owner identity: Advait Mahajan)
- Lifecycle: Intake → Quotation → Follow‑up → Confirmation → Payment → Mobilisation → Job Completion

## Architecture (Model B — custom API)
The app is **not** Supabase‑direct anymore. It runs as three pieces:

```
React/Vite frontend  ──HTTPS──>  Railway custom REST API  ──pg──>  Supabase Postgres
   (Vercel)                        (Express + Drizzle)              (Mumbai, ap-south-1)
        │                                                                 │
        └── Supabase Auth (identity only: login/session)         Supabase Storage (private buckets)
```

- **The Railway API is the single data path.** The frontend has **no** `supabase.from/.rpc/.storage/.functions/.channel` calls. Supabase‑js is used **only for Auth** (email+password login, session, signOut, password reset) in `useAuth`, `Login`, `ResetPassword`, and the admin‑on‑behalf check in `Intake`.
- **Supabase's role** is now: Postgres database + private Storage buckets + Auth identity provider. RLS/JWT DB functions are inert under the API's pooled connection — **tenant isolation & role checks live in API code** (and, in Phase 2, Postgres RLS via `SET LOCAL`).
- **Realtime → polling.** TanStack Query `refetchInterval`: lists/dashboard ~20s, notifications/mobilisation ~10s.

## Tech Stack
- **Frontend:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui · TanStack Query (server state) + Zustand (UI/auth) · React Hook Form + Zod · Framer Motion · @dnd-kit · Recharts · Sonner · @react-pdf/renderer (client‑side PDF, uploaded via signed URL)
- **Backend (`server/`):** Node 22 + Express + Drizzle ORM (`pg`) + `jose` (verifies Supabase JWT) + Zod. Dockerfile → Railway (root dir `server/`, **node:22-slim required** — supabase-js needs global WebSocket).
- **Infra:** Supabase Postgres+Storage+Auth · Railway (API) · Vercel (frontend)

## Frontend data access (use these, not supabase)
- `src/lib/apiClient.ts` — `apiClient.get/post/patch/del(path, …)`; adds `Authorization: Bearer <token>` from the Supabase session; throws `ApiError {status,code,message}`; on 401 calls `signOut()`. `publicApi.get/post` = unauthenticated, for `/public/*`.
- `src/lib/storage.ts` — `uploadToStorage` / `getSignedUrl` / `downloadFromStorage` (via `/storage/sign-upload` & `/storage/sign-url`); `getPublicStorageUrl` for the public `site-visit-photos` bucket.
- `src/lib/notifications.ts` (`sendNotification` → `/integrations/email`), `src/lib/intakeTokenUtils.ts`, `src/lib/followUpCadence.ts`.
- Always use TanStack Query; invalidate queries after mutations; Sonner for feedback.

## Backend layout (`server/src/`)
- `app.ts` (CORS: any localhost in dev, `CORS_ORIGINS` allowlist in prod), `routes/index.ts` (mounts modules under `/api`).
- `middleware/auth.ts` (verify JWT → `req.auth`), `middleware/roles.ts` (`requireNotViewer` ≈ `is_not_viewer()`, `requireEditor` ≈ `is_editor()`).
- `db/schema.ts` — Drizzle schema mirroring the **live DB in snake_case**, `mode:'string'` timestamps for response parity; trigger‑generated cols (`ref_number`, `quotation_number`, site‑visit `token`) use `.default('')`.
- `modules/*` — one per domain: clients, enquiries, quotations, payments, follow-ups, job-completion, communications, mobilisation, site-visits, notifications, profiles, team, settings, rate-matrix, dashboard, accounts, intake-tokens, storage, integrations, public.
- `integrations/*` — Brevo email, WATI WhatsApp, Google Drive (faithful ports of the old edge functions).
- `modules/public/*` — unauthenticated, token‑gated; proxies the SECURITY DEFINER RPCs (`submit_intake_form`, `get/submit_site_visit`, `get/confirm/propose_alternate` mobilisation) via `supabaseAdmin.rpc`.
- Cron at `/api/cron/*` guarded by `X-Cron-Secret` (not yet scheduled).

## Deployments
- Frontend: `https://tiavda-qms.vercel.app` — env `VITE_API_URL` (prod `…railway.app/api`), `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- API: `https://tiavda-qms-production.up.railway.app` — healthcheck `/api/health/ready`.
- Supabase project ref `yikgnboolunszxtrmbfz` (Mumbai). Schema applied via `server/scripts/run-migrations.mjs` (statement‑level idempotent runner).
- Local: frontend Vite (5173/8081), API on :8080, `.env` `VITE_API_URL=http://localhost:8080/api`.

## Status
- **Phase 1 — frontend rewire to the API: COMPLETE.** All 13 domains on `apiClient`/`publicApi`; build + server typecheck green; deployed.
- **Phase 2 — `org_id` multi‑tenancy: PENDING.** Chosen model = **shared DB + Postgres RLS** (admin‑provisioned orgs, single domain, one user→one org). Add `organizations` table + `org_id` on every business table & `profiles` (backfill default org → NOT NULL), per‑org sequences/uniqueness, API tenant resolution + `SET LOCAL app.current_org_id`, storage paths prefixed by org_id. "Tenant/org" = the consultancy firm (≠ the existing `clients` table = that firm's own customers).
- Integrations (Brevo/WATI/Google) use placeholder secrets → email/WhatsApp/Drive are inert until real secrets are set in Railway.

## Database Tables (15 core — all exist, do not recreate)
clients · intake_tokens · intake_submissions · rate_matrix · enquiries (auto ref `GG-YYYY-NNNN`; legacy rows keep `TIV-YYYY-NNNN`) · quotations (A/B/C/D, one approved at a time; number `GGQ-YYYY-NNNNN`, legacy `QTN-`) · communication_log · follow_ups · payments · mobilisation · job_completion · job_reminders · notifications · enquiry_events (audit log) · app_settings. (Plus `profiles`, `site_visits`, `mob_confirmation_tokens`.)

## Enquiry Status Machine
`new → pending → sent → follow_up → approved → confirmed → completed`; any active → `lost` (terminal). Extended states in use: `intake_pending`, `negotiation`, `payment_received`, `mobilization_scheduled`, `job_active`. Transitions validated server‑side.

## Key Business Rules
- Rate matrix: one active rate per `city + structure_type + soil_type`.
- Quotations: only ONE approved per enquiry at a time.
- Intake tokens: 32‑char URL‑safe, 7‑day expiry, single‑use.
- Ref numbers `GG-YYYY-NNNN` via Postgres trigger, per‑org sequence (legacy `TIV-` rows unchanged). Quotation number `GGQ-YYYY-NNNNN`, invoice `GG-INV-…`.
- Money: `NUMERIC(12,2)`, Indian formatting ₹1,23,456. Phones: E.164 `+91XXXXXXXXXX`.
- Job reminders: 3 rows (3/2/1‑day) per target date.

## Design System (CSS vars in globals.css)
`--navy #0F2A47` (sidebar/headers) · `--blue #1B5EA0` (primary) · `--steel #2E7FC1` · `--gold #D4930A` (CTA/approve) · `--green #15673A` (success) · `--red #B91C1C` (lost/error) · `--amber #92400E` (warnings) · `--surface #F8FAFC` · `--muted #64748B` · `--border #CBD5E1`.
Fonts: **Sora** (headings), **DM Sans** (body), **JetBrains Mono** (refs/codes).

## Supabase Storage Buckets
`quotation-pdfs` (private, `year/ref/ref-v1-A.pdf`) · `receipts` (private) · `reports` (private) · `site-visit-photos` (public) · `intake-uploads`. Frontend accesses all via the API's signed‑URL endpoints.

## File Structure
```
src/
  pages/        Login, Intake, Dashboard, Enquiries, EnquiryDetail, Clients, ClientDetail,
                RateMatrix/QuotationConfig, SettingsPage, Mobilisation, FollowUps, Accounts,
                SiteVisitForm, ConfirmMobilization, ResetPassword, NotFound
  components/    enquiry/* (tabs+sections), settings/*, UI components, QuotationPDF, InvoicePDF
  lib/          apiClient, storage, notifications, intakeTokenUtils, followUpCadence, utils
  hooks/        useAuth, useRole, useSettings
  integrations/supabase/  client (auth), publicClient, types
server/         custom REST API (see Backend layout)
```
