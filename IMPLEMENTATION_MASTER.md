# IMPLEMENTATION_MASTER.md — QMS

> **Single source of truth.** Updated after every feature implementation.
> Last updated: 2026-05-08

---

## 1. Project Overview

**Project:** QMS — Quotation Management System
**Product:** Geotechnical QMS (Consultants, Pune/Bangalore)
**Builder:** Amarnath Pandey
**Purpose:** Replace manual WhatsApp/Excel/verbal workflow with a production-grade web platform covering the full enquiry lifecycle: Intake → Quotation → Follow-up → Confirmation → Payment → Mobilisation → Job Completion

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18.3.1 + TypeScript 5.8 + Vite + Tailwind CSS 3.4 + shadcn/ui (50+ Radix primitives) |
| Backend | Supabase (PostgreSQL + Edge Functions + Realtime + Storage) |
| Auth | Supabase Auth — Email OTP (8-digit code) |
| Server State | TanStack Query 5.83 |
| Client State | Zustand 5.0 (auth/UI only) |
| Forms | React Hook Form 7.72 + Zod 4.3.6 |
| PDF | @react-pdf/renderer 4.4.1 (browser-side) |
| Charts | Recharts 3.8.1 |
| Animations | Framer Motion 12.38 |
| Drag & Drop | @dnd-kit (core + sortable + utilities) |
| Toasts | Sonner 1.7.4 |
| Routing | React Router 6.30.1 |

### Supabase Config
- **URL:** `https://plastttfmuixaumzzbig.supabase.co`
- **Region:** ap-southeast-2 (Sydney)
- **15 tables** with RLS, triggers, indexes already deployed
- **3 storage buckets:** quotation-pdfs, receipts, reports
- **Edge Function secrets configured:** SENDGRID_API_KEY, WATI_API_TOKEN, WATI_BASE_URL, GOOGLE_SERVICE_ACCOUNT_B64, GOOGLE_DRIVE_ROOT_FOLDER_ID, ADMIN_EMAIL, ADMIN_WHATSAPP, APP_URL, COMPANY_STATE

---

## 2. Complete Feature List

### 2.1 Authentication & Authorization

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.1.1 | Email OTP Login (8-digit) | ✅ Built | `src/pages/Login.tsx` — gradient design, send OTP, verify OTP, redirect to /dashboard |
| 2.1.2 | Auth Context & Session Management | ✅ Built | `src/hooks/useAuth.tsx` — AuthProvider, user/session state, signOut |
| 2.1.3 | Protected Route Guard | ✅ Built | `src/components/ProtectedRoute.tsx` — redirects to /login if no user |
| 2.1.4 | RBAC — Role-Based Access Control | 🔴 NOT BUILT | Roles: super_admin, admin, mobilization_lead, viewer. Needs: users table, role assignment, role-checking middleware, conditional UI rendering |
| 2.1.5 | User Management Page | 🔴 NOT BUILT | CRUD for users, role assignment, invite flow |

### 2.2 Client Management

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.2.1 | Client List with Search | ✅ Built | `src/pages/Clients.tsx` — TanStack Query, search by name/phone/city |
| 2.2.2 | Add Client (slide-over) | ✅ Built | Name, phone (E.164), email, company, city, state, WhatsApp, notes. Validation: Indian mobile regex |
| 2.2.3 | Edit Client (slide-over) | ✅ Built | Same form, pre-populated |
| 2.2.4 | Client Detail Page | ✅ Built | `src/pages/ClientDetail.tsx` — info display, intake link generator, enquiry history table |
| 2.2.5 | Soft Delete Client | ✅ Built | `deleted_at` field in DB, filtered in queries |
| 2.2.6 | Client Source Tracking | ✅ Built | Source field added to client add form, stored in DB |
| 2.2.7 | Client Pincode Field | ✅ Built | Pincode field added to client add form, stored in DB |

### 2.3 Intake Form

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.3.1 | Token Generation from Client Detail | ✅ Built | 32-char crypto random, 7-day expiry, single-use |
| 2.3.2 | Public 3-Step Intake Form | ✅ Built | `src/pages/Intake.tsx` — token validation, step 1 (site), step 2 (structure/bores), step 3 (review+submit) |
| 2.3.3 | Submit via RPC `submit_intake_form()` | ✅ Built | Atomic: validates token → creates submission → creates enquiry → links client → sets token used |
| 2.3.4 | Intake Form Fields | ✅ Built | site_address, site_city, site_state, site_pincode, structure_type (4 types), num_bores (stepper), expected_depth_m, num_floors, basement_floors, soil_type_hint, remarks |
| 2.3.5 | Structure Type "Other" Option | ✅ Built | "Other" option with HelpCircle icon added to intake form |
| 2.3.6 | File Attachments on Intake | ✅ Built | Multi-file upload UI in step 3 (max 5 files, 10MB each), uploads to Supabase Storage, saves URLs to intake_submissions.attachments JSON |
| 2.3.7 | Intake Notification to Admin | ✅ Built | Sends email to admin_email via send-email edge function on intake submission |

### 2.4 Enquiry Management

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.4.1 | Enquiry List View (Table) | ✅ Built | `src/pages/Enquiries.tsx` — table with ref#, client, city, status, amount, follow-up date |
| 2.4.2 | Enquiry Kanban Board | ✅ Built | `src/components/EnquiryKanban.tsx` — @dnd-kit drag-drop, columns per status |
| 2.4.3 | List/Kanban Toggle | ✅ Built | Toggle button in Enquiries page header |
| 2.4.4 | Status Filter (multi-select) | ✅ Built | Popover with checkbox per status |
| 2.4.5 | Search Enquiries | ✅ Built | By ref#, client name, city |
| 2.4.6 | CSV Export | ✅ Built | Exports filtered enquiries |
| 2.4.7 | Realtime Subscription | ✅ Built | Supabase realtime channel for enquiry updates |
| 2.4.8 | Enquiry Detail Page | ✅ Built | `src/pages/EnquiryDetail.tsx` — left panel (info + actions), right panel (tabs) |
| 2.4.9 | Manual Enquiry Creation | ✅ Built | Sheet form in Enquiries page (A7) — client select, site address, city, structure, bores, depth, soil, remarks |
| 2.4.10 | Enquiry Status Machine | ✅ Built | new → pending → sent → follow_up → approved → confirmed → completed + lost terminal |
| 2.4.11 | Mark as Lost | ✅ Built | Button + dialog with reason textarea in EnquiryDetail (A8) — sets lost_date, lost_reason, logs event |
| 2.4.12 | Activity Timeline | ✅ Built | `ActivityTimeline` component in enquiry detail (A10) — vertical timeline with icons per event type |
| 2.4.13 | Assigned To | 🟡 PARTIAL | `assigned_to` column exists in DB but no UI to assign team members |

### 2.5 Quotation Engine

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.5.1 | Rate Matrix Lookup | ✅ Built | Looks up by city + structure_type, active rate with no effective_to |
| 2.5.2 | 4-Variant Generation (A/B/C/D) | ✅ Built | Standard, Conservative (+15% depth), Extended (+2 bores, +15% depth), Minimal (-1 bore) |
| 2.5.3 | Line Items Calculation | ✅ Built | Mobilisation (per bore), Drilling-Soil (70%), Drilling-Rock (30%), Reporting (per bore), GST 18% |
| 2.5.4 | Version Incrementing | ✅ Built | Tracks version number, supersedes previous drafts |
| 2.5.5 | Approve Variant (unique constraint) | ✅ Built | Only one approved per enquiry, others superseded, triggers event log |
| 2.5.6 | PDF Generation (browser-side) | ✅ Built | `@react-pdf/renderer`, branded template in `src/components/QuotationPDF.tsx` |
| 2.5.7 | PDF Upload to Supabase Storage | ✅ Built | Path: `year/ref_number/ref-vN-variant.pdf` in quotation-pdfs bucket |
| 2.5.8 | Download PDF | ✅ Built | Downloads from storage via signed URL |
| 2.5.9 | Send to Client (Email + WhatsApp) | ✅ Built | Modal with channel checkboxes, invokes edge functions, logs to communication_log |
| 2.5.10 | Auto Follow-up After Send | ✅ Built | Reads app_settings for auto_followup_after_quote + auto_followup_days, creates follow_up row |
| 2.5.11 | GST Type (CGST+SGST vs IGST) | ✅ Built | Compares company_state (app_settings) vs rate.state (A5) — sets cgst_sgst or igst |
| 2.5.12 | Quotation Validity Period | ✅ Built | Configurable via `quotation_validity_days` app_setting, used in PDF + email + WhatsApp |
| 2.5.13 | Minimum Charge Enforcement | ✅ Built | Enforced in quotation generation (A6) — floors subtotal to minimum_charge if set |
| 2.5.14 | Travel Cost Calculation | ✅ Built | Uses `rate_travel_per_km` × 50km default; editable via D4 |
| 2.5.15 | Editable Line Items | ✅ Built | Inline edit mode on draft quotations — add/remove/edit rows, auto-recalculates totals |
| 2.5.16 | Quotation Notes/Terms | ✅ Built | `variant_notes` editable alongside line items in edit mode |

### 2.6 Rate Matrix

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.6.1 | Rate Matrix CRUD | ✅ Built | `src/pages/RateMatrix.tsx` — add, edit, deactivate rates |
| 2.6.2 | City Grouping | ✅ Built | Grouped display by city |
| 2.6.3 | Coverage Warning Banner | ✅ Built | Shows missing city/structure combinations |
| 2.6.4 | Unique Constraint (city+structure+soil) | ✅ Built | One active rate per combo |
| 2.6.5 | Effective Date Range | ✅ Built | effective_from, effective_to with is_active toggle |
| 2.6.6 | Rate History | ✅ Built | Collapsible "History" section in Rate Matrix page showing deactivated rates per city with end dates, muted styling |

### 2.7 Follow-ups

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.7.1 | Follow-up List in Enquiry Detail | ✅ Built | `src/components/enquiry/FollowUpsTab.tsx` — sorted by date, overdue highlighting |
| 2.7.2 | Add Follow-up (modal) | ✅ Built | Date, time, notes |
| 2.7.3 | Mark Complete with Outcome | ✅ Built | Outcome: reached/no_response/callback_requested/closed + notes |
| 2.7.4 | Schedule Next on Complete | ✅ Built | Toggle + date picker in complete modal |
| 2.7.5 | Auto-Reschedule on No Response | ✅ Built | Reads app_settings for auto_followup_no_response + days |
| 2.7.6 | Update enquiry.next_follow_up | ✅ Built | Synced after add/complete/reschedule |
| 2.7.7 | Enquiry Event Log on Complete | ✅ Built | Inserts follow_up_completed event |
| 2.7.8 | Follow-up Reminder Notifications | ✅ Built | daily-cron edge function queries pending follow-ups ≤ today, creates in-app notifications, emails admin |
| 2.7.9 | Global Follow-ups View (Today's) | ✅ Built | `/follow-ups` page with overdue/today/upcoming/completed tabs, sidebar nav link |

### 2.8 Payments

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.8.1 | Payment List in Enquiry Detail | ✅ Built | `src/components/enquiry/PaymentsTab.tsx` — cards with status, amounts, dates |
| 2.8.2 | Request Advance Payment | ✅ Built | Sheet with amount, due date, instructions; sends email + WhatsApp; logs to communication_log |
| 2.8.3 | Mark Payment Received | ✅ Built | Amount, method (NEFT/UPI/Cheque/Cash/Online), transaction ref, date, receipt upload |
| 2.8.4 | Receipt Upload to Storage | ✅ Built | Uploads to `receipts` bucket |
| 2.8.5 | Bank Details in Payment Request | ✅ Built | Fixed in A4 — reads individual bank_* keys and formats them correctly |
| 2.8.6 | Payment Status Transitions | ✅ Built | pending_request → request_sent → received/partial/refunded |
| 2.8.7 | Auto Payment Reminder | ✅ Built | daily-cron checks payments overdue >3 days, sends client email+WhatsApp, logs to communication_log (respects auto_payment_reminder setting) |
| 2.8.8 | Status Transition to Confirmed | ✅ Built | PaymentsTab auto-transitions to confirmed on receive (A9) — sets confirmed_date, logs event |

### 2.9 Communications

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.9.1 | Communication Log Display | ✅ Built | `src/components/enquiry/CommunicationTab.tsx` — channel icon, direction, status, relative time |
| 2.9.2 | Compose Message | ✅ Built | Modal sends email/WhatsApp via edge functions and logs to communication_log |
| 2.9.3 | Auto-Logging from Send Quotation | ✅ Built | Email/WhatsApp sends from EnquiryDetail are logged to communication_log |
| 2.9.4 | Auto-Logging from Payment Request | ✅ Built | Same as above |
| 2.9.5 | Actual Email Sending via Compose | ✅ Built | Compose invokes send-email edge function, updates status accordingly |
| 2.9.6 | Actual WhatsApp Sending via Compose | ✅ Built | Compose invokes send-whatsapp edge function, detects invalid numbers |
| 2.9.7 | Inbound Message Tracking | 🔴 NOT BUILT | No webhook or mechanism to track inbound client responses |

### 2.10 Job Completion

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.10.1 | 3-Stage Tracker (Site/Report/Bill) | ✅ Built | `src/components/enquiry/JobCompletionTab.tsx` — target dates, mark done, actual dates, notes |
| 2.10.2 | Progress Bar (visual) | ✅ Built | Step indicators with done/pending styling |
| 2.10.3 | Job Reminders (3/2/1 day) | ✅ Built | Creates reminder rows when target date set, deletes old unsent ones |
| 2.10.4 | Report Upload | ✅ Built | File upload to `reports` bucket |
| 2.10.5 | Final Bill Amount | ✅ Built | Number input, stored in job_completion |
| 2.10.6 | Auto-Complete Enquiry | ✅ Built | When all 3 stages done → enquiry status = completed |
| 2.10.7 | Reminder Notification Sending | ✅ Built | daily-cron queries job_reminders where scheduled_for = today, creates in-app notifications, emails admin, marks sent |

### 2.11 Mobilisation

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.11.1 | Schedule Mobilisation Form | ✅ Built | `src/components/enquiry/MobilisationSection.tsx` — date, time, team, equipment, site contact |
| 2.11.2 | Google Drive Folder Creation | ✅ Built | Invokes `create-drive-folder` edge function, realtime subscription for status updates |
| 2.11.3 | Drive Folder Status Display | ✅ Built | pending/created/failed with appropriate icons |
| 2.11.4 | Mobilisation Confirmation to Client | ✅ Built | Sends email + WhatsApp to client on mobilisation save, logs to communication_log |
| 2.11.5 | Site Visit Module | 🔴 NOT BUILT | Docs mention a site visit stage before quotation — not in current codebase at all |

### 2.12 Dashboard

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.12.1 | Stat Cards (5 metrics) | ✅ Built | Animated counters, correct queries: new enquiries, quotes sent, follow-ups today, payments pending, active jobs |
| 2.12.2 | Pipeline Strip | ✅ Built | 8 status pills with counts, clickable to /enquiries |
| 2.12.3 | Revenue Chart (Bar) | ✅ Built | 6-month Recharts BarChart from confirmed enquiries + approved quotation totals |
| 2.12.4 | Today's Actions List | ✅ Built | Shows overdue + today follow-ups with client name, ref, city, date |
| 2.12.5 | Recent Activity Feed | ✅ Built | Last 15 events with realtime INSERT subscription, animated list |
| 2.12.6 | Quick Actions | ✅ Built | 4 gradient buttons: New Enquiry, Clients, Rate Matrix, Settings |

### 2.13 Settings

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.13.1 | Company Information | ✅ Built | `src/pages/SettingsPage.tsx` — name, state, GST, address, admin email, admin WhatsApp |
| 2.13.2 | Bank Details | ✅ Built | Account name, bank name, account number, type, IFSC, branch, UPI + preview |
| 2.13.3 | Automation Rules | ✅ Built | 5 rules: auto follow-up after quote, reschedule on no response, payment reminder, job reminders, weekly summary |
| 2.13.4 | Account Section | ✅ Built | User avatar, email, role badge, sign out |
| 2.13.5 | Connections Section | ✅ Built | WhatsApp (Pending Approval) + Email (Connected) status display, test buttons (placeholder) |
| 2.13.6 | Test Email/WhatsApp | ✅ Built | Buttons invoke send-email and send-whatsapp edge functions with admin credentials |
| 2.13.7 | Quotation Template Manager | ✅ Built | Settings card with 4 editable terms + footer text, saved to app_settings, passed to QuotationPDF component with live preview |
| 2.13.8 | WhatsApp Template Manager | 🔴 NOT BUILT | No UI to view/manage WATI templates |

### 2.14 Notifications

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.14.1 | Notification Bell with Unread Count | ✅ Built | `src/components/TopBar.tsx` — badge with count, realtime subscription |
| 2.14.2 | Notification Dropdown | ✅ Built | Panel with list, type icons, mark all read, click to navigate |
| 2.14.3 | Realtime New Notification | ✅ Built | Bell bounce animation on INSERT |
| 2.14.4 | Follow-up Due Notifications | ✅ Built | daily-cron creates notification rows for pending follow-ups due today or overdue |
| 2.14.5 | Job Reminder Notifications | ✅ Built | daily-cron creates notification rows for job reminders scheduled for today |
| 2.14.6 | Intake Received Notification | ✅ Built | Admin email sent via send-email edge function on intake submit |
| 2.14.7 | Payment Received Notification | ✅ Built | In-app notification created on payment receive in PaymentsTab |

### 2.15 Edge Functions

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.15.1 | send-email (SendGrid) | ✅ Built | `supabase/functions/send-email/index.ts` — sends via SendGrid v3, supports PDF attachment via URL |
| 2.15.2 | send-whatsapp (WATI BSP) | ✅ Built | `supabase/functions/send-whatsapp/index.ts` — sends template messages, detects invalid numbers |
| 2.15.3 | create-drive-folder (Google Drive) | ✅ Built | `supabase/functions/create-drive-folder/index.ts` — JWT auth, creates year/project/subfolder structure, updates mobilisation row |
| 2.15.4 | Daily Cron: Follow-up Reminders | ✅ Built | `supabase/functions/daily-cron/index.ts` — queries pending follow-ups ≤ today, creates notifications, sends admin email, marks reminder_sent |
| 2.15.5 | Daily Cron: Job Reminders | ✅ Built | Same function — queries job_reminders where scheduled_for = today, creates notifications, sends admin email, marks sent |
| 2.15.6 | Daily Cron: Payment Reminders | ✅ Built | Same function — queries overdue payments (>3 days), sends client email+WhatsApp, logs to communication_log, respects auto_payment_reminder setting |
| 2.15.7 | Weekly Cron: Pipeline Summary | ✅ Built | `supabase/functions/weekly-summary/index.ts` — gathers new enquiries, quotations sent, revenue, pipeline snapshot, action items; sends branded email to admin |

### 2.16 UI/UX & Infrastructure

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.16.1 | App Layout (Sidebar + TopBar) | ✅ Built | Fixed sidebar, responsive (icon-only on tablet, hidden on mobile) |
| 2.16.2 | Bottom Tab Bar (Mobile) | ✅ Built | `src/components/BottomTabBar.tsx` |
| 2.16.3 | Loading Skeletons | ✅ Built | SkeletonLoader, SkeletonRow, SkeletonCard components |
| 2.16.4 | Empty States | ✅ Built | EmptyState component with icon + title + optional action |
| 2.16.5 | Status Badges | ✅ Built | StatusBadge component with color per status |
| 2.16.6 | Mobile Responsive Pass | ✅ Built | Settings 2-col→1-col stacking, Rate Matrix card grid min(), Enquiries table horizontal scroll, notification dropdown max-width, page padding responsive |
| 2.16.7 | Error Boundaries | ✅ Built | `ErrorBoundary` component wrapping App, styled fallback with refresh button |
| 2.16.8 | 404 Page | ✅ Built | `src/pages/NotFound.tsx` |

---

## 3. Database Schema

### 3.1 Existing Tables (15 — all deployed)

| Table | Key Fields | Status |
|-------|-----------|--------|
| `app_settings` | key (PK), value, updated_at | ✅ Complete |
| `clients` | id, name, phone, email, company, city, state, pincode, whatsapp_number, source, notes, email_bounced, whatsapp_invalid, deleted_at | ✅ Complete |
| `intake_tokens` | id, token (32-char), client_id, created_by, expires_at, used_at, status | ✅ Complete |
| `intake_submissions` | id, token_id, client_id, site_address, site_city, site_state, site_pincode, structure_type, num_bores, expected_depth_m, num_floors, basement_floors, soil_type_hint, remarks, attachments, ip_address, user_agent | ✅ Complete |
| `enquiries` | id, ref_number (auto TIV-YYYY-NNNN), client_id, submission_id, site_address, site_city, structure_type, num_bores, expected_depth_m, soil_type_hint, status (enum), assigned_to, next_follow_up, confirmed_date, lost_date, lost_reason, remarks, deleted_at | ✅ Complete |
| `quotations` | id, enquiry_id, variant (A/B/C/D), variant_label, version, num_bores, depth_per_bore_m, soil_type, mobilisation_cost, drilling_cost, reporting_cost, travel_cost, subtotal, gst_rate, gst_type, gst_amount, total_amount, line_items (JSON), rate_matrix_id, status (enum), pdf_url, pdf_status, approved_at, approved_by, sent_at, variant_notes | ✅ Complete |
| `communication_log` | id, enquiry_id, client_id, channel (enum), direction (enum), subject, body, status, sent_by, template_id, external_msg_id, attachments, error_detail | ✅ Complete |
| `follow_ups` | id, enquiry_id, scheduled_date, scheduled_time, notes, outcome (enum), outcome_notes, completed_at, completed_by, auto_scheduled, assigned_to, reminder_sent | ✅ Complete |
| `payments` | id, enquiry_id, quotation_id, payment_type, amount_requested, amount_received, status (enum), payment_method, transaction_ref, receipt_url, request_sent_at, received_at, notes | ✅ Complete |
| `mobilisation` | id, enquiry_id, mobilisation_date, mobilisation_time, team_description, equipment_notes, site_contact_name, site_contact_phone, drive_folder_id, drive_folder_url, drive_folder_status, notification_sent, notification_sent_at, notes | ✅ Complete |
| `job_completion` | id, enquiry_id, mobilisation_id, site_completion_date, site_done, site_completed_actual, site_completion_notes, report_delivery_date, report_done, report_delivered_actual, report_delivery_notes, report_file_url, final_bill_date, final_bill_done, final_bill_raised_actual, final_bill_notes, final_bill_amount, final_bill_url | ✅ Complete |
| `job_reminders` | id, job_id, enquiry_id, reminder_type, days_before, scheduled_for, target_date, sent, sent_at, channels | ✅ Complete |
| `notifications` | id, user_id, type, title, body, link, enquiry_id, read | ✅ Complete |
| `enquiry_events` | id, enquiry_id, event_type, from_status, to_status, triggered_by, metadata | ✅ Complete |
| `rate_matrix` | id, city, state, structure_type (enum), soil_type (enum), rate_per_bore, rate_per_metre_soil, rate_per_metre_rock, rate_reporting, rate_travel_per_km, minimum_charge, effective_from, effective_to, is_active, created_by | ✅ Complete |

### 3.2 Enums (all deployed)

| Enum | Values |
|------|--------|
| `lead_status` | new, pending, sent, follow_up, approved, confirmed, lost, completed |
| `quotation_status` | draft, approved, sent, accepted, rejected, superseded |
| `payment_status` | pending_request, request_sent, received, partial, refunded |
| `followup_outcome` | pending, reached, no_response, callback_requested, closed |
| `comm_channel` | email, whatsapp, in_app |
| `comm_direction` | outbound, inbound |
| `soil_type` | soil, rock, mixed |
| `structure_type` | residential, commercial, industrial, infrastructure, other |

### 3.3 RPC Functions

| Function | Status | Purpose |
|----------|--------|---------|
| `submit_intake_form()` | ✅ Deployed | Atomic intake submission: validate token → create submission → create enquiry → link client → mark token used |

### 3.4 Schema Changes Needed

| Change | Reason | Priority |
|--------|--------|----------|
| Add `users` table (or use Supabase auth.users + profiles table) | RBAC support | P2 |
| ~~Add `quotation_validity_days` to app_settings~~ | ~~Configurable validity~~ | ✅ Done |
| Consider `site_visits` table | Site visit module if required | P3 |

---

## 4. API Routes (Supabase Edge Functions)

### 4.1 Edge Functions (All Built)

| Function | Method | Purpose | Status |
|----------|--------|---------|--------|
| `send-email` | POST | SendGrid v3 API — send transactional email with optional PDF attachment | ✅ Built |
| `send-whatsapp` | POST | WATI BSP API — send template WhatsApp message | ✅ Built |
| `create-drive-folder` | POST | Google Drive API — create project folder structure `Client / Ref / {Photos, Reports, Correspondence}` | ✅ Built |
| `daily-cron` | GET (scheduled) | Process follow-up reminders, job reminders, payment reminders — create notifications + send via email/WhatsApp | ✅ Built |
| `weekly-summary` | GET (scheduled) | Generate and send weekly pipeline summary email | ✅ Built |

### 4.2 Edge Function Specs

**send-email:**
```
Body: { to: string, subject: string, html_body: string, attachment_path?: string }
- If attachment_path provided, download from Supabase Storage, attach as base64
- Use SENDGRID_API_KEY secret
- Return: { success: boolean, message_id?: string, error?: string }
```

**send-whatsapp:**
```
Body: { phone_number: string, template_name: string, parameters: { name: string, value: string }[] }
- Use WATI_API_TOKEN + WATI_BASE_URL secrets
- Return: { success: boolean, message_id?: string, error?: string, whatsapp_invalid?: boolean }
```

**create-drive-folder:**
```
Body: { enquiry_id: string, ref_number: string, client_name: string, city: string }
- Use GOOGLE_SERVICE_ACCOUNT_B64 + GOOGLE_DRIVE_ROOT_FOLDER_ID secrets
- Create: Root / "Client - City" / "Ref" / {Photos, Reports, Correspondence}
- Update mobilisation row: drive_folder_id, drive_folder_url, drive_folder_status
- Return: { folder_id: string, folder_url: string }
```

**daily-cron:**
```
Trigger: Scheduled (pg_cron or external), no body required
- Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS
- 1. Follow-ups: queries pending where scheduled_date ≤ today, creates notifications, emails admin, marks reminder_sent
- 2. Job reminders: queries where scheduled_for = today and sent = false, creates notifications, emails admin, marks sent
- 3. Payment reminders: queries request_sent > 3 days ago, emails+WhatsApps client, logs to communication_log (if auto_payment_reminder = true)
- 4. Auto-expire: marks new/pending enquiries with no activity for 60 days as lost
- Return: { success: boolean, follow_ups: {}, job_reminders: {}, payments: {}, auto_expired: {} }
```

**weekly-summary:**
```
Trigger: Scheduled (weekly), no body required
- Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS
- Gathers: new enquiries, quotations sent, revenue collected, pipeline by status, overdue follow-ups, pending payments
- Sends branded HTML email to admin_email
- Return: { success: boolean, email_sent: boolean, stats: {} }
```

---

## 5. Integration Points

| Integration | Service | Credentials | Status |
|-------------|---------|-------------|--------|
| Email | SendGrid v3 | SENDGRID_API_KEY | ✅ Secret set, edge function BUILT |
| WhatsApp | WATI BSP | WATI_API_TOKEN, WATI_BASE_URL | ✅ Secret set, edge function BUILT |
| Google Drive | Google Cloud Service Account | GOOGLE_SERVICE_ACCOUNT_B64, GOOGLE_DRIVE_ROOT_FOLDER_ID | ✅ Secret set, edge function BUILT |
| Auth | Supabase Auth (Email OTP) | Built into Supabase | ✅ Working |
| Storage | Supabase Storage (3 buckets) | Built into Supabase | ✅ Working |
| Realtime | Supabase Realtime | Built into Supabase | ✅ Working (mobilisation, notifications) |

---

## 6. Implementation Order

### Phase A: Critical Path — Core Workflow Completion (P1)

| Order | Feature | Ref | Depends On | Effort |
|-------|---------|-----|------------|--------|
| A1 | ~~Edge Function: send-email~~ | 2.15.1 | None | ✅ Already built |
| A2 | ~~Edge Function: send-whatsapp~~ | 2.15.2 | None | ✅ Already built |
| A3 | ~~Edge Function: create-drive-folder~~ | 2.15.3 | None | ✅ Already built |
| A4 | ~~Fix bank details key mismatch in PaymentsTab~~ | 2.8.5 | None | ✅ Done |
| A5 | ~~GST type auto-detection (CGST+SGST vs IGST)~~ | 2.5.11 | None | ✅ Done |
| A6 | ~~Minimum charge enforcement in quotation generation~~ | 2.5.13 | None | ✅ Done |
| A7 | ~~Manual enquiry creation form~~ | 2.4.9 | None | ✅ Done |
| A8 | ~~Mark enquiry as Lost (UI + status transition)~~ | 2.4.11 | None | ✅ Done |
| A9 | ~~Payment received → enquiry status confirmed~~ | 2.8.8 | None | ✅ Done |
| A10 | ~~Activity timeline in enquiry detail~~ | 2.4.12 | None | ✅ Done |

### Phase B: Notifications & Automation (P1-P2)

| Order | Feature | Ref | Depends On | Effort |
|-------|---------|-----|------------|--------|
| B1 | ~~Daily cron edge function skeleton~~ | 2.15.4-6 | A1, A2 | ✅ Done |
| B2 | ~~Follow-up reminder notifications~~ | 2.7.8, 2.14.4 | B1 | ✅ Done |
| B3 | ~~Job reminder notifications~~ | 2.10.7, 2.14.5 | B1 | ✅ Done |
| B4 | ~~Intake received notification~~ | 2.3.7, 2.14.6 | A1 | ✅ Done |
| B5 | ~~Payment received notification~~ | 2.14.7 | None | ✅ Done |
| B6 | ~~Mobilisation confirmation to client~~ | 2.11.4 | A1, A2 | ✅ Done |
| B7 | ~~Payment reminder automation~~ | 2.8.7 | B1 | ✅ Done |
| B8 | ~~Compose actually sends (email/WhatsApp)~~ | 2.9.5, 2.9.6 | A1, A2 | ✅ Done |

### Phase C: Dashboard & Views (P2)

| Order | Feature | Ref | Depends On | Effort |
|-------|---------|-----|------------|--------|
| C1 | ~~Dashboard — Today's Actions~~ | 2.12.4 | None | ✅ Done |
| C2 | ~~Dashboard — Recent Activity Feed~~ | 2.12.5 | None | ✅ Done |
| C3 | ~~Dashboard — Quick Actions~~ | 2.12.6 | None | ✅ Done |
| C4 | ~~Dashboard — verify/connect stat card data~~ | 2.12.1-3 | None | ✅ Done |
| C5 | ~~Global follow-ups view (Today's)~~ | 2.7.9 | None | ✅ Done |

### Phase D: Polish & Extended Features (P2-P3)

| Order | Feature | Ref | Depends On | Effort |
|-------|---------|-----|------------|--------|
| D1 | ~~Client source field in form~~ | 2.2.6 | None | ✅ Done |
| D2 | ~~Client pincode field in form~~ | 2.2.7 | None | ✅ Done |
| D3 | ~~Intake "other" structure type~~ | 2.3.5 | None | ✅ Done |
| D4 | ~~Editable line items on quotation~~ | 2.5.15 | None | ✅ Done |
| D5 | ~~Quotation notes/terms editing~~ | 2.5.16 | None | ✅ Done |
| D6 | ~~Travel cost calculation~~ | 2.5.14 | None | ✅ Done |
| D7 | ~~Quotation validity configurable~~ | 2.5.12 | None | ✅ Done |
| D8 | Assign team member to enquiry | 2.4.13 | D10 (RBAC) | Medium |
| D9 | ~~Settings: test email/WhatsApp buttons~~ | 2.13.6 | A1, A2 | ✅ Done |
| D10 | RBAC implementation | 2.1.4 | None | Large |
| D11 | User management page | 2.1.5 | D10 | Medium |
| D12 | ~~Rate matrix history view~~ | 2.6.6 | None | ✅ Done |
| D13 | ~~Mobile responsive pass~~ | 2.16.6 | All above | ✅ Done |
| D14 | ~~Error boundaries~~ | 2.16.7 | None | ✅ Done |
| D15 | ~~Weekly summary cron~~ | 2.15.7 | A1 | ✅ Done |

---

## 7. Progress Tracker

| Feature | Status | Date Completed | Notes |
|---------|--------|---------------|-------|
| Auth (OTP Login) | ✅ Done | Pre-existing | — |
| Client CRUD | ✅ Done | Pre-existing | — |
| Intake Form | ✅ Done | Pre-existing | — |
| Rate Matrix CRUD | ✅ Done | Pre-existing | — |
| Enquiry List + Kanban | ✅ Done | Pre-existing | — |
| Quotation Engine (4-variant) | ✅ Done | Pre-existing | — |
| PDF Generation + Upload | ✅ Done | Pre-existing | — |
| Send to Client | ✅ Done | Pre-existing | Depends on edge functions |
| Follow-ups Tab | ✅ Done | Pre-existing | — |
| Payments Tab | ✅ Done | Pre-existing | — |
| Communications Tab | ✅ Done | Pre-existing | Now sends via edge functions |
| Job Completion Tab | ✅ Done | Pre-existing | — |
| Mobilisation Section | ✅ Done | Pre-existing | — |
| Notification Bell + Dropdown | ✅ Done | Pre-existing | — |
| Settings Page | ✅ Done | Pre-existing | — |
| App Layout (Sidebar/TopBar/BottomTab) | ✅ Done | Pre-existing | — |
| A1-A3: Edge Functions | ✅ Done | Pre-existing | send-email, send-whatsapp, create-drive-folder |
| A4: Bank details key mismatch fix | ✅ Done | 2026-05-08 | PaymentsTab now reads individual bank_* keys |
| A5: GST auto-detection | ✅ Done | 2026-05-08 | Compares company_state vs rate.state |
| A6: Minimum charge enforcement | ✅ Done | 2026-05-08 | Enforced in quotation generation |
| A7: Manual enquiry creation | ✅ Done | 2026-05-08 | Sheet form in Enquiries page |
| A8: Mark as Lost | ✅ Done | 2026-05-08 | Button + dialog in EnquiryDetail |
| A9: Payment → confirmed transition | ✅ Done | 2026-05-08 | PaymentsTab auto-transitions on receive |
| A10: Activity timeline | ✅ Done | 2026-05-08 | New tab in EnquiryDetail |
| B4: Intake admin email notification | ✅ Done | 2026-05-08 | Replaced broken RPC with send-email edge function call |
| B5: Payment received in-app notification | ✅ Done | 2026-05-08 | Inserts into notifications table on payment receive |
| B6: Mobilisation confirmation to client | ✅ Done | 2026-05-08 | Sends email + WhatsApp with mob details, logs to comm_log |
| B8: CommunicationTab compose wired to edge functions | ✅ Done | 2026-05-08 | Email via send-email, WhatsApp via send-whatsapp, logs status |
| C1-C4: Dashboard verified + Quick Actions | ✅ Done | 2026-05-08 | Stats, pipeline, actions, reminders, revenue, activity all correct; quick actions added |
| C5: Global follow-ups page | ✅ Done | 2026-05-08 | /follow-ups with overdue/today/upcoming/completed tabs |
| D1: Client source field | ✅ Done | 2026-05-08 | Added to client add form |
| D2: Client pincode field | ✅ Done | 2026-05-08 | Added to client add form |
| D3: Intake "other" structure type | ✅ Done | 2026-05-08 | 5th option with HelpCircle icon |
| D4: Editable line items | ✅ Done | 2026-05-08 | Inline editor on draft variants, recalculates totals |
| D6: Travel cost calculation | ✅ Done | 2026-05-08 | rate_travel_per_km × 50km default |
| D7: Quotation validity configurable | ✅ Done | 2026-05-08 | app_setting quotation_validity_days, used in PDF/email/WhatsApp |
| D9: Test email/WhatsApp buttons | ✅ Done | 2026-05-08 | Wired to send-email and send-whatsapp edge functions |
| D14: Error boundary | ✅ Done | 2026-05-08 | ErrorBoundary wraps App |
| B1: Daily cron edge function | ✅ Done | 2026-05-08 | Follow-up reminders, job reminders, payment reminders, auto-expire stale enquiries |
| D15: Weekly summary cron | ✅ Done | 2026-05-08 | Pipeline summary email — new enquiries, quotations sent, revenue, action items |
| D5: Quotation template manager | ✅ Done | 2026-05-08 | Configurable terms (4) + footer text in Settings, used by QuotationPDF |
| D12: Rate matrix history view | ✅ Done | 2026-05-08 | Collapsible history section in RateMatrix showing deactivated rates |
| D13: Mobile responsive pass | ✅ Done | 2026-05-08 | Responsive grids, overflow scroll, min() widths across all pages |
| E1: Intake file attachments | ✅ Done | 2026-05-08 | Upload up to 5 files (10MB each) in intake step 3, stored in Supabase Storage |

---

## 8. Open Questions

| # | Question | Context | Decision |
|---|---------|---------|----------|
| Q1 | Should we add a site_visits table for pre-quotation site inspections? | Docs mention site_visit_pending status. Current codebase skips this stage. | **TBD** — Ask client if site visits are tracked in QMS or externally |
| Q2 | Should RBAC be implemented now or deferred? | Docs mention 4 roles. Current codebase has single-user auth. | **Defer to Phase D** — functional features first, RBAC is additive |
| Q3 | Template-based quotation line items vs current auto-generation? | Docs describe template manager. Current code auto-generates from rate matrix. | **Keep auto-generation** — it works well. Add editable line items (D4) for manual overrides |
| Q4 | Quotation variants (A/B/C/D) vs pure versioning (V1/V2/V3)? | Current: 4 variants per version. Docs describe versions only. | **Keep variants** — they're useful for comparison. Versions already increment on regenerate |
| Q5 | Where should Edge Functions be deployed from? | Supabase CLI vs Dashboard vs Cursor | **Supabase CLI** — `supabase functions deploy` from project root |
| Q6 | Should the weekly summary email be a cron edge function or a Supabase pg_cron? | Both are viable | **Supabase Cron** — use Supabase Dashboard to schedule a pg_cron that calls the edge function |
| Q7 | ~~Intake file attachments — are they needed?~~ | DB column exists, no UI. Client may want to upload site photos/documents. | **Resolved** — Built in E1: upload UI in intake step 3, files stored in Supabase Storage |
| Q8 | WhatsApp template approval status — is WATI BSP account set up and templates approved? | Templates referenced in code (qms_quotation_sent, qms_payment_request) | **TBD** — Need to verify with client's WATI account |

---

## 9. Change Log

| Date | Change | By |
|------|--------|----|
| 2026-05-08 | Initial IMPLEMENTATION_MASTER.md created — full codebase audit, feature inventory, implementation plan | Claude |
| 2026-05-08 | Phase A complete (A1-A10): edge functions, GST, min charge, manual enquiry, mark lost, payments, activity | Claude |
| 2026-05-08 | Phase B complete (B1-B8): daily-cron, follow-up/job/payment reminders, intake email, payment notification, mobilisation confirm, compose sends | Claude |
| 2026-05-08 | Phase C complete: dashboard verified, quick actions added, global follow-ups page created | Claude |
| 2026-05-08 | Phase D (D1-D7,D9,D12-D15): client fields, intake other, editable line items, travel cost, validity, test buttons, error boundary, template manager, rate history, mobile responsive, weekly cron — only D8/D10/D11 (RBAC) remain | Claude |
| 2026-05-08 | Intake file attachments (E1): drag-drop upload UI in step 3, stored in Supabase Storage | Claude |
| 2026-05-08 | IMPLEMENTATION_MASTER.md audit: fixed stale line counts, marked all completed phases consistently, updated section headers | Claude |

---

## 10. Codebase Audit

### 10.1 File Inventory

| Path | Purpose | Lines (approx) | Status |
|------|---------|----------------|--------|
| `src/App.tsx` | Route definitions, providers | 60 | ✅ Clean |
| `src/main.tsx` | React entry point | ~10 | ✅ Clean |
| `src/pages/Login.tsx` | OTP auth flow | ~200 | ✅ Complete |
| `src/pages/Dashboard.tsx` | Dashboard with stats, charts, actions, activity | ~650 | ✅ Complete — all sections live with correct queries |
| `src/pages/FollowUps.tsx` | Global follow-ups view | ~170 | ✅ Complete |
| `src/pages/Enquiries.tsx` | List + Kanban view + manual create | ~615 | ✅ Complete |
| `src/pages/EnquiryDetail.tsx` | Quotation engine, editable items, tabs | ~1100 | ✅ Complete — mark lost, activity, editable line items, travel cost, validity |
| `src/pages/Clients.tsx` | Client CRUD | ~410 | ✅ Complete — source + pincode fields added |
| `src/components/ErrorBoundary.tsx` | React error boundary | ~55 | ✅ Complete |
| `src/pages/ClientDetail.tsx` | Client detail + intake links | ~300 | ✅ Complete |
| `src/pages/RateMatrix.tsx` | Rate matrix CRUD + history | ~555 | ✅ Complete |
| `src/pages/Intake.tsx` | Public intake form + file attachments | ~770 | ✅ Complete |
| `src/pages/SettingsPage.tsx` | Settings page + quotation template | ~1130 | ✅ Complete |
| `src/pages/NotFound.tsx` | 404 page | ~30 | ✅ Complete |
| `src/components/AppLayout.tsx` | Layout shell | 25 | ✅ Complete |
| `src/components/AppSidebar.tsx` | Sidebar navigation | 142 | ✅ Complete |
| `src/components/TopBar.tsx` | Top bar + notification bell | ~445 | ✅ Complete |
| `src/components/BottomTabBar.tsx` | Mobile tab bar | ~60 | ✅ Complete |
| `src/components/NavLink.tsx` | Sidebar nav link component | ~28 | ✅ Complete |
| `src/components/ProtectedRoute.tsx` | Auth guard | 21 | ✅ Complete (needs RBAC extension) |
| `src/components/EnquiryKanban.tsx` | Kanban board | ~200 | ✅ Complete |
| `src/components/QuotationPDF.tsx` | PDF template (configurable terms/footer) | ~165 | ✅ Complete |
| `src/components/enquiry/FollowUpsTab.tsx` | Follow-ups tab | 307 | ✅ Complete |
| `src/components/enquiry/PaymentsTab.tsx` | Payments tab + notifications | 380 | ✅ Complete — bank keys fixed, payment notification added |
| `src/components/enquiry/CommunicationTab.tsx` | Comm log tab + send email/WhatsApp | 145 | ✅ Complete — compose sends via edge functions |
| `src/components/enquiry/JobCompletionTab.tsx` | Job completion tab | 252 | ✅ Complete |
| `src/components/enquiry/MobilisationSection.tsx` | Mobilisation section | 149 | ✅ Complete |
| `src/hooks/useAuth.tsx` | Auth context | 54 | ✅ Complete (needs RBAC) |
| `src/hooks/use-mobile.tsx` | Mobile detection hook | ~20 | ✅ Complete |
| `src/lib/utils.ts` | Utilities | 38 | ✅ Complete |
| `src/integrations/supabase/client.ts` | Supabase client init | ~10 | ✅ Complete |
| `src/integrations/supabase/types.ts` | Auto-generated DB types | ~1050 | ✅ Complete |
| `supabase/functions/send-email/index.ts` | SendGrid v3 email sender | 61 | ✅ Complete |
| `supabase/functions/send-whatsapp/index.ts` | WATI BSP WhatsApp sender | 56 | ✅ Complete |
| `supabase/functions/create-drive-folder/index.ts` | Google Drive folder creator | ~90 | ✅ Complete |
| `supabase/functions/daily-cron/index.ts` | Daily cron: follow-ups, job, payment reminders, auto-expire | ~240 | ✅ Complete |
| `supabase/functions/weekly-summary/index.ts` | Weekly pipeline summary email | ~140 | ✅ Complete |

### 10.2 Design System Compliance

| Aspect | Status | Notes |
|--------|--------|-------|
| Colors match CSS variables | ✅ | Navy #0F2A47, Blue #1565C0, Gold #D4930A, etc. |
| Font families (Sora/DM Sans/JetBrains Mono) | ✅ | Applied via Tailwind config |
| Indian currency formatting | ✅ | `formatCurrency()` uses `en-IN` locale |
| E.164 phone format | ✅ | Client form validates Indian mobile |
| Toast patterns (sonner) | ✅ | Success=green 3s, error=red |
| Loading skeletons | ✅ | Used across pages |
| Empty states | ✅ | Used in tabs |

### 10.3 Code Quality Notes

| Issue | Location | Severity | Fix Priority |
|-------|----------|----------|-------------|
| EnquiryDetail is 950+ lines in a single file | `src/pages/EnquiryDetail.tsx` | Low | P3 — refactor into sub-components |
| Direct Supabase calls instead of TanStack Query in EnquiryDetail | `src/pages/EnquiryDetail.tsx` | Medium | P2 — migrate to useQuery/useMutation for consistency |
| `as any` casts on enum values | Multiple files | Low | P3 — fix when TypeScript types are regenerated |
| PDF uses "Rs." instead of "₹" | `src/components/QuotationPDF.tsx` | Low | P3 — cosmetic |
| Hardcoded company name in email templates | `src/pages/EnquiryDetail.tsx` | Medium | P2 — should read from app_settings.company_name |
| Hardcoded phone "+91 8605811117" in email templates | `src/pages/EnquiryDetail.tsx` | Medium | P2 — should read from app_settings.admin_whatsapp |
| Receipt URL uses signed URL (expires in 30 days) | `src/components/enquiry/PaymentsTab.tsx` | Medium | P2 — store path, generate URL on demand |
| ~~No error boundary wrapping~~ | App-wide | ✅ Fixed | ErrorBoundary wraps App |

---

## End of Document

> **Next Step:** Begin Phase A implementation starting with Edge Functions (A1-A3), then workflow fixes (A4-A10).
