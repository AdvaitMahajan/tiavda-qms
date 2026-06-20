# QMS API (Railway backend)

Custom REST API that replaces direct Supabase access and the Supabase Edge
Functions for the QMS app. Supabase remains the **Postgres database** (plus
Storage and Auth as identity/file services); all data access and business logic
now flow through this service.

```
React SPA  ──fetch()──►  THIS API (Railway)  ──►  Supabase Postgres (DATABASE_URL)
                              │                     Supabase Storage  (service role)
                              └── verifies Supabase JWT on every request
```

## Why this exists
- One enforced trust boundary: every request's JWT is verified here; tenant/role
  rules live in code (and stay ready for `org_id` multi-tenancy).
- No more browser-to-Postgres via RLS — the SPA only talks to this API.
- A real home for cron jobs, billing webhooks, and the email/WhatsApp/Drive
  integrations.

## Tech
Node 20 · TypeScript · Express · Drizzle ORM (`pg`) · `jose` (JWT) · Zod ·
Helmet/CORS/rate-limit · Pino.

## Project layout
```
src/
  env.ts                 validated environment (fails fast on misconfig)
  index.ts               bootstrap + graceful shutdown
  app.ts                 express app: security middleware, router, error handler
  auth/jwt.ts            Supabase JWT verification (JWKS asym + HS256 legacy)
  db/
    schema.ts            full Drizzle schema mirroring the live DB (snake_case)
    index.ts             pg pool + drizzle instance
  lib/
    env, logger, errors, http (asyncHandler, getParam), supabase (service client)
  middleware/
    auth.ts              authenticate -> req.auth { userId, role, orgId, ... }
    roles.ts             requireEditor / requireNotViewer / requireSuperAdmin
    error.ts             central error + 404 handlers
  routes/
    index.ts             mounts /api/* domain routers
    health.ts            /api/health (live) + /api/health/ready (db)
  modules/
    clients/             reference module: schema (zod) + repo (drizzle) + routes
```

## Module pattern (how to add a domain)
Each domain is three files under `src/modules/<name>/`:
1. **`*.schema.ts`** — Zod schemas for body/query validation (snake_case to match DB).
2. **`*.repo.ts`** — Drizzle queries only; no auth logic. This is where `org_id`
   scoping is added later.
3. **`*.routes.ts`** — Express router: `authenticate` + role guards + validation,
   delegates to the repo.

Then mount it in `src/routes/index.ts`. See `modules/clients` for the template.

## Auth & roles
- The SPA continues to log in via Supabase Auth and sends the access token as
  `Authorization: Bearer <token>`.
- `authenticate` verifies the token (signature, issuer, `authenticated` audience,
  expiry) and attaches `req.auth`.
- Role guards mirror the old RLS helpers exactly:
  - `requireNotViewer` == `is_not_viewer()` (enquiries, clients, follow-ups, …)
  - `requireEditor` == `is_editor()` (quotations, payments, rate_matrix, settings)
  - `requireSuperAdmin` (team/super-admin actions)

## Response parity
Drizzle properties are named in **snake_case** to match DB columns, so responses
are shape-identical to what the frontend already received from Supabase
(snake_case keys, JSONB untouched, timestamps serialized to ISO). No field
renaming is required in the frontend when it switches to this API.

## Local development
```bash
cd server
cp .env.example .env          # fill in DATABASE_URL + SUPABASE_* values
npm install
npm run dev                   # tsx watch on http://localhost:8080
```
Smoke test:
```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/health/ready          # checks DB connectivity
curl http://localhost:8080/api/clients               # 401 (no token) — expected
curl -H "Authorization: Bearer <supabase-access-token>" http://localhost:8080/api/clients
```

## Environment
See `.env.example`. Key values:
- `DATABASE_URL` — Supabase **session pooler** URI (Dashboard → Settings →
  Database → Connection string).
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — for JWT
  verification, Storage, and auth-admin ops.
- `SUPABASE_JWT_SECRET` — only if the project still issues HS256 tokens.
- `CORS_ORIGINS` — the deployed frontend origin(s).
- `CRON_SECRET` — required header for `/api/cron/*` once cron is ported.

## Deploy to Railway
1. Push this repo to GitHub.
2. Railway → New Project → Deploy from GitHub repo.
3. Set the service **Root Directory** to `server/` (this folder has its own
   `package.json` and `Dockerfile`).
4. Railway auto-detects the `Dockerfile`. (Without it, Nixpacks runs
   `npm install && npm run build && npm start`.)
5. Add the environment variables from `.env.example` (Railway → Variables).
6. Set the health check path to `/api/health/ready`.
7. Deploy. Note the public URL and set it as the API base in the frontend.

## Build
```bash
npm run build      # tsc -> dist/
npm start          # node dist/index.js
npm run typecheck  # tsc --noEmit
```

## API surface (all implemented)
All under `/api`. Authenticated routes require `Authorization: Bearer <token>`;
`/api/public/*` are token-gated (no JWT); `/api/cron/*` require `X-Cron-Secret`.

| Area | Routes |
|---|---|
| health | `GET /health`, `GET /health/ready` |
| clients | `GET /clients`, `GET /clients/:id`, `POST /clients`, `PATCH /clients/:id`, `DELETE /clients/:id`, `POST /clients/:id/flag-channel` |
| profiles | `GET /profiles`, `GET /profiles/:id`, `PATCH /profiles/:id` |
| enquiries | `GET /enquiries`, `GET /enquiries/:id`, `POST /enquiries`, `PATCH /enquiries/:id`, `GET/POST /enquiries/:id/events` |
| quotations | `GET /quotations?enquiry_id`, `GET /quotations/:id`, `POST /quotations`, `PATCH /quotations/:id`, `POST /quotations/supersede`, `POST /quotations/:id/approve` |
| payments | `GET /payments?enquiry_id`, `POST /payments`, `PATCH /payments/:id` |
| follow-ups | `GET /follow-ups`, `POST /follow-ups`, `PATCH /follow-ups/:id`, `DELETE /follow-ups/:id` |
| job-completion | `GET/POST /job-completion`, `PATCH /job-completion/:id`, `GET/POST/DELETE /job-completion/reminders` |
| communications | `GET /communications?enquiry_id`, `POST /communications` |
| mobilisation | `GET /mobilisation`, `POST /mobilisation`, `PATCH /mobilisation/:id`, `GET/POST /mobilisation/:id/confirmation-token` |
| site-visits | `GET /site-visits?enquiry_id`, `POST /site-visits`, `PATCH /site-visits/:id` |
| rate-matrix | `GET/POST /rate-matrix`, `PATCH/DELETE /rate-matrix/:id` |
| settings | `GET /settings`, `PATCH /settings` |
| notifications | `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/read-all`, `PATCH /notifications/:id/read`, `POST /notifications` |
| dashboard | `GET /dashboard/stats`, `/pipeline`, `/actions`, `/reminders`, `/activity` |
| accounts | `GET /accounts/payments` |
| integrations | `POST /integrations/email`, `/whatsapp`, `/drive-folder` |
| storage | `POST /storage/sign-upload`, `POST /storage/sign-url`, `GET /storage/public-url` |
| team | `GET /team`, `POST /team/users`, `POST /team/users/:id/reset-password` |
| cron | `POST /cron/daily`, `POST /cron/weekly` (header `X-Cron-Secret`) |
| public | `GET /public/intake/validate`, `POST /public/intake/submit`, `/intake/attach-files`, `/intake/sign-upload`; `GET /public/site-visit`, `POST /public/site-visit/submit`, `/site-visit/sign-upload`; `GET /public/mob-confirmation`, `POST /public/mob-confirmation/confirm`, `/propose-alternate` |

## Status
- ✅ **Backend complete** — all domains, the 8 RPCs (proxied), the 6 edge functions
  (email/WhatsApp/Drive/daily-cron/weekly-summary/invite-user), storage, and
  auth-admin are implemented. `npm run typecheck` and `npm run build` pass.
- Realtime replaced by polling endpoints (notifications unread-count, dashboard,
  mobilisation confirmation-token).
- ⏭️ Next (separate task): point the React app at this API, then add the
  `org_id` multi-tenancy layer.

## Notes on faithful behavior
- Built against the **real DB schema**, correcting pre-existing frontend drift
  (`contact_person` not `contact_person_name`; `enquiry_events.event_type` not `type`).
- Trigger-generated columns (`ref_number`, `quotation_number`, site-visit `token`)
  are left to the DB triggers. Status transitions are validated by the DB trigger
  and surfaced as clean 400s.
