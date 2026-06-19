# BRD Gap Analysis — Comprehensive Audit

**Date:** 2026-06-05
**Audited Against:** Requirement_Doc.pdf (Business Requirements & Process Document)
**Codebase:** tiavda-qms (React 18 + TypeScript + Supabase)

---

## Section 1: Company & Business Context

**Status: Aligned** — Two service lines (Soil Investigation + Consultancy) both implemented.

---

## Section 2: Lead Lifecycle & Status Machine

### Status Mapping

| BRD Status | Code Status | Kanban Label | Verdict |
|---|---|---|---|
| New Inquiry | `new` | New | DONE |
| Active — Intake Pending | `intake_pending` | Intake Pending | DONE |
| Active — Quotation in Preparation | `pending` | Quotation Prep | DONE |
| Active — Quotation Sent | `sent` | Quote Sent | DONE |
| Active — Follow-Up | `follow_up` | Follow Up | DONE |
| Active — Negotiation/Revision | `negotiation` | Negotiation | DONE |
| Won | `approved` | Won | DONE (naming confusing — code says `approved`, UI says "Won") |
| Payment Received | `payment_received` | Payment Received | DONE |
| Mobilization Scheduled | `mobilization_scheduled` | Mob Scheduled | DONE |
| Job Active | `job_active` | Job Active | DONE |
| Lost | `lost` | Lost | DONE |
| Inactive | `inactive` | Inactive | DONE |

All 12 BRD statuses are implemented. Reactivation (lost/inactive -> follow_up) works with event logging.

### Flags

1. **CRITICAL — No server-side status transition validation.** `VALID_TRANSITIONS` lives only in `src/components/EnquiryKanban.tsx` (client-side). A direct Supabase call can set any status, bypassing all business rules. Needs a PostgreSQL trigger or RLS policy.
2. **Orphaned `confirmed` status** exists in the enum but is unreachable from the Kanban — needs cleanup or migration to `payment_received`.
3. **No auto-transitions:** Payment marked "received" in PaymentsTab does NOT auto-update lead status to `payment_received` — requires manual Kanban drag.

---

## Section 3: Step-by-Step Workflow

### 3.1 Primary Workflow: Soil Investigation Lead

| BRD Step | Requirement | Status | File | Notes |
|---|---|---|---|---|
| 1-2 | Admin logs lead manually | DONE | `src/components/AddLeadDialog.tsx` | New/existing client paths |
| 3 | System auto-sends intake form link | **NOT DONE** | `src/lib/intakeTokenUtils.ts` | `sendIntakeLink()` function exists but is never called automatically. Manual send only from ClientDetail page. |
| 4 | Client fills intake form | DONE | `src/pages/Intake.tsx` | 4-step public form |
| 5 | System notifies admin on intake submit | PARTIAL | `src/pages/Intake.tsx:377-405` | Email notification only. No WhatsApp notification to admin. |
| 6 | Decision: site visit required before quoting? | **NOT DONE** | — | No gate/flag in workflow. Visits are ad-hoc — geologist can schedule one but there is no mandatory checkpoint. |
| 7-8 | Quotation prepared from template, boreholes drive quantities | DONE | `src/pages/QuotationBuilder.tsx` | SI + Consultancy templates |
| 9 | Conditional fields from site conditions (TPA, water, etc.) | DONE (recently fixed) | `src/lib/quotationEngine.ts` | Now supports 5 conditional items: water, electricity, security, access, safety/TPA |
| 10 | Director/authorized user approves quotation | DONE | `src/pages/EnquiryDetail.tsx:372-384` | "Approve This Variant" button |
| 11 | Quotation sent via email + WhatsApp | DONE | `src/pages/EnquiryDetail.tsx:635-786` | Both channels with communication logging |
| 12 | Auto-create follow-up reminders | DONE | `src/lib/followUpCadence.ts` | Days 1, 3, 5, 15 (conditional), 30 (conditional) |
| 13-14 | Negotiation & revisions (up to 3-4) | DONE | `src/pages/QuotationBuilder.tsx` | Versioning works (V1, V2...), no hard limit on rounds |
| 15 | Won -> advance payment request auto-generated | PARTIAL | `src/components/enquiry/PaymentsTab.tsx` | Manual "Request Advance Payment" button only, NOT auto-generated |
| 16 | Admin marks payment received | DONE | `src/components/enquiry/PaymentsTab.tsx:224-282` | Form with amount, method, receipt upload |
| 17 | Notify Mobilization Team Lead on payment | PARTIAL | `src/components/enquiry/PaymentsTab.tsx:262-271` | Notification goes to current user, NOT specifically to Team Lead role |
| 18-21 | Mobilization date + client confirmation portal | DONE | `src/pages/ConfirmMobilization.tsx` | YES/alternate date flow with token-based public link |
| 22 | Mobilization confirmed -> end of automation scope | DONE | — | |

### 3.2 Secondary Workflow: Consultancy Lead

| Step | Status | Notes |
|---|---|---|
| Manual lead log (no intake form) | DONE | AddLeadDialog supports consultancy type |
| Consultancy quotation template | DONE | `src/lib/consultancyEngine.ts` + `ConsultancyPDF.tsx` |
| Follow-up flow same as SI | DONE | Same cadence applies |

### 3.3 Exception Flows

| Flow | Status | Notes |
|---|---|---|
| After-hours leads: prompt staff next morning | **NOT DONE** | No time-based workflow or morning prompt for missed calls |
| Inactive reactivation | DONE | lost/inactive -> follow_up with event logging, lost_date/reason cleared |

---

## Section 4: Lead Sources & Capture Methods

| Source | Status | Code Value | Notes |
|---|---|---|---|
| Inbound Phone Call | DONE | `phone_call` | In AddLeadDialog |
| WhatsApp Message | DONE | `whatsapp` | |
| Missed Call | DONE | `missed_call` | Source logged but no morning prompt |
| Intake Form (self-service) | DONE | — | Public form at `/intake` |
| Consultancy — Verbal/Email | DONE | `email` | |

Extra sources implemented beyond BRD: Referral, Website, Walk-in, Just Dial, IndiaMart.

**Data captured at lead entry (AddLeadDialog):**
- Name (required), Phone (required), Email (optional), Company (optional), Service Type (required), City (required), Requirement/Notes (optional)
- Matches BRD requirements for manual entry

---

## Section 5: Intake Form Fields & Data Structure

### 5.1 Client & Project Information

| BRD Field | Mandatory? | Status | Notes |
|---|---|---|---|
| Name of Client/Organization | Yes | **MISSING from intake** | Only captured in client master (`clients` table), not in the intake form itself |
| GST Number | Yes | **MISSING from intake** | Exists only in ClientDetail.tsx, not in intake form |
| Client Address | Yes | DONE | `site_address` field |
| Client Contact Person | Yes | **MISSING** | Not captured anywhere in intake form |
| Contact Details (Phone/Email) | Yes | **MISSING from intake** | Only in client master data |
| Site Address | Yes | DONE | Mandatory Step 1 field |
| Site Location — Google Maps | Yes | PARTIAL | Text URL input only (`google_maps_url`). No map picker, coordinate extraction, or URL validation. |
| Site Photographs (multiple) | Yes | DONE | Generic file upload (up to 5 files, 10MB each). Mixed with layout plans. |
| Layout Plan / Drawing | Yes | PARTIAL | Same upload zone as site photos. No separate field — files are mixed together. |
| Name of Architect | Optional | DONE | Text input |
| Architect Address | Optional | **MISSING** | Only name + phone captured, no address field |
| Name of RCC Consultant | Optional | DONE | Text input |
| RCC Consultant Address | Optional | **MISSING** | Only name + phone captured, no address field |

### 5.2 Structure Information

| BRD Field | Status | Implementation |
|---|---|---|
| Type of Structure | DONE | Button toggles: Residential, Commercial, Industrial, Infrastructure, Other |
| Number of Stories (Above Ground) | DONE | Stepper control, range 0-50 |
| Number of Basements | DONE | Stepper control, range 0-10 |
| Height of Basements | DONE | Numeric input in meters |
| Number of Podiums | DONE | Stepper control, range 0-10 |
| Distance of Site from Company Office | DONE | Numeric input in km |

### 5.3 Site Conditions (for Quotation Cost Adjustment)

| BRD Field | Status | Notes |
|---|---|---|
| Access to Site (multiselect dropdown) | DONE | 6 multiselect button options: Main road access, Internal road only, Narrow lane, Unpaved/kutcha road, Requires crane entry, Restricted hours |
| Water Availability (Yes/No + Quantity) | DONE | Yes/No toggle + dropdown: Sufficient (500+ L/day), Limited, None |
| Plot/Site Fenced (Yes/No) | DONE | Yes/No/Partial (extra "Partial" option beyond BRD) |
| Security Availability (Yes/No) | DONE | Yes/No toggle |
| Local Authority Permission Required | DONE | Yes/No toggle. Label says "Permissions Obtained" (past tense vs BRD "Required") |
| Demobilization Charges Consent | DONE | Mandatory checkbox, blocks form submission if unchecked. Styled with red/green background. |
| Safety Requirements / TPA (conditional) | PARTIAL | Always-visible text field. BRD says: "If YES, a hidden field opens". No conditional show/hide logic. |

---

## Section 6: Site Visit Process

### 6.1-6.2 Data Captured During Site Visit

| BRD Requirement | Status | File |
|---|---|---|
| Site feasibility assessment | DONE | `src/components/enquiry/SiteVisitSection.tsx` — Feasible / Conditional / Not Feasible |
| Confirmation of water/access/security/fencing | DONE | 4 binary confirmation toggles |
| Additional cost factors | DONE | 8 presets: Difficult terrain, Water tanker, Rock coring, Extended drilling, Security, Generator, Basement, High water table |
| Site photographs (additional) | **NOT DONE** | No photo upload in site visit form or section. No `photos` field in `site_visits` schema. |
| Geologist observations | DONE | Text field stored as JSONB |
| Recommendations | DONE | Text field |

### 6.3 Storage & Quotation Feed

| Requirement | Status | Notes |
|---|---|---|
| Observations logged under lead record, separate from intake | DONE | `site_visits` table is independent from `intake_submissions` |
| Observations directly feed into quotation cost adjustments | DONE (recently fixed) | `QuotationBuilder.tsx` now fetches latest completed site visit and passes to engine via `buildSiteConditions()` |

**Missing: "Is site visit required?" decision gate** — BRD Step 6 says this is a decision point but no workflow checkpoint exists. Visits are entirely ad-hoc.

---

## Section 7: Quotation Process

### 7.3 Desired Quotation Workflow

| BRD Step | Requirement | Status | Notes |
|---|---|---|---|
| 28 | Client data auto-populates quotation | DONE | From enquiry/intake data |
| 29 | Select quotation template (3-4 types) | DONE | SI + Consultancy. Type 2 out of scope. Type 4 (client-defined) flagged as low priority. |
| 30 | Primary input: number of boreholes | DONE | Drives all quantity calculations |
| 31 | Auto-calculate quantities | DONE | SPT, UDS, lab samples all derived from bores x depth |
| 32 | Conditional fields from site conditions | DONE (recently fixed) | SiteConditionsPanel with toggles for water/electricity/security/access/safety |
| 33 | Human reviewer adjusts variable costs | DONE (recently fixed) | Inline cost override inputs in SiteConditionsPanel |
| 34 | Director approves quotation | DONE | "Approve This Variant" in EnquiryDetail |
| 35 | PDF export + email/WhatsApp send | DONE | |
| 36 | Unique quotation number | **PARTIAL** | Referenced in PDF rendering but `quotation_number` column NOT in database schema |
| 37 | Revisions versioned (V1, V2, V3) | DONE | Version column, new records per revision |
| 38 | On conversion: data pushed to central DB | DONE | Already in same Supabase DB |

### 7.4 Quotation Template Types

| Template | Status | Notes |
|---|---|---|
| Type 1 — Standard SI (~70-75%) | DONE | Full implementation with 4 sections (A-D) |
| Type 2 — [To be confirmed] | OUT OF SCOPE | Moved to another vertical per BRD |
| Type 3 — Pure Consultancy | DONE | `src/lib/consultancyEngine.ts` + `ConsultancyPDF.tsx` |
| Type 4 — Client-Defined Format (<5%) | **NOT DONE** | BRD says low priority. No flag/note system exists either. |

### 7.5 Line Items (Type 1 — Standard SI)

All 14 line items from BRD are implemented:

| # | Line Item | Status |
|---|---|---|
| 1 | Mobilization of equipment | DONE |
| 2 | Setup borehole-to-borehole (N-1 moves) | DONE |
| 3 | Boring/Drilling in soil | DONE |
| 4 | SPT | DONE |
| 5 | UDS | DONE |
| 6 | Drilling in rock (core drilling) | DONE |
| 7 | Water sample collection | DONE |
| 8 | Lab testing — Soil | DONE |
| 9 | Lab testing — Rock | DONE |
| 10 | Lab testing — Water | DONE |
| 11 | Miscellaneous (Safety/DG Set) | DONE |
| 12 | Report preparation | DONE |
| 13 | Water arrangement (conditional) | DONE |
| 14 | TPA/Safety (conditional) | DONE |

**Additional conditional items added (not in original BRD table but derived from BRD 5.3 and transcript):**
- Generator/Power Arrangement (electricity unavailable)
- Security Arrangement (security unavailable)
- Difficult Access Surcharge (access not clear)

### 7.6 Pricing Logic

| Feature | Status | Notes |
|---|---|---|
| Rate-based pricing (Rate x Qty) | DONE | Rates from `app_settings` key-value store |
| Directors can change rates | DONE | Admin-only QuotationConfigPage |
| Conditional cost items | DONE (recently fixed) | 5 conditions with per-quotation cost overrides |
| Lump sum option (alternate mode) | **PARTIAL** | `is_lump_sum` boolean in DB schema but NO UI toggle in QuotationBuilder |
| Discount/negotiation | DONE | Percentage + flat amount options |

### 7.7 Quotation Versioning

| Feature | Status |
|---|---|
| Multiple revisions (V1, V2, V3...) | DONE |
| Each revision stored, not overwritten | DONE |
| Finalized quotation clearly marked | DONE ("Approved" badge, "Superseded" for older versions) |
| Revision history viewable | DONE |
| Each revision generates new PDF | DONE |

### 7.8 Quotation Output

| Feature | Status | Notes |
|---|---|---|
| PDF format | DONE | `@react-pdf/renderer` |
| Professional client-facing layout | DONE | Company header, sections, totals, terms |
| Unique quotation number | **GAP** | Used in PDF filenames but no dedicated `quotation_number` column in DB |
| Email delivery | DONE | |
| WhatsApp delivery | DONE | |

---

## Section 8: Automation & Business Logic

| # | Trigger | Condition | Expected Action | Status | Notes |
|---|---|---|---|---|---|
| 1 | Lead logged in system | Service type = SI | Send intake form link automatically | **NOT DONE** | `sendIntakeLink()` exists but never auto-called |
| 2 | Intake form submitted | Always | Notify admin | PARTIAL | Email only, no WhatsApp to admin |
| 3 | Quotation sent to client | Always | Send WhatsApp/email confirmation | DONE | Both channels implemented |
| 4 | Quotation sent to client | Always | Create follow-up reminders (Week 1) | DONE | Days 1, 3, 5 as "Today's Actions" |
| 5 | Follow-up: 15 days | No reply (conditional) | Show 15-day reminder on dashboard | DONE | Conditional follow-up at Day 15 |
| 6 | Follow-up: 30 days | No reply (conditional) | Show reminder, optionally mark Inactive | PARTIAL | Auto-expire is at **60 days** (not 30). No UI option at day 30. |
| 7 | Client status = Won | Payment confirmed | Auto-generate advance payment request | PARTIAL | Manual button only, not auto-generated |
| 8 | Payment received | Always | Notify Mobilization Team Lead | **NOT DONE** | Notification goes to current user, not Team Lead role |
| 9 | Mobilization date entered | Always | Send to client email/WhatsApp with YES/alternate | DONE | Token-based public confirmation page |
| 10 | Client confirms date | YES selected | Mark as confirmed, notify team | DONE | Event logged + client_confirmed flag set |
| 11 | Client proposes alternate | Alternate selected | Notify Team Lead with proposed date | PARTIAL | Event logged, but no push notification to Team Lead |
| 12 | Daily login | Always | Show Today's Actions + 7-day reminders | DONE | Dashboard sections implemented |

**Automation Scorecard: 6 Done, 5 Partial, 1 Not Done**

---

## Section 9: User Roles & Permissions

### 9.1 User Types

| BRD Role | Code Role | Status | Notes |
|---|---|---|---|
| Director / Super Admin | `super_admin` | DONE | Full access to all modules |
| Admin / Operations Manager | `admin` | DONE | Full access, same as Director operationally |
| Mobilization Team Lead | `mobilization_lead` | **PARTIAL** | Role exists and can be assigned, but **NO functional restrictions** — can access everything. BRD says "cannot edit quotations or financial data". |
| View-Only / Reporting | `viewer` | DONE | `canEditEnquiry: false`, read-only enforced in UI |
| Dynamic user add/delete | — | DONE | `src/components/settings/TeamManagement.tsx` with invite-user edge function |

### Permission Implementation

| Layer | Status | Notes |
|---|---|---|
| Frontend route guards | DONE | AdminRoute wrapper for Settings, Rate Matrix, Quotation Config |
| Frontend component guards | DONE | `canEditEnquiry`, `canAssignEnquiry`, `canViewSettings` checks |
| **Database RLS policies** | **CRITICAL GAP** | Current RLS allows all authenticated users full CRUD. `using (true)` on all policies. No role distinction at DB level. |

**CRITICAL: A viewer could bypass frontend guards and edit data directly via Supabase client.**

---

## Section 10: Dashboard & Reporting

### 10.1 Daily Operations Dashboard

| Widget | Status | Notes |
|---|---|---|
| Today's Actions (follow-up calls due today) | DONE | Fetches follow-ups where `scheduled_date <= today` and `outcome = pending` |
| Upcoming Reminders (next 7 days) | DONE | Job reminders within 7 days |
| Pending Quotations (sent but not confirmed) | **NOT DONE** | No dedicated widget |
| New Inquiries (not fully processed) | DONE | "New Enquiries" stat card |

### 10.2 Management Metrics Dashboard

| Metric | Status | Notes |
|---|---|---|
| Total quotations sent (daily/monthly/yearly) | DONE | "Quotes Sent" stat card |
| Won/lost/inactive counts | DONE | Pipeline Overview shows all statuses |
| Conversion rate (Won/Sent) | DONE | Percentage stat card |
| Revenue metrics (won value, monthly/yearly) | DONE | Pipeline Value card |
| Order book (jobs being executed) | DONE | "Active Jobs" stat card |
| Quotation book (pending quotation value) | **NOT DONE** | Missing widget |
| Pipeline value (active quotations sum) | DONE | Stat card |
| **"Confirmed Revenue Last 6 Months"** | **SHOULD BE REMOVED** | Client explicitly requested removal in BRD (Section 10.2 clarification). Still present in `src/pages/Dashboard.tsx` lines 614-648. |

**Implemented sections:** 8 stat cards, Pipeline Overview, Today's Actions, Upcoming Reminders, Confirmed Revenue chart (should be removed), Recent Activity Feed.

---

## Section 11: Payment & Mobilization Module

### 11.1 Advance Payment Request

| Feature | Status | Notes |
|---|---|---|
| Auto-generate on Won status | PARTIAL | Manual "Request Advance Payment" button only |
| Standard bill format | DONE | HTML email template with company header, amount, bank details |
| Email delivery | DONE | Via send-email edge function |
| WhatsApp delivery | DONE | Via send-whatsapp with `qms_payment_request` template |

### 11.2 Payment Receipt Tracking

| Feature | Status | Notes |
|---|---|---|
| Admin marks payment received | DONE | Form with amount, method, transaction ref, receipt upload |
| Notification to Mobilization Team Lead | **NOT DONE** | Notification goes to current user, not Team Lead |

### 11.3 Mobilization Scheduling

| Feature | Status |
|---|---|
| Team Lead receives notification with job details | DONE |
| Team Lead enters proposed mobilization date | DONE |
| System sends date to client (email + WhatsApp) | DONE |
| Client YES / alternate date options | DONE |
| Back-and-forth until confirmed | DONE |
| Google Drive folder creation | DONE |

---

## Section 13: Integrations

| Integration | BRD Priority | Status | Notes |
|---|---|---|---|
| WhatsApp (WATI BSP API) | High | DONE | Templates: `qms_quotation_sent`, `qms_payment_request`, `qms_mobilisation_confirmation`, `qms_site_visit_today`, `qms_intake_form`, `qms_custom_message` |
| Email (SendGrid) | High | DONE | Via `send-email` edge function |
| Google Maps | Medium | PARTIAL | Text URL input only. No interactive map, no coordinate extraction, no URL validation. |
| Google Drive | — | DONE | Folder creation on mobilization (`create-drive-folder` edge function) |
| Finance/Accounts | Low (Phase 2) | NOT IN SCOPE | |

---

## Section 14: Edge Cases & Special Scenarios

| Scenario | Status | Notes |
|---|---|---|
| After-hours leads: prompt next morning | **NOT DONE** | No time-based workflow |
| Inactive reactivation | DONE | Searchable + re-openable |
| Lump sum quotation | PARTIAL | DB field exists, no UI toggle |
| Client-supplied format (<5%) | **NOT DONE** | No flag/note system |
| No response to mobilization | No auto-escalation | Manual follow-up only |
| Demobilization after mobilization | DONE | Consent captured in intake form |
| Multiple revisions (V1, V2, V3) | DONE | All versions stored |
| Volume scaling (800 -> 1500+/year) | OK | Supabase handles this scale |

---

## Priority Action Items

### CRITICAL (Security / Data Integrity)

| # | Item | Impact | Effort |
|---|---|---|---|
| C1 | Add server-side status transition validation (Postgres trigger) | Prevents invalid state transitions via direct DB access | 2-3 hrs |
| C2 | Add role-based RLS policies on all core tables | Prevents viewers/mob leads from editing data directly | 4-6 hrs |
| C3 | Restrict Mobilization Lead role (frontend + DB) | BRD: "cannot edit quotations or financial data" | 2 hrs |

### HIGH (Core BRD Requirements Not Met)

| # | Item | BRD Section | Effort |
|---|---|---|---|
| H1 | Auto-send intake form link when SI lead is logged | 3.1 Step 3 | 1 hr |
| H2 | Auto-generate advance payment request on Won status | 3.1 Step 15, 11.1 | 2 hrs |
| H3 | Payment received -> notify Mobilization Team Lead (not current user) | 11.2, 8 row 8 | 1 hr |
| H4 | Remove "Confirmed Revenue Last 6 Months" dashboard widget | 10.2 clarification | 15 min |
| H5 | Add lump sum quotation mode toggle in QuotationBuilder | 7.6 | 2 hrs |
| H6 | Add `quotation_number` column to DB and auto-generate | 7.8 | 1 hr |

### MEDIUM (Feature Gaps)

| # | Item | BRD Section | Effort |
|---|---|---|---|
| M1 | Site visit photo upload | 6.2 | 2 hrs |
| M2 | "Is site visit required?" decision gate/flag | 3.1 Step 6 | 1 hr |
| M3 | Missed call next-morning prompt | 3.3 | 2 hrs |
| M4 | Intake admin notification via WhatsApp (not just email) | 8 row 2 | 30 min |
| M5 | Client alternate mobilization -> push notification to Team Lead | 8 row 11 | 30 min |
| M6 | Auto-expire at 30 days (currently 60) | 8 row 6 | 30 min |
| M7 | Add "Pending Quotations" dashboard widget | 10.1 | 1 hr |
| M8 | Add "Quotation Book" (pending value) dashboard widget | 10.2 | 1 hr |
| M9 | Auto-transition: payment received -> update lead status to `payment_received` | 2.1 flow | 30 min |

### LOW (Polish / Minor Fields)

| # | Item | BRD Section | Effort |
|---|---|---|---|
| L1 | Add Client Contact Person field to intake form | 5.1 | 15 min |
| L2 | Add GST Number to intake form (or link from client) | 5.1 | 15 min |
| L3 | Add Architect Address and RCC Consultant Address to intake | 5.1 | 15 min |
| L4 | Safety Requirements: conditional show/hide (show only when YES) | 5.3 | 30 min |
| L5 | Google Maps: coordinate extraction or interactive map picker | 5.1 | 3 hrs |
| L6 | Separate Layout Plan upload from Site Photos | 5.1 | 1 hr |
| L7 | Clean up orphaned `confirmed` status from enum | 2.2 | 30 min |
| L8 | Client-defined format flag/note on quotation | 7.4 Type 4 | 30 min |

---

## Recently Completed (This Session)

The following gaps were identified and **fixed** during this session:

1. **Site conditions beyond water/safety don't affect pricing** -> Added `SiteConditions` type, 3 new rate keys (`rate_generator_arrangement`, `rate_security_arrangement`, `rate_access_arrangement`), and 3 new conditional line items in quotation engine.
2. **Site visit data doesn't feed into quotation** -> QuotationBuilder now fetches latest completed site visit and merges conditions via `buildSiteConditions()`.
3. **No site conditions visibility in QuotationBuilder** -> Created `SiteConditionsPanel.tsx` with toggle switches and inline cost override inputs.
4. **No site visit context during quotation prep** -> Created `SiteVisitContext.tsx` showing visit date, feasibility, observations, recommendations, and cost factor pills.
5. **New rate inputs for conditional items** -> Added Generator/Power, Security, Access Surcharge fields to QuotationConfigPage.

---

## Overall Compliance Summary

| BRD Area | Completion | Key Gaps |
|---|---|---|
| Lead Lifecycle (Sec 2) | 90% | No server-side validation, orphaned status |
| Workflow (Sec 3) | 75% | Auto-intake link, auto-payment, Team Lead notifications |
| Lead Capture (Sec 4) | 95% | Morning prompt for missed calls |
| Intake Form (Sec 5) | 80% | Missing fields (GST, contact person, addresses), conditional safety |
| Site Visit (Sec 6) | 85% | No photo upload, no decision gate |
| Quotation (Sec 7) | 90% | Lump sum toggle, quotation number column |
| Automation (Sec 8) | 70% | 1 not done, 5 partial |
| Roles & Permissions (Sec 9) | 60% | No RLS, mob lead unrestricted |
| Dashboard (Sec 10) | 80% | Missing widgets, unwanted widget still present |
| Payment & Mobilization (Sec 11) | 85% | Auto-payment, Team Lead notify |
| Integrations (Sec 13) | 90% | Google Maps only text input |
