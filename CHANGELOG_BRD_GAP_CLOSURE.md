# BRD Gap Closure — Implementation Changelog

**Date:** 2026-05-16
**Scope:** 20 gaps identified between the Global Geotechnics BRD and the QMS codebase, closed across 10 phases.

---

## Phase 0: Foundation — Status Machine + Schema Migrations

### Expanded Lead Status Enum (14 statuses)
`new → intake_pending → pending → sent → follow_up → negotiation → approved → payment_received → mobilization_scheduled → job_active → confirmed → lost → inactive → completed`

### Files Modified
- **`src/integrations/supabase/types.ts`** — Added expanded `lead_status` enum (14 values), new tables (`site_visits`, `mob_confirmation_tokens`), new columns on `clients` (`gst_number`), `enquiries` (`contact_person_name`, `contact_person_phone`, `google_maps_url`, `lead_source`, `lead_source_detail`, `site_latitude`, `site_longitude`), `quotations` (`quotation_number`), `mobilisation` (`admin_override`, `admin_override_at`, `admin_override_by`, `client_confirmed`, `client_confirmed_at`), `intake_submissions` (`demobilization_consent`, `height_of_basements`, `num_podiums`, `plot_fenced`, `site_access_types`, `water_quantity`). Made `site_address` optional in Insert type.
- **`src/pages/Enquiries.tsx`** — Updated `STATUS_COLORS`, `STATUS_LABELS`, `ALL_STATUSES` for 14 statuses.
- **`src/components/EnquiryKanban.tsx`** — Expanded `VALID_TRANSITIONS` state machine for all 14 statuses including reactivation paths (`lost → follow_up`, `inactive → follow_up`). Updated `statusMutation` with dialog modals for inactive/approved/reactivation flows.
- **`src/pages/Dashboard.tsx`** — Updated `LeadStatus`, `STATUS_LABELS`, `ALL_STATUSES`, `PIPELINE_PILL_CLASSES` for 14 statuses.
- **`src/pages/EnquiryDetail.tsx`** — Updated tab visibility flags (`showJobTabs`, `showMobilisation`, `showSiteVisitTab`) for new statuses.
- **`supabase/functions/daily-cron/index.ts`** — Changed auto-expire target from `lost` to `inactive`.

### SQL Migrations Required
1. Expand `lead_status` enum with: `intake_pending`, `negotiation`, `payment_received`, `mobilization_scheduled`, `job_active`, `inactive`
2. Create `site_visits` table, `mob_confirmation_tokens` table
3. Add new columns to `clients`, `enquiries`, `quotations`, `mobilisation`, `intake_submissions`
4. Create quotation number sequence + trigger (`TIV-QT-YYYY-NNNN`)
5. RLS policies for new tables

---

## Phase 1: Site Visit Module

### New Files
- **`src/components/enquiry/SiteVisitSection.tsx`** (~380 lines) — Full site visit management UI: list view with expandable cards, schedule dialog (date, geologist via `AssigneeDropdown`, notes), complete dialog (feasibility radio: feasible/conditional/not_feasible, site confirmation checkboxes, cost factor preset tags, observations textarea, recommendations). Feasibility warning banner when `not_feasible`. Status styles for scheduled/in_progress/completed/cancelled.

### Files Modified
- **`src/pages/EnquiryDetail.tsx`** — Added "Site Visits" tab (visible for all statuses except `job_active`, `completed`). Imported and rendered `SiteVisitSection`.

---

## Phase 2: Quotation Versioning + Unique Number

### Files Modified
- **`src/pages/EnquiryDetail.tsx`** — Grouped quotations by version. Added "Create Revision" button (visible when quotation status = `sent`). Creates V(N+1) pre-populated with V(N) data via `?fromVersion=<id>` URL param. VariantCard now shows version number and `quotation_number` badge.
- **`src/pages/QuotationBuilder.tsx`** — Accepts `?fromVersion=<id>` URL param to clone from existing quotation. Shows "Revision of V{N}" header label. Appends "(Revised)" to variant label when cloning.
- **`src/components/QuotationPDF.tsx`** — Displays `quotation_number` in PDF header. Shows "Variant: {label} (V{version})".
- **`src/components/ConsultancyPDF.tsx`** — Displays `quotation_number` in PDF header.

---

## Phase 3: Mobilization Confirmation

### New Files
- **`src/pages/ConfirmMobilization.tsx`** (~280 lines) — Public page at `/confirm-mobilization?t=<token>`. Token validation from `mob_confirmation_tokens`. Displays mob date, time, location, ref number. "Confirm" and "Propose Alternate Date" flows. Updates token status and mobilisation record. Success screen matching intake page style.

### Files Modified
- **`src/App.tsx`** — Added public route: `/confirm-mobilization` → `<ConfirmMobilization />`
- **`src/components/enquiry/MobilisationSection.tsx`** — Auto-generates 32-char confirmation token + inserts into `mob_confirmation_tokens` with 7-day expiry on mob save. Shows client confirmation status (pending/confirmed/alternate). Admin Override button to confirm on behalf of client. If alternate proposed: shows proposed date + notes.

---

## Phase 4: Auto-Send Intake + Follow-up Cadence

### New Files
- **`src/lib/intakeTokenUtils.ts`** (~90 lines) — `generateTokenString()`: 32-char URL-safe token. `createIntakeToken(clientId, createdBy)`: expires old tokens, creates new with 7-day expiry. `getIntakeUrl(token)`. `sendIntakeLink(clientId, token, refNumber)`: sends email + WhatsApp.
- **`src/lib/followUpCadence.ts`** (~50 lines) — `DEFAULT_CADENCE`: 5 steps (Day 1, 3, 5, 15 conditional, 30 conditional). `createFollowUpCadence(enquiryId)`: creates all 5 follow-up rows. `cleanupConditionalFollowUps(enquiryId)`: cancels Day 15/30 if still pending.

### Files Modified
- **`src/pages/Enquiries.tsx`** — After creating SI enquiry: auto-generates intake token via `createIntakeToken()`, sets status to `intake_pending`, sends link via `sendIntakeLink()`.
- **`src/pages/EnquiryDetail.tsx`** — Replaced single follow-up creation with 5-step cadence from `followUpCadence.ts` when sending quotation to client. Cadence creation gated by `auto_followup_after_quote` app setting.

---

## Phase 5: Lead Quick-Capture + Reactivation

### Files Modified
- **`src/pages/Enquiries.tsx`** — Added "Quick Capture" button with lightweight dialog: name, phone, source dropdown (`phone_call` / `whatsapp` / `missed_call` / `email` / `referral`), initial requirement, city (optional). Creates client + enquiry in one step with `lead_source` field.
- **`src/pages/EnquiryDetail.tsx`** — Added "Reactivate" button for `lost`/`inactive` enquiries. Transitions to `follow_up`, clears `lost_date`/`lost_reason`. Added `reactivating` state and `handleReactivate` handler.
- **`src/components/EnquiryKanban.tsx`** — Added `lost → follow_up` and `inactive → follow_up` transitions with confirmation dialog.

---

## Phase 6: Dashboard Enhancements

### Files Modified
- **`src/pages/Dashboard.tsx`** — Added 3 new stat cards: Conversion Rate (%), Pipeline Value (Indian Rupee), Order Book (count). Grid changed from 5-col to 4-col for 8 cards. `useStatCards` expanded with conversion rate calculation, pipeline value sum from approved quotations, order book count. Active Jobs query now checks `job_active` and `mobilization_scheduled`. Revenue chart includes `approved`/`payment_received`/`mobilization_scheduled`/`job_active`/`confirmed`/`completed`. Job reminders lookahead expanded from 3 to 7 days.

---

## Phase 7: Intake Form Enhancements

### Files Modified
- **`src/pages/Intake.tsx`** — Step 1: Added Google Maps URL input. Step 2: Added `height_of_basements`, `num_podiums` stepper, `plot_fenced` toggle (yes/no/partial). Step 3: Changed site_access to multi-select checkboxes with `SITE_ACCESS_OPTIONS` array; added `water_quantity` dropdown with `WATER_QUANTITY_OPTIONS`. Step 4: Added demobilization consent legal checkbox (required, blocks submit). Submit handler sends all new fields in `extendedData`.
- **`src/pages/ClientDetail.tsx`** — Added `gst_number` to edit form state, update payload, and UI with uppercase transformation and GST format placeholder.
- **`src/pages/Clients.tsx`** — GST Number field support in client list/detail views.

---

## Phase 8: Consultancy Relaxed Entry + Contact Person

### Files Modified
- **`src/pages/Enquiries.tsx`** — Validation now only requires city (not `site_address`) for consultancy service type. `site_address` passes as `null` when empty for consultancy enquiries.
- **`src/pages/EnquiryDetail.tsx`** — Added "Contact Person" editable section in left sidebar between Client and Assigned To. Inline edit mode with name + phone inputs, save/cancel buttons. Display mode shows `UserCircle` icon for name, `Phone` icon for number. Falls back to client primary contact display when not set. Saves `contact_person_name` and `contact_person_phone` to enquiries table.

---

## Phase 9: Invoice PDF

### New Files
- **`src/components/InvoicePDF.tsx`** (~230 lines) — `@react-pdf/renderer` component for advance payment invoices. Company header with GSTIN, "TAX INVOICE" title. Bill To section with client name, company, phone, email, city, GST number. Invoice details (number, date, enquiry ref). Payment line items table with navy header. Subtotal / CGST+SGST or IGST / Grand Total. Bank details block pulled from `app_settings`. Terms & conditions. Authorized signatory block. Branded footer with page numbers.

### Files Modified
- **`src/components/enquiry/PaymentsTab.tsx`** — Added `pdf` import from `@react-pdf/renderer` and `InvoicePDF` import. Added "Invoice" button (with `FileText` icon) on received payments. `handleGenerateInvoice()` fetches bank details + company GST from `app_settings`, calculates GST split (CGST+SGST for same-state, IGST for inter-state), generates PDF blob, and triggers browser download. Invoice number format: `TIV-INV-YYYY-XXXXXX`.

---

## Phase 10: Daily Cron Automation Updates

### Files Modified
- **`supabase/functions/daily-cron/index.ts`** — Added two new cron jobs:
  1. **Conditional follow-up cleanup** — Cancels Day 15/30 conditional follow-ups (`is_conditional = true`) when the enquiry has moved past `follow_up` status (into `approved`, `payment_received`, `mobilization_scheduled`, `job_active`, `confirmed`, `completed`, `lost`, or `inactive`).
  2. **Mob confirmation token expiry** — Marks pending `mob_confirmation_tokens` as `expired` when `expires_at` has passed.
  3. **Auto-expire stale enquiries** — Already updated in Phase 0 to use `inactive` instead of `lost` for 60-day stale enquiries.

---

## New Files Summary

| File | Purpose | Phase |
|------|---------|-------|
| `src/components/enquiry/SiteVisitSection.tsx` | Site visit management UI | 1 |
| `src/pages/ConfirmMobilization.tsx` | Public mobilization confirmation page | 3 |
| `src/lib/intakeTokenUtils.ts` | Shared intake token utilities | 4 |
| `src/lib/followUpCadence.ts` | Follow-up cadence creation/cleanup | 4 |
| `src/components/InvoicePDF.tsx` | Invoice PDF renderer | 9 |

## Modified Files Summary

| File | Phases |
|------|--------|
| `src/integrations/supabase/types.ts` | 0 |
| `src/pages/Enquiries.tsx` | 0, 4, 5, 8 |
| `src/components/EnquiryKanban.tsx` | 0, 5 |
| `src/pages/Dashboard.tsx` | 0, 6 |
| `src/pages/EnquiryDetail.tsx` | 0, 1, 2, 4, 5, 8 |
| `src/App.tsx` | 3 |
| `src/components/enquiry/MobilisationSection.tsx` | 3 |
| `src/pages/Intake.tsx` | 7 |
| `src/pages/ClientDetail.tsx` | 7 |
| `src/pages/Clients.tsx` | 7 |
| `src/pages/QuotationBuilder.tsx` | 2 |
| `src/components/QuotationPDF.tsx` | 2 |
| `src/components/ConsultancyPDF.tsx` | 2 |
| `src/components/enquiry/PaymentsTab.tsx` | 9 |
| `supabase/functions/daily-cron/index.ts` | 0, 10 |

---

## Build Status

- TypeScript: Clean (`npx tsc --noEmit` — zero errors)
- Vite Build: Clean (`npx vite build` — success, pre-existing chunk size warning only)
