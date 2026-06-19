# QMS — Deep Gap Analysis (BRD + Discovery Transcript vs. Current Build)

**Date:** 2026-06-14
**Audited against:** `Requirement_Doc.pdf` (Business Requirements & Process Document) + `Transcript.pdf` (discovery call)
**Codebase:** tiavda-qms @ current HEAD (React 18 + TS + Vite + Supabase)
**Method:** Six parallel code audits, every claim verified at `file:line`. Supersedes the stale `BRD_GAP_ANALYSIS.md` (2026-06-05).

---

## 0. Executive Summary

The application implements **the overwhelming majority of the BRD's functional surface** — the lead lifecycle, 4 quotation templates with working PDFs, versioning, lump-sum mode, the TPA/safety hidden-cost trigger, discounts, follow-up cadence, payments, mobilization confirmation, job completion, dashboard, and role-gated UI are all present and largely correct.

**However, the system is not production-safe in its current state.** The headline risks are not missing features — they are **infrastructure and data-integrity gaps that make "implemented" features non-functional at runtime or insecure**:

| Severity | Theme | One-line impact |
|---|---|---|
| 🔴 CRITICAL | Schema not in version control | The entire mobilization-confirmation flow depends on a table (`mob_confirmation_tokens`) that exists **only in the live DB, not in any migration**. A DB reset / fresh environment breaks it. |
| 🔴 CRITICAL | No scheduler | `daily-cron` is **never scheduled** — every time-based automation (reminders, auto-inactive, missed-call prompt, token expiry, weekly summary) is dead code unless wired manually in the dashboard. |
| 🔴 CRITICAL | RLS privilege escalation | `profiles` is world-writable (`USING(true)`) → any viewer can self-promote to super_admin. |
| 🔴 CRITICAL | RLS role-source mismatch | Policies read role from JWT; the app writes role to `profiles`. Role changes **never take effect at the DB level**. |
| 🟠 HIGH | Dummy integration secrets | Email / WhatsApp / Google Drive all **silently fail** in production (known). |
| 🟠 HIGH | New BOQ templates abandon borehole auto-calc | The 3 BOQ templates require fully manual quantity entry — reintroducing the Excel workflow the product exists to replace. |

**Bottom line:** the build is feature-rich but rests on a foundation with reproducibility, scheduling, and security holes that must be closed before go-live. Estimated remediation for all CRITICAL + HIGH items: ~3–5 focused days.

---

## 1. 🔴 CRITICAL ISSUES (fix before any production use)

### C1 — `mob_confirmation_tokens` table & mobilization columns have no migration
- **Evidence:** `grep mob_confirmation_tokens supabase/migrations/` → **zero matches**. Columns `mobilisation.client_confirmed / client_confirmed_at / admin_override / admin_override_by / admin_override_at` and token columns `alternate_date / alternate_notes / confirmed_at` are absent from `00000000000000_full_schema.sql:330-349` and every later migration. The code only compiles because of `as any` casts (`MobilisationSection.tsx:123,285,313`, `ConfirmMobilization.tsx:61,79-84`).
- **Why it works today:** the table was clearly created by hand in the Supabase dashboard (your screenshots show it working).
- **Risk:** the schema is **not reproducible**. A `supabase db reset`, a new staging/prod environment, or any teammate cloning the repo gets a build where the entire 11.3 flow (client confirm + admin override + token expiry) **fails at runtime**.
- **Fix:** author a migration that creates `mob_confirmation_tokens` and adds the mobilisation confirmation columns; regenerate `types.ts`; remove the `as any` casts. *(~2 hrs)*

### C2 — `daily-cron` is never scheduled → the entire time-based automation layer is dead
- **Evidence:** `config.toml` is a one-line stub (`project_id` only). No `cron.schedule` / `pg_cron` / `net.http_post` anywhere in `supabase/`.
- **What silently never runs:** Week-1/15/30-day follow-up surfacing past their date, job-completion 3/2/1-day reminders, payment reminders, **auto-inactive after no reply**, **missed-call next-morning prompt**, **mobilization token expiry**, intake-form non-response nudges, weekly summary.
- **Risk:** Many features you'd demo as "done" produce nothing because the function that drives them is never invoked.
- **Fix:** add a pg_cron schedule (or Supabase scheduled function / external GitHub Action) invoking `daily-cron` daily and `weekly-summary` weekly. *(~1 hr + verification)*

### C3 — `profiles` RLS allows self-promotion to super_admin
- **Evidence:** `full_schema.sql:740` — `profiles_update ... USING (true) WITH CHECK (true)`.
- **Risk:** any authenticated user (incl. a viewer) can run `supabase.from('profiles').update({ role:'super_admin' }).eq('id', myId)` from the browser and unlock all admin UI + the `invite-user` edge function.
- **Fix:** restrict `profiles` UPDATE so a user cannot change their own `role` / `is_active`; only `is_editor()` may change others' roles. *(~1 hr)*

### C4 — RLS role-source mismatch makes DB-level role enforcement non-functional
- **Evidence:** `get_user_role()` reads `request.jwt.claims -> user_metadata -> role` (`role_based_rls.sql:10`), defaulting to `'viewer'` when absent. But role changes are written **only** to `public.profiles` (`TeamManagement.tsx:78-81`). No `auth.admin.updateUserById(user_metadata.role)` anywhere except initial create (`invite-user/index.ts:73`).
- **Risk:** Promoting/demoting a user in the UI updates `profiles` but **not their JWT**, so every `is_editor()` / `is_not_viewer()` policy keeps enforcing the role baked in at account creation (or `viewer` if none). Role management is effectively broken at the data layer; the permission model is unreliable.
- **Fix:** either (a) change roles via an edge function calling `auth.admin.updateUserById` to stamp `user_metadata.role`, or (b) rewrite `get_user_role()` as a `SECURITY DEFINER` lookup against `profiles`. Option (b) is cleaner and also fixes C3's blast radius. *(~2-3 hrs)*

### C5 — `is_conditional` column queried but never defined
- **Evidence:** `daily-cron/index.ts:220` filters `follow_ups ... .eq('is_conditional', true)`; the column exists in no migration and is never written by `createFollowUpCadence`.
- **Risk:** the server-side Day-15/30 conditional cleanup errors or returns nothing every run. (Masked today only because a brittle client-side `notes`-string-match workaround exists.)
- **Fix:** add the `is_conditional` column and set it in the cadence insert; or drop the cron query and rely on a single robust mechanism. *(~30 min)*

### C6 — All external-integration secrets are dummy placeholders (known)
- Email (Brevo), WhatsApp (WATI), Google Drive — all calls are correctly wired in code but **silently fail** in production because the secrets are placeholders. See `[[supabase-secrets-placeholder]]`.
- **Fix:** provision real Brevo API key + verified sender domain, WATI token/base URL, and a real Google service account before launch.

---

## 2. 🟠 HIGH — Core BRD requirements not met (functional)

| # | Gap | BRD ref | Evidence | Fix |
|---|---|---|---|---|
| H1 | **BOQ templates are not borehole-driven.** Auto-calc (bores × depth) works only for `original_si`; the 3 BOQ templates load static qty and require manual entry. | 7.3 §30-31 | `QuotationBuilder.tsx:1217-1223`; `quotationEngine.ts:68-328` vs `buildTemplateLineItems` | Wire borehole-driven quantity formulas into BOQ items, or document them as manual-only by design. |
| H2 | **Duplicate, divergent "Type 1".** `original_si` (engine, `rate_*` keys) and `BOQ_TYPE_1` (static, `boq_*` keys) both model standard SI → same job can be priced two ways. | 7.4 | `templateDefaults.ts:3-88` vs `quotationEngine.ts:68` | Pick one canonical Type-1 path, or clearly scope when each is used. |
| H3 | **Advance payment request auto-created but not auto-sent.** A draft `payments` row is created on Won; the email/WhatsApp request needs a manual click. | 8 row 7, 11.1 | `EnquiryDetail.tsx:924-935` (create) vs `PaymentsTab.tsx:303` (manual send) | Optionally auto-send on Won, or keep manual but make it explicit. |
| H4 | **Mobilization back-and-forth dead-ends.** Client can propose an alternate date, but the Team Lead has no UI to counter-propose / re-issue a token. | 11.3 "until agreed" | `ConfirmMobilization.tsx:117-158`; `MobilisationSection.tsx:293-305` | Add "re-propose date" action that issues a fresh token. |
| H5 | **Client confirmation (happy path) notifies no one internally.** Only an `enquiry_events` row is written; the alternate-date path notifies but the YES path doesn't. | 8 row 10 | `ConfirmMobilization.tsx:89-115` | Insert `notifications` for the mob-lead/team on confirm. |
| H6 | **No escalation when client ignores the mobilization request.** Tokens silently expire — no admin alert, re-send, or follow-up task. | 14 edge case | `daily-cron/index.ts:238-255` | On expiry, notify admin + create a follow-up. |
| H7 | **Demob consent doesn't capture the cost-charging clause and is never referenced.** Intake checkbox covers generic "site restoration," not "client bears demob cost if site not ready." Never read downstream. | 5.3, 14 | `Intake.tsx:1255-1272,349`; no downstream grep hits | Rewrite consent text to the BRD's liability clause; surface it in mobilization/job-completion. |
| H8 | **Intake stores ~18 fields as an untyped JSON blob in `remarks`.** GST, Google Maps URL+coords, basement height, podiums, distance, all 6 site-condition answers, consent, safety flag, architect/RCC contacts — all concatenated as `---EXTENDED_DATA---` JSON; no typed columns. Unqueryable, unindexed, fragile. | 5.1-5.3 | `Intake.tsx:318-355`; `types.ts:406-466` (no columns) | Add typed columns to `intake_submissions`; migrate parser to write them. |
| H9 | **Most BRD-required intake fields are optional in the UI.** Only Site Address, City, structure type, num_bores, demob consent are enforced. GST, Google Maps, site photos, layout plan (all BRD-"required") are skippable. | 5.1 | `Intake.tsx:292-308` | Add required validation per BRD; or formally downgrade to optional with sign-off. |
| H10 | **`send-email` attachment param mismatch → quotation PDFs never attach.** Client sends `attachment_path`; function reads `attachment_url`. | 7.8 / 8 row 3 | `EnquiryDetail.tsx:769` vs `send-email/index.ts:12` | Align the param name. |
| H11 | **Mobilization Lead not restricted to "Mobilization Section ONLY."** Quotations/payments/rates are correctly denied, but mob lead can still edit enquiries, clients, follow-ups, job_completion. | 9.1 | `useRole.ts:15` (`canEditEnquiry: role!=='viewer'`); matching `is_not_viewer()` RLS | Tighten mob-lead policies to the mobilization scope. |
| H12 | **Auto-inactive only covers `new`/`pending`, not `follow_up`/`sent`/`negotiation`.** The most common "quoted then silent" 30-day case never auto-expires. | 8 row 6 | `daily-cron/index.ts:266` | Extend the auto-inactive query to the follow-up statuses. |

---

## 3. 🟡 MEDIUM — Feature gaps & correctness

| # | Gap | BRD ref | Evidence |
|---|---|---|---|
| M1 | **Auto-send intake link reimplements `sendIntakeLink()`** inline instead of reusing the helper → divergence risk (e.g. comms-log path). | 8 row 1 | `AddLeadDialog.tsx:364-405` vs `intakeTokenUtils.ts:35` |
| M2 | **Site-visit `cost_factors` don't auto-price.** Geologist's discovered factors are shown as advisory chips only; the engine prices from intake conditions + safety flag, not visit factors → manual re-entry. | 6.2-6.3 | `SiteVisitContext.tsx:175-199`; `quotationEngine.ts:246-304` |
| M3 | **Site-visit decision gate is non-binding.** `site_visit_required` flag exists but never blocks quotation creation when a required visit is incomplete; gated to SI only. | 3.1 §6 | `EnquiryDetail.tsx:1431-1474` |
| M4 | **No photo upload on the public site-visit form** (only the internal complete dialog). The on-site actor can't attach photos. | 6.2 | `SiteVisitForm.tsx` (no upload); `SiteVisitSection.tsx:643-682` |
| M5 | **Hardcoded `defaultRate` fallbacks** in `templateDefaults.ts` — if an admin never configures a `boq_*` rate, a literal baked into source is used silently. | 7.6 | `templateRegistry.ts:111-112` |
| M6 | **Dashboard is global, not per-user.** Today's Actions / Reminders don't filter by `assigned_to = current user`. | 10.1 | `Dashboard.tsx:212-269` |
| M7 | **Conversion rate denominator is Won/Total-enquiries, not Won/Sent.** | 10.2 | `Dashboard.tsx:171-173` |
| M8 | **Total quotations sent has no daily/monthly/yearly breakdown** — only a current-snapshot count of status=`sent`. | 10.2 | `Dashboard.tsx:159` |
| M9 | **`notifications` UPDATE open to all authenticated** — any user can modify others' notifications. | 9 | `full_schema.sql:819` |
| M10 | **`site_visits` fully permissive incl. anon UPDATE/DELETE.** | 9 | `full_schema.sql:843-848` |
| M11 | **Non-transactional auto-transitions.** Status update + `enquiry_events` insert are separate awaited calls; a failure between leaves status changed with no audit row. Status guards (e.g. payment-received requires exactly `approved`) silently no-op out of order. | 2.1 | `PaymentsTab.tsx:248-261` |
| M12 | **Missed-call morning prompt misses SI leads** — filters `status='new'`, but SI missed-calls are created at `intake_pending`. (Moot until C2 fixed.) | 3.3 | `daily-cron:443` vs `AddLeadDialog.tsx:352` |
| M13 | **Job-completion reminders target admin, not the assigned team lead.** | 11 | `daily-cron/index.ts:100-108` |
| M14 | **Intake attachments go to the `receipts` bucket** (wrong) and use `getPublicUrl` on a private bucket (URLs won't resolve). | 5.1 | `Intake.tsx:411,422,430-436` |

---

## 4. 🟢 LOW — Polish, minor fields, latent bugs

| # | Item | Evidence |
|---|---|---|
| L1 | **Latent bug:** `form.client_name` referenced but not a `FormData` field → WhatsApp payload sends `client_name: undefined`. | `Intake.tsx:484` vs `:21-57` |
| L2 | Self-service intake enquiries inserted with **no `lead_source`** → channel provenance lost. | `full_schema.sql:682-688` |
| L3 | Orphaned `confirmed` enum status (unreachable) + `completed` carried as extras. | `EnquiryKanban.tsx:26-41`; `Enquiries.tsx:468` |
| L4 | Won flow sets status `approved`, not a terminal won/confirmed state — diverges from documented status machine. | `EnquiryDetail.tsx:910` |
| L5 | Quotation number absent in PDF **preview** (saved/regenerated PDFs are correct). | `QuotationBuilder.tsx:672` |
| L6 | Site-access multiselect options don't match BRD (road-type vs Vehicular/Manual/Limited); "Permissions Obtained" inverts "Permission Required." | `Intake.tsx:88-91` |
| L7 | Client address + primary contact phone/email **not collected in intake** (rely on possibly-stale client master). | `Intake.tsx` |
| L8 | Placeholder branding ships in invoices/emails ("COMPANY NAME", `accounts@company.com`, hardcoded phone). | `InvoicePDF.tsx:163,277,280`; `PaymentsTab.tsx:143` |
| L9 | Advance % hardcoded at 50% in two places, no config. | `EnquiryDetail.tsx:927`; `PaymentsTab.tsx:304` |
| L10 | Status-transition trigger trusts user-writable JWT `user_metadata.role` for super_admin bypass; also only validates UPDATE, not INSERT (direct insert at any status). | `full_schema.sql:556-564,597` |

---

## 5. ✅ Verified DONE (not gaps — for confidence)

- **12 BRD statuses** all present; server-side transition **trigger exists** (`full_schema.sql:541-598`).
- **Unique `quotation_number`** persisted via DB trigger `QTN-YYYY-NNNNN` (not just a filename).
- **Lump-sum mode** works end to end.
- **TPA/Safety hidden-cost-on-trigger** genuinely implemented (cost field appears only when safety text entered; manual value). ✅ matches transcript.
- **Water-arrangement conditional** line item (only when water unavailable). ✅
- **Discount** (percentage/flat, clamped) with dedicated columns. ✅
- **Versioning** V1/V2/V3, stored not overwritten, superseded badges, history, new PDF per revision. ✅
- **Single approved quotation** enforced by unique partial index. ✅
- **All 4 templates produce working PDFs.** ✅
- **Payment-received notifies the `mobilization_lead` role** (not current user). ✅
- **Client-proposes-alternate notifies mob leads** with the proposed date. ✅
- **"Confirmed Revenue Last 6 Months" widget REMOVED** per BRD clarification. ✅
- **Notification bell** with realtime unread count + dropdown. ✅
- **Inactive→Reactivated** transition + permanent soft-delete retention. ✅
- **Job Completion** 3-stage tracker, report upload, final bill, auto-complete enquiry when all done. ✅
- **No `service_role` key leaked** to frontend. ✅

---

## 6. Prioritized Remediation Plan

### Sprint 1 — Make it safe & reproducible (CRITICAL, ~1.5 days)
1. **C1** — Migration for `mob_confirmation_tokens` + mobilisation columns; regen `types.ts`; drop `as any`.
2. **C2** — Schedule `daily-cron` (daily) + `weekly-summary` (weekly).
3. **C3 + C4** — Rewrite `get_user_role()` as `SECURITY DEFINER` lookup on `profiles`; lock `profiles` UPDATE so users can't change their own role/active. (Fixes both escalation and role-propagation.)
4. **C5** — Add `is_conditional` column + set it in cadence; remove brittle notes-matching.
5. **C6** — Provision real Brevo / WATI / Google secrets (or document as deferred).

### Sprint 2 — Close core BRD functional gaps (HIGH, ~2 days)
6. **H10** attachment param (15 min) → **H5/H6** mobilization confirm-notify + expiry escalation → **H4** re-propose loop → **H3** auto-send advance (optional) → **H11** restrict mob-lead → **H12** widen auto-inactive → **H7** demob consent text.
7. **H8/H9** — Promote intake EXTENDED_DATA blob to typed columns + enforce required fields. (Largest single item.)
8. **H1/H2** — Decide BOQ borehole auto-calc vs document manual; resolve dual Type-1.

### Sprint 3 — Correctness & polish (MEDIUM/LOW, ~1 day)
9. M2 (site-visit cost factors → pricing), M6 (per-user dashboard), M7 (conversion denominator), M9/M10 (RLS tighten), M11 (transactional transitions), then the LOW list (L1 client_name bug, L8 branding, L3 orphan status, etc.).

---

## 7. Compliance Scorecard (verified)

| BRD Area | Functional Completeness | Production-Ready? | Notes |
|---|---|---|---|
| Lead Lifecycle (§2) | 95% | ⚠️ | Status trigger good; INSERT unvalidated; auto-transitions fragile |
| Workflow (§3) | 85% | ⚠️ | Auto-intake-link ✅; site-visit gate non-binding |
| Lead Capture (§4) | 95% | ✅ | Self-service source provenance lost |
| Intake Form (§5) | 70% | ❌ | Blob storage, optional required-fields, missing client fields |
| Site Visit (§6) | 80% | ⚠️ | No on-site photos; cost factors don't auto-price |
| Quotation (§7) | 90% | ✅ | Strong; BOQ not borehole-driven; dual Type-1 |
| Automation (§8) | 60% | ❌ | **Cron unscheduled** → most time-based triggers dead |
| Roles & Permissions (§9) | 50% | ❌ | **RLS escalation + role-source mismatch** |
| Dashboard (§10) | 80% | ✅ | Global not per-user; conversion denominator |
| Payment & Mobilization (§11) | 75% | ❌ | **Confirmation schema not in migrations**; no escalation loop |
| Integrations (§13) | 90% | ❌ | Code wired; **secrets are dummies** |

**Overall: feature-complete (~85%), production-ready (~55%).** The delta is concentrated in the six CRITICAL infra/security items, not in missing UI.
