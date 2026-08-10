import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '../../env';
import { asyncHandler } from '../../lib/http';
import { forbidden } from '../../lib/errors';
import { supabaseAdmin } from '../../lib/supabase';
import { sendEmail } from '../../integrations/email';
import { sendWhatsApp } from '../../integrations/whatsapp';

/**
 * Scheduled jobs — multi-tenant aware. Runs cross-org via the service-role client
 * (BYPASSRLS), deriving org_id from each row, resolving that org's admins +
 * settings + send credentials, and stamping org_id on every insert.
 * Trigger from Railway Cron with header  X-Cron-Secret: <CRON_SECRET>.
 */
const sb = supabaseAdmin;

function requireCron(req: Request, _res: Response, next: NextFunction): void {
  const secret = req.header('X-Cron-Secret');
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) return next(forbidden('Invalid cron secret'));
  next();
}

export const cronRouter = Router();
cronRouter.use(requireCron);

cronRouter.post('/daily', asyncHandler(async (_req, res) => res.json(await runDaily())));
cronRouter.post('/weekly', asyncHandler(async (_req, res) => res.json(await runWeekly())));
// Daily follow-up digest — schedule this at 11:00 (Asia/Kolkata).
cronRouter.post('/followup-digest', asyncHandler(async (_req, res) => res.json(await runFollowUpDigest())));

// ── Per-org helpers (caches are per cron invocation) ─────────────────────────
type NotifPayload = { type: string; title: string; body: string; enquiry_id?: string | null; link?: string | null };

function makeOrgHelpers() {
  const settingsCache = new Map<string, Record<string, string>>();
  const adminCache = new Map<string, string[]>();

  async function orgSettings(orgId: string): Promise<Record<string, string>> {
    const hit = settingsCache.get(orgId);
    if (hit) return hit;
    const { data } = await sb.from('app_settings').select('key, value').eq('org_id', orgId);
    const m: Record<string, string> = {};
    for (const r of data ?? []) m[r.key] = r.value;
    settingsCache.set(orgId, m);
    return m;
  }

  async function orgAdminIds(orgId: string): Promise<string[]> {
    const hit = adminCache.get(orgId);
    if (hit) return hit;
    const { data } = await sb
      .from('profiles')
      .select('id')
      .eq('org_id', orgId)
      .in('role', ['super_admin', 'admin'])
      .eq('is_active', true);
    const ids = (data ?? []).map((p: { id: string }) => p.id);
    adminCache.set(orgId, ids);
    return ids;
  }

  async function notifyAdmins(orgId: string, p: NotifPayload): Promise<void> {
    for (const uid of await orgAdminIds(orgId)) {
      await sb.from('notifications').insert({ ...p, user_id: uid, org_id: orgId });
    }
  }

  // Resolve active org users (id/name/email/phone) for the given roles.
  async function orgRoleUsers(
    orgId: string,
    roles: string[],
  ): Promise<Array<{ id: string; full_name: string | null; email: string | null; phone: string | null }>> {
    const { data } = await sb
      .from('profiles')
      .select('id, full_name, email, phone')
      .eq('org_id', orgId)
      .in('role', roles)
      .eq('is_active', true);
    return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null; phone: string | null }>;
  }

  return { orgSettings, orgAdminIds, notifyAdmins, orgRoleUsers };
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Daily follow-up digest — ONE email per org listing every follow-up still
 * pending today (plus anything overdue), with the client/company and contact
 * details, sent to the staff chosen in Settings. Intended for an 11:00 IST
 * schedule. Unlike the per-follow-up reminder it does not touch reminder_sent,
 * so the digest keeps listing an item until it is actually actioned.
 */
async function runFollowUpDigest(): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split('T')[0]!;
  const results: Record<string, unknown> = { date: today };
  const appUrl = env.APP_URL || 'https://qms.globalgeoconsultancy.com';
  const { orgSettings } = makeOrgHelpers();

  try {
    const { data: dueRaw } = await sb
      .from('follow_ups')
      .select('id, org_id, enquiry_id, scheduled_date, notes, assigned_to, enquiries(ref_number, site_city, clients(name, company, phone, email))')
      .lte('scheduled_date', today)
      .eq('outcome', 'pending')
      .order('scheduled_date', { ascending: true });
    const due = (dueRaw ?? []) as any[];

    // Group by org.
    const byOrg = new Map<string, Array<Record<string, unknown>>>();
    for (const fu of due) {
      const org = fu.org_id as string | null;
      const enq = fu.enquiries as any;
      if (!org || !enq) continue;
      const client = enq.clients as any;
      const list = byOrg.get(org) ?? [];
      list.push({
        ref_number: enq.ref_number ?? '—',
        client_name: client?.name ?? 'Client',
        company: client?.company ?? null,
        phone: client?.phone ?? null,
        email: client?.email ?? null,
        site_city: enq.site_city ?? null,
        scheduled_date: fu.scheduled_date,
        notes: fu.notes ?? null,
        is_overdue: String(fu.scheduled_date) < today,
        assigned_to: (fu.assigned_to as string | null) ?? null,
      });
      byOrg.set(org, list);
    }

    // Resolve assignee uuids to names once per run.
    const assigneeIds = [
      ...new Set(
        [...byOrg.values()].flat().map((i) => i.assigned_to as string | null).filter((v): v is string => !!v),
      ),
    ];
    const nameById = new Map<string, string>();
    if (assigneeIds.length) {
      const { data: profs } = await sb.from('profiles').select('id, full_name, email').in('id', assigneeIds);
      for (const p of profs ?? []) {
        nameById.set(p.id as string, (p.full_name as string) || String(p.email ?? '').split('@')[0] || 'Staff');
      }
    }

    const sent: Array<Record<string, unknown>> = [];
    for (const [org, items] of byOrg) {
      const settings = await orgSettings(org);
      if (settings.auto_followup_digest === 'false') {
        sent.push({ org, skipped: 'disabled' });
        continue;
      }
      // Recipients: the staff picked in Settings, else fall back to admin_email.
      const recipients = (settings.followup_digest_recipients ?? settings.admin_email ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (recipients.length === 0) {
        sent.push({ org, skipped: 'no_recipients' });
        continue;
      }

      const withNames = items.map((i) => ({
        ...i,
        assigned_to: i.assigned_to ? nameById.get(i.assigned_to as string) ?? null : null,
      })) as never;

      const r = await sendEmail({
        to: recipients,
        orgId: org,
        template: 'followup_digest',
        params: { date: today, items: withNames, app_url: appUrl },
      });
      sent.push({ org, recipients: recipients.length, items: items.length, ok: !('error' in (r ?? {})) });
    }

    results.followup_digest = { orgs: byOrg.size, sent };
  } catch (err) {
    results.followup_digest = { error: (err as Error).message };
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
async function runDaily(): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split('T')[0]!;
  const results: Record<string, unknown> = { date: today };
  const appUrl = env.APP_URL || 'https://qms.globalgeoconsultancy.com';
  const { orgSettings, orgAdminIds, notifyAdmins, orgRoleUsers } = makeOrgHelpers();
  const dayOffset = (fromDate: string) =>
    Math.floor((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${String(fromDate).slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000);

  // 1. Follow-up reminders
  try {
    const { data: due } = await sb
      .from('follow_ups')
      .select('id, org_id, enquiry_id, scheduled_date, notes, enquiries(ref_number, client_id, clients(name, email, whatsapp_number, whatsapp_invalid))')
      .lte('scheduled_date', today)
      .eq('outcome', 'pending')
      .eq('reminder_sent', false);
    let n = 0;
    for (const fu of due ?? []) {
      const enq = fu.enquiries as any;
      if (!enq || !fu.org_id) continue;
      const org = fu.org_id as string;
      const client = enq.clients as any;
      const ref = enq.ref_number;
      const isOverdue = fu.scheduled_date < today;
      const label = isOverdue ? 'Overdue Follow-up' : 'Follow-up Due Today';
      await notifyAdmins(org, {
        type: 'follow_up_reminder',
        title: `${label} — ${ref}`,
        body: `${client?.name ?? 'Client'}: ${fu.notes ?? 'Scheduled follow-up'}`,
        enquiry_id: fu.enquiry_id,
        link: `/enquiries/${fu.enquiry_id}`,
      });
      const settings = await orgSettings(org);
      if (settings.admin_email && settings.auto_followup_reminder === 'true') {
        await sendEmail({
          to: settings.admin_email,
          orgId: org,
          template: 'followup_reminder',
          params: { ref_number: ref, client_name: client?.name, scheduled_date: fu.scheduled_date, notes: fu.notes, is_overdue: isOverdue },
        });
      }
      await sb.from('follow_ups').update({ reminder_sent: true }).eq('id', fu.id);
      n++;
    }
    results.follow_ups = { processed: n };
  } catch (err) {
    results.follow_ups = { error: (err as Error).message };
  }

  // 2. Job reminders
  try {
    const { data: due } = await sb
      .from('job_reminders')
      .select('id, org_id, enquiry_id, reminder_type, days_before, target_date, enquiries(ref_number, client_id, clients(name))')
      .eq('scheduled_for', today)
      .eq('sent', false);
    let n = 0;
    for (const jr of due ?? []) {
      const enq = jr.enquiries as any;
      if (!enq || !jr.org_id) continue;
      const org = jr.org_id as string;
      const client = enq.clients as any;
      const typeLabel = jr.reminder_type.replace(/_/g, ' ');
      await notifyAdmins(org, {
        type: 'job_reminder',
        title: `${jr.days_before}-day Reminder — ${enq.ref_number}`,
        body: `${typeLabel} due ${jr.target_date} for ${client?.name ?? 'client'}`,
        enquiry_id: jr.enquiry_id,
        link: `/enquiries/${jr.enquiry_id}`,
      });
      const settings = await orgSettings(org);
      if (settings.admin_email) {
        await sendEmail({
          to: settings.admin_email,
          orgId: org,
          template: 'job_reminder',
          params: { ref_number: enq.ref_number, client_name: client?.name, type_label: typeLabel, days_before: jr.days_before, target_date: jr.target_date },
        });
      }
      await sb.from('job_reminders').update({ sent: true, sent_at: new Date().toISOString() }).eq('id', jr.id);
      n++;
    }
    results.job_reminders = { processed: n };
  } catch (err) {
    results.job_reminders = { error: (err as Error).message };
  }

  // 3. Payment reminders (overdue advance requests)
  try {
    const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const { data: overdue } = await sb
      .from('payments')
      .select('id, org_id, enquiry_id, amount_requested, payment_type, request_sent_at, enquiries(ref_number, site_address, client_id, clients(name, company, email, whatsapp_number, whatsapp_invalid, email_bounced))')
      .eq('status', 'request_sent')
      .lt('request_sent_at', cutoff);
    let n = 0;
    for (const pmt of overdue ?? []) {
      const enq = pmt.enquiries as any;
      if (!enq || !pmt.org_id) continue;
      const org = pmt.org_id as string;
      const settings = await orgSettings(org);
      if (settings.auto_payment_reminder !== 'true') continue; // per-org opt-in
      const client = enq.clients as any;
      const ref = enq.ref_number;
      const amt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(pmt.amount_requested);
      await notifyAdmins(org, {
        type: 'payment_overdue',
        title: `Payment Overdue — ${ref}`,
        body: `${amt} ${pmt.payment_type} from ${client?.name ?? 'client'} — requested ${pmt.request_sent_at?.split('T')[0]}`,
        enquiry_id: pmt.enquiry_id,
        link: `/enquiries/${pmt.enquiry_id}`,
      });
      const payPrefix = [client?.company?.trim?.(), (enq.site_address as string | null)?.trim?.()].filter(Boolean).join(' — ') || undefined;
      if (client?.email && !client.email_bounced) {
        await sendEmail({ to: client.email, orgId: org, template: 'payment_reminder', subject_prefix: payPrefix, params: { ref_number: ref, client_name: client.name, amount: amt, payment_type: pmt.payment_type } });
        await sb.from('communication_log').insert({ org_id: org, enquiry_id: pmt.enquiry_id, client_id: enq.client_id, channel: 'email', direction: 'outbound', subject: `Payment Reminder — ${ref}`, body: `Automated payment reminder for ${amt} ${pmt.payment_type}`, status: 'sent' });
      }
      if (client?.whatsapp_number && !client.whatsapp_invalid) {
        await sendWhatsApp({ phone_number: client.whatsapp_number, orgId: org, template_name: 'qms_payment_reminder', parameters: [{ name: 'client_name', value: client.name }, { name: 'ref_number', value: ref }, { name: 'amount', value: amt }] });
        await sb.from('communication_log').insert({ org_id: org, enquiry_id: pmt.enquiry_id, client_id: enq.client_id, channel: 'whatsapp', direction: 'outbound', subject: `Payment Reminder — ${ref}`, body: `Automated payment reminder for ${amt} ${pmt.payment_type}`, status: 'sent' });
      }
      n++;
    }
    results.payments = { processed: n };
  } catch (err) {
    results.payments = { error: (err as Error).message };
  }

  // 4. Cleanup conditional follow-ups past the follow-up stage
  try {
    const { data: conditional } = await sb
      .from('follow_ups')
      .select('id, enquiry_id, enquiries(status)')
      .eq('outcome', 'pending')
      .eq('is_conditional', true);
    let n = 0;
    const past = ['approved', 'payment_received', 'mobilization_scheduled', 'job_active', 'confirmed', 'completed', 'lost', 'inactive'];
    for (const fu of conditional ?? []) {
      const enq = fu.enquiries as any;
      if (enq && past.includes(enq.status)) {
        await sb.from('follow_ups').update({ outcome: 'closed' }).eq('id', fu.id);
        n++;
      }
    }
    results.conditional_followup_cleanup = { processed: n };
  } catch (err) {
    results.conditional_followup_cleanup = { error: (err as Error).message };
  }

  // 5. Expire mobilisation confirmation tokens + escalate (to the org's mob leads)
  try {
    const { data: expired } = await sb
      .from('mob_confirmation_tokens')
      .select('id, org_id, enquiry_id, enquiries(ref_number)')
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString());
    let n = 0;
    for (const tok of expired ?? []) {
      if (!tok.org_id) continue;
      const org = tok.org_id as string;
      await sb.from('mob_confirmation_tokens').update({ status: 'expired' }).eq('id', tok.id);
      const ref = (tok.enquiries as any)?.ref_number ?? '';
      const { data: leads } = await sb.from('profiles').select('id').eq('org_id', org).eq('role', 'mobilization_lead').eq('is_active', true);
      let targets = (leads ?? []).map((l: { id: string }) => l.id);
      if (targets.length === 0) targets = await orgAdminIds(org);
      for (const uid of targets) {
        await sb.from('notifications').insert({
          org_id: org,
          user_id: uid,
          type: 'mobilization_unconfirmed',
          title: `Mobilisation Not Confirmed — ${ref}`,
          body: 'The client did not confirm the mobilisation date within the window. Please follow up and re-issue the confirmation link.',
          enquiry_id: tok.enquiry_id,
          link: `/enquiries/${tok.enquiry_id}`,
        });
      }
      await sb.from('enquiry_events').insert({ org_id: org, enquiry_id: tok.enquiry_id, event_type: 'mobilisation_unconfirmed', metadata: { reason: 'confirmation_token_expired', triggered_by: 'daily-cron' } });
      n++;
    }
    results.mob_token_expiry = { processed: n };
  } catch (err) {
    results.mob_token_expiry = { error: (err as Error).message };
  }

  // 6. Auto-expire stale enquiries (no activity 30d)
  try {
    const staleCutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: stale } = await sb
      .from('enquiries')
      .select('id, org_id, ref_number, status')
      .in('status', ['new', 'pending', 'sent', 'follow_up', 'negotiation'])
      .lt('updated_at', staleCutoff)
      .is('deleted_at', null);
    let n = 0;
    for (const enq of stale ?? []) {
      if (!enq.org_id) continue;
      await sb.from('enquiries').update({ status: 'inactive', lost_reason: 'Auto-expired: no activity for 30 days', lost_date: today }).eq('id', enq.id);
      await sb.from('enquiry_events').insert({ org_id: enq.org_id, enquiry_id: enq.id, event_type: 'status_change', from_status: enq.status, to_status: 'inactive', metadata: { reason: 'auto_expired_30_days', triggered_by: 'daily-cron' } });
      n++;
    }
    results.auto_expired = { processed: n };
  } catch (err) {
    results.auto_expired = { error: (err as Error).message };
  }

  // 7. Intake reminders (Day 3 nudge, Day 7 final + admin alert)
  try {
    const { data: pendingTokens } = await sb
      .from('intake_tokens')
      .select('id, org_id, token, client_id, created_at, expires_at, clients(name, email, whatsapp_number, whatsapp_invalid, email_bounced, phone)')
      .eq('status', 'active');
    let n = 0;
    for (const tk of pendingTokens ?? []) {
      const client = (tk as any).clients as any;
      if (!client || !tk.org_id) continue;
      const org = tk.org_id as string;
      const daysSince = Math.floor((Date.now() - new Date(tk.created_at).getTime()) / 86_400_000);
      const expiresDate = tk.expires_at.split('T')[0];
      const isExpiringToday = expiresDate === today;
      const intakeUrl = `${appUrl}/intake?t=${tk.token}`;
      const { data: linked } = await sb
        .from('enquiries')
        .select('id, ref_number')
        .eq('client_id', tk.client_id)
        .in('status', ['new', 'intake_pending'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const ref = linked?.ref_number ?? 'Intake Form';
      const settings = await orgSettings(org);

      if (daysSince === 3) {
        if (client.email && !client.email_bounced) await sendEmail({ to: client.email, orgId: org, template: 'intake_reminder', params: { client_name: client.name, ref_number: ref, intake_url: intakeUrl, is_final: false } });
        if (client.whatsapp_number && !client.whatsapp_invalid) await sendWhatsApp({ phone_number: client.whatsapp_number, orgId: org, template_name: 'qms_intake_reminder', parameters: [{ name: 'client_name', value: client.name }, { name: 'ref_number', value: ref }, { name: 'link', value: intakeUrl }] });
        if (linked) await sb.from('communication_log').insert({ org_id: org, enquiry_id: linked.id, client_id: tk.client_id, channel: 'email', direction: 'outbound', subject: `Intake Reminder (Day 3) — ${ref}`, body: `Automated Day 3 reminder sent to ${client.name}`, status: 'sent' });
        n++;
      }

      if (isExpiringToday) {
        if (client.email && !client.email_bounced) await sendEmail({ to: client.email, orgId: org, template: 'intake_reminder', params: { client_name: client.name, ref_number: ref, intake_url: intakeUrl, is_final: true } });
        if (client.whatsapp_number && !client.whatsapp_invalid) await sendWhatsApp({ phone_number: client.whatsapp_number, orgId: org, template_name: 'qms_intake_expiring', parameters: [{ name: 'client_name', value: client.name }, { name: 'ref_number', value: ref }, { name: 'link', value: intakeUrl }] });
        await notifyAdmins(org, { type: 'intake_expiring', title: `Intake Not Filled — ${ref}`, body: `${client.name} has not filled the intake form. Link expires today.`, enquiry_id: linked?.id ?? null, link: linked ? `/enquiries/${linked.id}` : null });
        if (settings.admin_email) await sendEmail({ to: settings.admin_email, orgId: org, template: 'intake_expiry_admin', params: { ref_number: ref, client_name: client.name, client_phone: client.phone ?? client.whatsapp_number ?? '—', expiry_date: expiresDate } });
        if (linked) {
          await sb.from('follow_ups').insert({ org_id: org, enquiry_id: linked.id, scheduled_date: today, notes: `Client ${client.name} did not fill intake form (link expiring today).`, outcome: 'pending', reminder_sent: false });
          await sb.from('communication_log').insert({ org_id: org, enquiry_id: linked.id, client_id: tk.client_id, channel: 'email', direction: 'outbound', subject: `Intake Final Reminder (Day 7) — ${ref}`, body: `Automated final reminder sent to ${client.name}. Admin notified.`, status: 'sent' });
        }
        n++;
      }
    }
    results.intake_reminders = { processed: n };
  } catch (err) {
    results.intake_reminders = { error: (err as Error).message };
  }

  // 8. Missed-call morning prompt
  try {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
    const { data: missed } = await sb
      .from('enquiries')
      .select('id, org_id, ref_number, client_id, clients(name, phone)')
      .eq('lead_source', 'missed_call')
      .eq('status', 'new')
      .gte('created_at', `${yesterday}T00:00:00.000Z`)
      .lte('created_at', `${yesterday}T23:59:59.999Z`)
      .is('deleted_at', null);
    let n = 0;
    for (const enq of missed ?? []) {
      if (!enq.org_id) continue;
      const org = enq.org_id as string;
      const client = (enq as any).clients as any;
      await notifyAdmins(org, { type: 'morning_prompt', title: `Missed Call Follow-up — ${enq.ref_number}`, body: `Return call to ${client?.name ?? 'Unknown'} (${client?.phone ?? '—'})`, enquiry_id: enq.id, link: `/enquiries/${enq.id}` });
      await sb.from('follow_ups').insert({ org_id: org, enquiry_id: enq.id, scheduled_date: today, notes: `Return missed call from yesterday — ${client?.name ?? 'Unknown'} (${client?.phone ?? '—'})`, outcome: 'pending', reminder_sent: false });
      n++;
    }
    results.missed_call_prompts = { processed: n };
  } catch (err) {
    results.missed_call_prompts = { error: (err as Error).message };
  }

  // 9. Site-visit-day notifications to geologist + the org's admins
  try {
    const { data: visits } = await sb
      .from('site_visits')
      .select('id, org_id, visit_date, token, geologist_id, geologist_member_id, supervisor_member_id, observations, enquiries(id, ref_number, site_address, site_city, structure_type, num_bores, expected_depth_m, client_id, clients(name, phone, email, company))')
      .eq('visit_date', today)
      .eq('status', 'scheduled')
      .eq('notification_sent', false);
    let n = 0;
    for (const sv of visits ?? []) {
      const enq = sv.enquiries as any;
      if (!enq || !sv.org_id) continue;
      const org = sv.org_id as string;
      const client = enq.clients as any;
      const ref = enq.ref_number;
      const formUrl = `${appUrl}/site-visit?t=${sv.token}`;
      const siteAddress = enq.site_address || enq.site_city;
      const contactName = client?.name ?? 'Client';
      const contactPhone = client?.phone ?? '—';
      const initialNotes = (sv.observations as any)?.notes ?? '';
      const settings = await orgSettings(org);

      let geoPhone: string | null = null;
      let geoEmail: string | null = null;
      let geoName = 'Team';
      // Geologist now comes from the Team Directory (team_members) when assigned
      // there; fall back to the legacy profile link for older visits.
      if ((sv as any).geologist_member_id) {
        const { data: gm } = await sb.from('team_members').select('full_name, phone, email').eq('id', (sv as any).geologist_member_id).single();
        if (gm) { geoName = gm.full_name ?? 'Team'; geoPhone = gm.phone; geoEmail = gm.email; }
      } else if (sv.geologist_id) {
        const { data: geo } = await sb.from('profiles').select('full_name, phone, email').eq('id', sv.geologist_id).single();
        if (geo) { geoName = geo.full_name ?? 'Team'; geoPhone = geo.phone; geoEmail = geo.email; }
      }
      // Supervisor name for the notification (contact stored in the directory).
      let supervisorName = '';
      if ((sv as any).supervisor_member_id) {
        const { data: sm } = await sb.from('team_members').select('full_name').eq('id', (sv as any).supervisor_member_id).single();
        supervisorName = sm?.full_name ?? '';
      }
      const waParams = [
        { name: 'geologist_name', value: geoName },
        { name: 'ref_number', value: ref },
        { name: 'client_name', value: contactName },
        { name: 'client_phone', value: contactPhone },
        { name: 'site_address', value: siteAddress },
        { name: 'form_url', value: formUrl },
      ];
      if (geoPhone) await sendWhatsApp({ phone_number: geoPhone, orgId: org, template_name: 'qms_site_visit_today', parameters: waParams });
      if (settings.admin_whatsapp) await sendWhatsApp({ phone_number: settings.admin_whatsapp, orgId: org, template_name: 'qms_site_visit_today', parameters: waParams });
      const notesWithSup = [initialNotes, supervisorName && `Supervisor: ${supervisorName}`].filter(Boolean).join(' · ');
      const emailParams = { ref_number: ref, geologist_name: geoName, client_name: contactName, client_phone: contactPhone, client_email: client?.email, site_address: siteAddress, structure_type: enq.structure_type, num_bores: enq.num_bores, depth_m: enq.expected_depth_m, notes: notesWithSup, form_url: formUrl };
      if (geoEmail) await sendEmail({ to: geoEmail, orgId: org, template: 'site_visit_today', params: emailParams });
      if (settings.admin_email) await sendEmail({ to: settings.admin_email, orgId: org, template: 'site_visit_today', params: emailParams });
      await notifyAdmins(org, { type: 'site_visit_today', title: `Site Visit Today — ${ref}`, body: `${geoName} visiting ${siteAddress} for ${contactName}${supervisorName ? ` · Supervisor: ${supervisorName}` : ''}`, enquiry_id: enq.id, link: `/enquiries/${enq.id}` });
      if (sv.geologist_id) await sb.from('notifications').insert({ org_id: org, user_id: sv.geologist_id, type: 'site_visit_today', title: `Your Site Visit Today — ${ref}`, body: `Visit ${siteAddress} — Contact: ${contactName} (${contactPhone})`, enquiry_id: enq.id, link: `/enquiries/${enq.id}` });
      await sb.from('site_visits').update({ notification_sent: true, notification_sent_at: new Date().toISOString() }).eq('id', sv.id);
      await sb.from('communication_log').insert({ org_id: org, enquiry_id: enq.id, client_id: enq.client_id, channel: 'whatsapp', direction: 'outbound', subject: `Site Visit Reminder — ${ref}`, body: `Automated site visit reminder sent to ${geoName} for ${siteAddress}`, status: 'sent' });
      n++;
    }
    results.site_visit_notifications = { processed: n };
  } catch (err) {
    results.site_visit_notifications = { error: (err as Error).message };
  }

  // 10. Field-work → sample-submission reminders (#7): daily for 3 days after the
  //     field work completion date, to the Site Supervisor (mobilisation team lead)
  //     + the Execution Team, until samples are marked submitted.
  try {
    const { data: jobs } = await sb
      .from('job_completion')
      .select('id, org_id, enquiry_id, field_work_completion_date, enquiries(ref_number)')
      .not('field_work_completion_date', 'is', null)
      .eq('samples_submitted', false);
    let n = 0;
    for (const jc of jobs ?? []) {
      const org = jc.org_id as string | null;
      if (!org) continue;
      const off = dayOffset(jc.field_work_completion_date as string);
      if (off < 0 || off > 2) continue; // days 0,1,2
      const ref = (jc.enquiries as any)?.ref_number ?? '';
      const settings = await orgSettings(org);
      const link = `/enquiries/${jc.enquiry_id}`;
      const { data: mob } = await sb.from('mobilisation').select('team_lead_id').eq('enquiry_id', jc.enquiry_id).maybeSingle();
      const supId = mob?.team_lead_id as string | null;
      if (supId) {
        await sb.from('notifications').insert({
          org_id: org, user_id: supId, type: 'sample_submission_reminder', requires_ack: true,
          title: `Submit samples to lab — ${ref}`,
          body: `Field work completed on ${String(jc.field_work_completion_date).slice(0, 10)}. Please submit the samples to the laboratory (day ${off + 1} of 3).`,
          enquiry_id: jc.enquiry_id, link,
        });
        const { data: sup } = await sb.from('profiles').select('email').eq('id', supId).maybeSingle();
        if (sup?.email) {
          await sendEmail({
            to: sup.email, orgId: org, reply_to: settings.admin_email || undefined,
            subject: `Submit samples to lab — ${ref}`,
            html_body: `<p>Field work for <strong>${ref}</strong> completed on ${String(jc.field_work_completion_date).slice(0, 10)}.</p><p>Please submit the samples to the laboratory. This is day ${off + 1} of 3.</p>`,
          });
        }
      }
      // Execution Team FYI.
      for (const u of await orgRoleUsers(org, ['execution', 'execution_head'])) {
        if (u.id === supId) continue;
        await sb.from('notifications').insert({
          org_id: org, user_id: u.id, type: 'sample_submission_reminder',
          title: `Samples pending submission — ${ref}`,
          body: `Awaiting sample submission to the lab (day ${off + 1} of 3).`,
          enquiry_id: jc.enquiry_id, link,
        });
      }
      n++;
    }
    results.sample_submission_reminders = { processed: n };
  } catch (err) {
    results.sample_submission_reminders = { error: (err as Error).message };
  }

  // 11. Lab processing reminders (#8): alternate days (0,2,4) after samples were
  //     submitted, to the Lab Team, until lab processing is marked complete.
  try {
    const { data: jobs } = await sb
      .from('job_completion')
      .select('id, org_id, enquiry_id, samples_submitted_at, lab_assignee_id, lab_due_date, enquiries(ref_number)')
      .eq('samples_submitted', true)
      .eq('lab_processing_done', false);
    let n = 0;
    for (const jc of jobs ?? []) {
      const org = jc.org_id as string | null;
      if (!org || !jc.samples_submitted_at) continue;
      const off = dayOffset(jc.samples_submitted_at as string);
      if (off < 0 || off > 4 || off % 2 !== 0) continue; // days 0,2,4
      const ref = (jc.enquiries as any)?.ref_number ?? '';
      const settings = await orgSettings(org);
      const link = `/enquiries/${jc.enquiry_id}`;
      const labUsers = jc.lab_assignee_id
        ? [{ id: jc.lab_assignee_id as string, email: null as string | null }]
        : (await orgRoleUsers(org, ['lab'])).map((u) => ({ id: u.id, email: u.email }));
      for (const lu of labUsers) {
        await sb.from('notifications').insert({
          org_id: org, user_id: lu.id, type: 'lab_processing_reminder', requires_ack: true,
          title: `Lab processing due — ${ref}`,
          body: `Samples submitted on ${String(jc.samples_submitted_at).slice(0, 10)}. Please process and report by ${jc.lab_due_date ?? 'the due date'}.`,
          enquiry_id: jc.enquiry_id, link,
        });
        let email = lu.email;
        if (!email && jc.lab_assignee_id) {
          const { data: p } = await sb.from('profiles').select('email').eq('id', jc.lab_assignee_id).maybeSingle();
          email = p?.email ?? null;
        }
        if (email) {
          await sendEmail({
            to: email, orgId: org, reply_to: settings.admin_email || undefined,
            subject: `Lab processing due — ${ref}`,
            html_body: `<p>Samples for <strong>${ref}</strong> were submitted on ${String(jc.samples_submitted_at).slice(0, 10)}.</p><p>Please complete processing and reporting by <strong>${jc.lab_due_date ?? 'the due date'}</strong>.</p>`,
          });
        }
      }
      n++;
    }
    results.lab_processing_reminders = { processed: n };
  } catch (err) {
    results.lab_processing_reminders = { error: (err as Error).message };
  }

  // 12. Lab delay alert (#8): past the lab due date and still not complete → WhatsApp
  //     to Admin + Manager (execution_head) + in-app. Inert without WATI creds.
  try {
    const { data: jobs } = await sb
      .from('job_completion')
      .select('id, org_id, enquiry_id, lab_due_date, enquiries(ref_number)')
      .eq('samples_submitted', true)
      .eq('lab_processing_done', false)
      .lt('lab_due_date', today);
    let n = 0;
    for (const jc of jobs ?? []) {
      const org = jc.org_id as string | null;
      if (!org) continue;
      const ref = (jc.enquiries as any)?.ref_number ?? '';
      const settings = await orgSettings(org);
      await notifyAdmins(org, {
        type: 'lab_delay', title: `Lab processing delayed — ${ref}`,
        body: `Laboratory processing is past its due date (${jc.lab_due_date}). Please follow up with the Lab Team.`,
        enquiry_id: jc.enquiry_id, link: `/enquiries/${jc.enquiry_id}`,
      });
      const waParams = [
        { name: 'ref_number', value: ref },
        { name: 'due_date', value: String(jc.lab_due_date ?? '') },
      ];
      const phones = new Set<string>();
      if (settings.admin_whatsapp) phones.add(settings.admin_whatsapp);
      for (const m of await orgRoleUsers(org, ['execution_head'])) if (m.phone) phones.add(m.phone);
      for (const phone of phones) {
        await sendWhatsApp({ phone_number: phone, orgId: org, template_name: 'qms_lab_delay', parameters: waParams });
      }
      n++;
    }
    results.lab_delay_alerts = { processed: n };
  } catch (err) {
    results.lab_delay_alerts = { error: (err as Error).message };
  }

  // 13. Re-nudge admins about reminders left unacknowledged > 1 day (#4).
  try {
    const cutoff = new Date(Date.now() - 86_400_000).toISOString();
    const { data: stale } = await sb
      .from('notifications')
      .select('org_id')
      .eq('requires_ack', true)
      .is('acknowledged_at', null)
      .lt('created_at', cutoff);
    const byOrg = new Map<string, number>();
    for (const r of stale ?? []) {
      const org = r.org_id as string | null;
      if (org) byOrg.set(org, (byOrg.get(org) ?? 0) + 1);
    }
    for (const [org, count] of byOrg) {
      await notifyAdmins(org, {
        type: 'ack_pending', title: `${count} reminder${count === 1 ? '' : 's'} awaiting response`,
        body: `${count} reminder${count === 1 ? ' has' : 's have'} not been acknowledged for over a day. Review who still needs to respond.`,
        link: '/dashboard',
      });
    }
    results.ack_renudge = { orgs: byOrg.size };
  } catch (err) {
    results.ack_renudge = { error: (err as Error).message };
  }

  return { success: true, ...results };
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly summary — one email per active org, to that org's admin_email.
async function runWeekly(): Promise<Record<string, unknown>> {
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const todayStr = now.toISOString().split('T')[0]!;

  const { data: orgs } = await sb.from('organizations').select('id, name').eq('status', 'active');
  const perOrg: Array<Record<string, unknown>> = [];

  for (const org of orgs ?? []) {
    const orgId = org.id as string;
    const { data: settingsRow } = await sb.from('app_settings').select('value').eq('org_id', orgId).eq('key', 'admin_email').maybeSingle();
    const adminEmail = settingsRow?.value;

    const { count: newEnquiries } = await sb.from('enquiries').select('id', { count: 'exact', head: true }).eq('org_id', orgId).gte('created_at', weekStart).is('deleted_at', null);
    const { data: allEnquiries } = await sb.from('enquiries').select('status').eq('org_id', orgId).is('deleted_at', null);
    const statusCounts: Record<string, number> = {};
    for (const e of allEnquiries ?? []) statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
    const { count: quotationsSent } = await sb.from('quotations').select('id', { count: 'exact', head: true }).eq('org_id', orgId).gte('sent_at', weekStart);
    const { data: weekPayments } = await sb.from('payments').select('amount_received').eq('org_id', orgId).eq('status', 'received').gte('received_at', weekStart);
    const totalReceived = (weekPayments ?? []).reduce((s: number, p: { amount_received: number | null }) => s + (p.amount_received ?? 0), 0);
    const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(totalReceived);
    const { count: overdueFollowUps } = await sb.from('follow_ups').select('id', { count: 'exact', head: true }).eq('org_id', orgId).lt('scheduled_date', todayStr).eq('outcome', 'pending');
    const { count: pendingPayments } = await sb.from('payments').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'request_sent');

    let emailSent = false;
    if (adminEmail) {
      const r = await sendEmail({
        to: adminEmail,
        orgId,
        template: 'weekly_summary',
        params: {
          week_ending: todayStr,
          new_enquiries: newEnquiries ?? 0,
          quotations_sent: quotationsSent ?? 0,
          revenue: inr,
          status_counts: statusCounts,
          overdue_follow_ups: overdueFollowUps ?? 0,
          pending_payments: pendingPayments ?? 0,
        },
      });
      emailSent = r.success;
    }
    perOrg.push({ org: org.name, email_sent: emailSent, new_enquiries: newEnquiries ?? 0, revenue_collected: totalReceived });
  }

  return { success: true, orgs: perOrg };
}
