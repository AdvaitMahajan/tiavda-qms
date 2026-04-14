# Tiavda QMS — Project Brain

## What We Are Building
A Quotation Management System (QMS) for Tiavda Enterprises, a geotechnical consultancy firm. This replaces their entire manual workflow — WhatsApp-based enquiries, Excel quotations, verbal mobilisation — with a production-grade web platform.

## Business Context
- Client: Tiavda Enterprises (geotechnical consultants, Pune/Bangalore)
- Built by: Mindmap Digital
- Every enquiry goes: Intake → Quotation → Follow-up → Confirmation → Payment → Mobilisation → Job Completion

## Tech Stack
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Backend: Supabase (PostgreSQL + Edge Functions + Realtime + Storage)
- Auth: Supabase Auth (Email OTP — 8-digit code)
- PDF: @react-pdf/renderer (browser-side generation, upload to Supabase Storage)
- Animations: Framer Motion
- Drag & Drop: @dnd-kit
- Charts: Recharts
- Forms: React Hook Form + Zod
- State: TanStack Query (server state) + Zustand (auth/UI state)
- Toasts: Sonner

## Supabase Project
- URL: https://plastttfmuixaumzzbig.supabase.co
- Region: ap-southeast-2 (Sydney)
- All 15 tables already created with RLS, triggers, indexes

## Database Tables (all exist, do not recreate)
1. clients — client contact info
2. intake_tokens — shareable form links (32-char URL-safe token)
3. intake_submissions — submitted intake form data
4. rate_matrix — city/structure/soil-type based pricing
5. enquiries — central entity, one per business enquiry, auto ref TIV-YYYY-NNNN
6. quotations — 4 variants per enquiry (A/B/C/D), one approved at a time
7. communication_log — all emails and WhatsApp messages sent
8. follow_ups — scheduled follow-up tasks
9. payments — advance and final payment tracking
10. mobilisation — site visit scheduling
11. job_completion — tracks site completion, report delivery, final bill dates
12. job_reminders — 3-day/2-day/1-day reminders per job completion date
13. notifications — in-app notifications
14. enquiry_events — full audit log of all status changes
15. app_settings — key-value config store

## Enquiry Status Machine
new → pending → sent → follow_up → approved → confirmed → completed
Any active status → lost (terminal)
confirmed → completed (terminal)

## What Is Already Built and Working
1. Auth: Email OTP login, redirects to /dashboard on success
2. /intake: Public 3-step intake form, token validation, submits via RPC submit_intake_form()
3. /clients: Full CRUD, search, slide-over panel for add/edit
4. /clients/:id: Client detail, intake link generator, enquiry history
5. /rate-matrix: Full CRUD, city grouping, coverage warning banner
6. /enquiries/:id: Quotation engine (4-variant generator), approve flow, PDF generation+upload
7. EnquiryDetail: Activity timeline, follow-ups tab (partial)

## What Is NOT Yet Built (needs to be built)
1. /enquiries — list view + Kanban board (placeholder heading only)
2. /dashboard — stat cards, pipeline strip, action list, revenue chart, activity feed (placeholder)
3. /settings — app settings form (placeholder)
4. Follow-ups tab — full implementation in enquiry detail
5. Payments tab — advance request, mark received, receipt upload
6. Communication tab — email + WhatsApp log display
7. Job Completion tab — 3-date tracker with reminders
8. Mobilisation section — schedule form + Google Drive folder creation
9. Notification bell — realtime unread count + dropdown
10. Supabase Edge Functions — send-email, send-whatsapp, create-drive-folder
11. Mobile responsive pass
12. Empty states and loading skeletons

## Design System (CSS Variables in globals.css)
--navy: #0F2A47 (sidebar, headers)
--blue: #1B5EA0 (primary actions)
--steel: #2E7FC1 (secondary)
--gold: #D4930A (CTA buttons, approve)
--green: #15673A (success, confirmed)
--red: #B91C1C (lost, overdue, errors)
--amber: #92400E (warnings, follow-ups)
--surface: #F8FAFC (page background)
--muted: #64748B (secondary text)
--border: #CBD5E1 (all borders)
Fonts: Sora (headings), DM Sans (body), JetBrains Mono (ref numbers, codes)

## Key Business Rules
- Rate matrix: unique constraint on city+structure_type+soil_type (one active rate per combo)
- Quotations: only ONE approved quotation per enquiry at a time (unique index)
- Intake tokens: 32-char URL-safe crypto random, 7-day expiry, single-use
- Enquiry ref numbers: auto-generated TIV-YYYY-NNNN via Postgres trigger
- All monetary values: NUMERIC(12,2), display with Indian formatting ₹1,23,456
- Phone numbers: E.164 format +91XXXXXXXXXX
- Job reminders: 3 rows per date (3-day, 2-day, 1-day before target)
- Status transitions: server-side validated, client-side enforced in UI

## Supabase Storage Buckets
- quotation-pdfs (private) — PDF path: year/ref_number/ref-v1-A.pdf
- receipts (private) — payment receipt uploads
- reports (private) — job completion report uploads

## Supabase Edge Functions (to be built in Cursor)
- submit-intake — handles intake form submission atomically (already done via RPC)
- send-email — calls SendGrid API v3
- send-whatsapp — calls WATI BSP API
- create-drive-folder — creates Google Drive project folder structure

## Supabase Secrets (already set)
SENDGRID_API_KEY, WATI_API_TOKEN, WATI_BASE_URL, GOOGLE_SERVICE_ACCOUNT_B64,
GOOGLE_DRIVE_ROOT_FOLDER_ID, ADMIN_EMAIL, ADMIN_WHATSAPP, APP_URL, COMPANY_STATE

## Important Patterns
- Always use TanStack Query for data fetching (useQuery, useMutation)
- Always invalidate queries after mutations
- Use sonner toast for all feedback (success=green 3s, error=red manual dismiss)
- All forms use React Hook Form + Zod validation
- Supabase client: src/integrations/supabase/client.ts
- Never expose service_role key in frontend

## File Structure
src/
  pages/ — Login, Intake, Dashboard, Enquiries, EnquiryDetail, Clients, ClientDetail, RateMatrix, Settings, NotFound
  components/ — UI components, QuotationPDF.tsx
  integrations/supabase/ — client.ts, types.ts
  lib/ — utils.ts (formatCurrency, formatDate, relativeTime, cn)
  hooks/ — custom hooks
