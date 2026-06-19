import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const sb = createClient(supabaseUrl, serviceRoleKey)

  const today = new Date().toISOString().split('T')[0]
  const results: Record<string, unknown> = { date: today }

  // ── Load settings ──
  const { data: settingsRows } = await sb
    .from('app_settings')
    .select('key, value')
    .in('key', ['admin_email', 'admin_whatsapp', 'auto_payment_reminder', 'auto_followup_reminder'])

  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) settings[row.key] = row.value

  // ── Get admin user ID for notifications ──
  const { data: adminUsers } = await sb.auth.admin.listUsers({ perPage: 1 })
  const adminUserId = adminUsers?.users?.[0]?.id

  // ── 1. Follow-up Reminders ──
  try {
    const { data: dueFollowUps } = await sb
      .from('follow_ups')
      .select('id, enquiry_id, scheduled_date, notes, enquiries(ref_number, client_id, clients(name, email, whatsapp_number, whatsapp_invalid))')
      .lte('scheduled_date', today)
      .eq('outcome', 'pending')
      .eq('reminder_sent', false)

    let followUpCount = 0

    for (const fu of dueFollowUps ?? []) {
      const enq = fu.enquiries as any
      if (!enq) continue
      const client = enq.clients as any
      const ref = enq.ref_number
      const isOverdue = fu.scheduled_date < today
      const label = isOverdue ? 'Overdue Follow-up' : 'Follow-up Due Today'

      // Create in-app notification
      if (adminUserId) {
        await sb.from('notifications').insert({
          user_id: adminUserId,
          type: 'follow_up_reminder',
          title: `${label} — ${ref}`,
          body: `${client?.name ?? 'Client'}: ${fu.notes ?? 'Scheduled follow-up'}`,
          enquiry_id: fu.enquiry_id,
          link: `/enquiries/${fu.enquiry_id}`,
        })
      }

      // Send email to admin
      if (settings.admin_email && settings.auto_followup_reminder === 'true') {
        await sendEmail(supabaseUrl, serviceRoleKey, {
          to: settings.admin_email,
          template: 'followup_reminder',
          params: { ref_number: ref, client_name: client?.name, scheduled_date: fu.scheduled_date, notes: fu.notes, is_overdue: isOverdue },
        })
      }

      // Mark reminder as sent
      await sb.from('follow_ups').update({ reminder_sent: true }).eq('id', fu.id)
      followUpCount++
    }

    results.follow_ups = { processed: followUpCount }
  } catch (err) {
    results.follow_ups = { error: (err as Error).message }
  }

  // ── 2. Job Reminders ──
  try {
    const { data: dueReminders } = await sb
      .from('job_reminders')
      .select('id, enquiry_id, reminder_type, days_before, target_date, enquiries(ref_number, client_id, clients(name))')
      .eq('scheduled_for', today)
      .eq('sent', false)

    let jobReminderCount = 0

    for (const jr of dueReminders ?? []) {
      const enq = jr.enquiries as any
      if (!enq) continue
      const ref = enq.ref_number
      const client = enq.clients as any
      const typeLabel = jr.reminder_type.replace(/_/g, ' ')

      // Create in-app notification
      if (adminUserId) {
        await sb.from('notifications').insert({
          user_id: adminUserId,
          type: 'job_reminder',
          title: `${jr.days_before}-day Reminder — ${ref}`,
          body: `${typeLabel} due ${jr.target_date} for ${client?.name ?? 'client'}`,
          enquiry_id: jr.enquiry_id,
          link: `/enquiries/${jr.enquiry_id}`,
        })
      }

      // Send email to admin
      if (settings.admin_email) {
        await sendEmail(supabaseUrl, serviceRoleKey, {
          to: settings.admin_email,
          template: 'job_reminder',
          params: { ref_number: ref, client_name: client?.name, type_label: typeLabel, days_before: jr.days_before, target_date: jr.target_date },
        })
      }

      // Mark as sent
      await sb.from('job_reminders').update({ sent: true, sent_at: new Date().toISOString() }).eq('id', jr.id)
      jobReminderCount++
    }

    results.job_reminders = { processed: jobReminderCount }
  } catch (err) {
    results.job_reminders = { error: (err as Error).message }
  }

  // ── 3. Payment Reminders (overdue advance requests) ──
  try {
    if (settings.auto_payment_reminder === 'true') {
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      const cutoff = threeDaysAgo.toISOString()

      const { data: overduePayments } = await sb
        .from('payments')
        .select('id, enquiry_id, amount_requested, payment_type, request_sent_at, enquiries(ref_number, client_id, clients(name, email, whatsapp_number, whatsapp_invalid))')
        .eq('status', 'request_sent')
        .lt('request_sent_at', cutoff)

      let paymentCount = 0

      for (const pmt of overduePayments ?? []) {
        const enq = pmt.enquiries as any
        if (!enq) continue
        const client = enq.clients as any
        const ref = enq.ref_number
        const amt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(pmt.amount_requested)

        // Create in-app notification
        if (adminUserId) {
          await sb.from('notifications').insert({
            user_id: adminUserId,
            type: 'payment_overdue',
            title: `Payment Overdue — ${ref}`,
            body: `${amt} ${pmt.payment_type} from ${client?.name ?? 'client'} — requested ${pmt.request_sent_at?.split('T')[0]}`,
            enquiry_id: pmt.enquiry_id,
            link: `/enquiries/${pmt.enquiry_id}`,
          })
        }

        // Send reminder email to client
        if (client?.email && !client.email_bounced) {
          await sendEmail(supabaseUrl, serviceRoleKey, {
            to: client.email,
            template: 'payment_reminder',
            params: { ref_number: ref, client_name: client.name, amount: amt, payment_type: pmt.payment_type },
          })

          // Log communication
          await sb.from('communication_log').insert({
            enquiry_id: pmt.enquiry_id,
            client_id: enq.client_id,
            channel: 'email',
            direction: 'outbound',
            subject: `Payment Reminder — ${ref}`,
            body: `Automated payment reminder for ${amt} ${pmt.payment_type}`,
            status: 'sent',
          })
        }

        // Send WhatsApp reminder to client
        if (client?.whatsapp_number && !client.whatsapp_invalid) {
          await sendWhatsApp(supabaseUrl, serviceRoleKey, {
            phone_number: client.whatsapp_number,
            template_name: 'qms_payment_reminder',
            parameters: [{ name: 'client_name', value: client.name }, { name: 'ref_number', value: ref }, { name: 'amount', value: amt }],
          })

          await sb.from('communication_log').insert({
            enquiry_id: pmt.enquiry_id,
            client_id: enq.client_id,
            channel: 'whatsapp',
            direction: 'outbound',
            subject: `Payment Reminder — ${ref}`,
            body: `Automated payment reminder for ${amt} ${pmt.payment_type}`,
            status: 'sent',
          })
        }

        paymentCount++
      }

      results.payments = { processed: paymentCount }
    } else {
      results.payments = { skipped: 'auto_payment_reminder not enabled' }
    }
  } catch (err) {
    results.payments = { error: (err as Error).message }
  }

  // ── 4. Cleanup conditional follow-ups (Day 15/30) when enquiry moved past follow_up ──
  try {
    const { data: conditionalFUs } = await sb
      .from('follow_ups')
      .select('id, enquiry_id, notes, enquiries(status)')
      .eq('outcome', 'pending')
      .eq('is_conditional', true)

    let cleanedCount = 0
    const pastFollowUpStatuses = ['approved', 'payment_received', 'mobilization_scheduled', 'job_active', 'confirmed', 'completed', 'lost', 'inactive']

    for (const fu of conditionalFUs ?? []) {
      const enq = fu.enquiries as any
      if (enq && pastFollowUpStatuses.includes(enq.status)) {
        await sb.from('follow_ups').update({ outcome: 'cancelled' }).eq('id', fu.id)
        cleanedCount++
      }
    }

    results.conditional_followup_cleanup = { processed: cleanedCount }
  } catch (err) {
    results.conditional_followup_cleanup = { error: (err as Error).message }
  }

  // ── 5. Expire mobilisation confirmation tokens + escalate (H6) ──
  try {
    const { data: expiredTokens } = await sb
      .from('mob_confirmation_tokens')
      .select('id, enquiry_id, enquiries(ref_number)')
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())

    // Mobilization leads to escalate to (fall back to admin user)
    const { data: mobLeads } = await sb
      .from('profiles')
      .select('id')
      .eq('role', 'mobilization_lead')
      .eq('is_active', true)
    const escalationTargets = (mobLeads ?? []).map((l) => l.id)
    if (escalationTargets.length === 0 && adminUserId) escalationTargets.push(adminUserId)

    let tokenCount = 0
    for (const tok of expiredTokens ?? []) {
      await sb.from('mob_confirmation_tokens').update({ status: 'expired' }).eq('id', tok.id)

      const ref = (tok.enquiries as any)?.ref_number ?? ''
      // Escalate: notify the mobilization lead(s)/admin so the client gets re-contacted
      for (const uid of escalationTargets) {
        await sb.from('notifications').insert({
          user_id: uid,
          type: 'mobilization_unconfirmed',
          title: `Mobilisation Not Confirmed — ${ref}`,
          body: `The client did not confirm the mobilisation date within the window. Please follow up and re-issue the confirmation link.`,
          enquiry_id: tok.enquiry_id,
          link: `/enquiries/${tok.enquiry_id}`,
        })
      }
      await sb.from('enquiry_events').insert({
        enquiry_id: tok.enquiry_id,
        event_type: 'mobilisation_unconfirmed',
        metadata: { reason: 'confirmation_token_expired', triggered_by: 'daily-cron' },
      })
      tokenCount++
    }

    results.mob_token_expiry = { processed: tokenCount }
  } catch (err) {
    results.mob_token_expiry = { error: (err as Error).message }
  }

  // ── 6. Auto-expire stale enquiries after the full follow-up cycle (H12) ──
  // BRD: a lead with no reply after the week/15-day/30-day cadence goes Inactive.
  // Covers the active-but-silent statuses, not just new/pending.
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const staleCutoff = thirtyDaysAgo.toISOString()

    const { data: staleEnquiries } = await sb
      .from('enquiries')
      .select('id, ref_number, status')
      .in('status', ['new', 'pending', 'sent', 'follow_up', 'negotiation'])
      .lt('updated_at', staleCutoff)
      .is('deleted_at', null)

    let expiredCount = 0
    for (const enq of staleEnquiries ?? []) {
      await sb.from('enquiries').update({ status: 'inactive', lost_reason: 'Auto-expired: no activity for 30 days', lost_date: today }).eq('id', enq.id)
      await sb.from('enquiry_events').insert({
        enquiry_id: enq.id,
        event_type: 'status_change',
        from_status: (enq as any).status,
        to_status: 'inactive',
        metadata: { reason: 'auto_expired_30_days', triggered_by: 'daily-cron' },
      })
      expiredCount++
    }

    results.auto_expired = { processed: expiredCount }
  } catch (err) {
    results.auto_expired = { error: (err as Error).message }
  }

  // ── 8. Intake Form Reminders (Day 3 nudge to client, Day 7 final + admin alert) ──
  try {
    // Find active intake tokens that haven't been filled
    const { data: pendingTokens } = await sb
      .from('intake_tokens')
      .select('id, token, client_id, created_at, expires_at, clients(name, email, whatsapp_number, whatsapp_invalid, phone)')
      .eq('status', 'active')

    let intakeReminderCount = 0
    const appUrl = Deno.env.get('APP_URL') || 'https://qms.globalgeoconsultancy.com'

    for (const tk of pendingTokens ?? []) {
      const client = (tk as any).clients as any
      if (!client) continue

      const createdAt = new Date(tk.created_at)
      const now = new Date()
      const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
      const expiresAt = new Date(tk.expires_at)
      const expiresDate = tk.expires_at.split('T')[0]
      const isExpiringToday = expiresDate === today
      const intakeUrl = `${appUrl}/intake?t=${tk.token}`

      // Find linked enquiry for ref number
      const { data: linkedEnquiry } = await sb
        .from('enquiries')
        .select('id, ref_number')
        .eq('client_id', tk.client_id)
        .in('status', ['new', 'intake_pending'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const ref = linkedEnquiry?.ref_number ?? 'Intake Form'

      // ── Day 3: Gentle nudge to client ──
      if (daysSinceCreation === 3) {
        if (client.email && !client.email_bounced) {
          await sendEmail(supabaseUrl, serviceRoleKey, {
            to: client.email,
            template: 'intake_reminder',
            params: { client_name: client.name, ref_number: ref, intake_url: intakeUrl, is_final: false },
          })
        }
        if (client.whatsapp_number && !client.whatsapp_invalid) {
          await sendWhatsApp(supabaseUrl, serviceRoleKey, {
            phone_number: client.whatsapp_number,
            template_name: 'qms_intake_reminder',
            parameters: [
              { name: 'client_name', value: client.name },
              { name: 'ref_number', value: ref },
              { name: 'link', value: intakeUrl },
            ],
          })
        }
        if (linkedEnquiry) {
          await sb.from('communication_log').insert({
            enquiry_id: linkedEnquiry.id,
            client_id: tk.client_id,
            channel: 'email',
            direction: 'outbound',
            subject: `Intake Reminder (Day 3) — ${ref}`,
            body: `Automated Day 3 reminder sent to ${client.name} to fill intake form`,
            status: 'sent',
          })
        }
        intakeReminderCount++
      }

      // ── Day 7 (expiry day): Final reminder to client + admin alert ──
      if (isExpiringToday) {
        // Send final reminder to client
        if (client.email && !client.email_bounced) {
          await sendEmail(supabaseUrl, serviceRoleKey, {
            to: client.email,
            template: 'intake_reminder',
            params: { client_name: client.name, ref_number: ref, intake_url: intakeUrl, is_final: true },
          })
        }
        if (client.whatsapp_number && !client.whatsapp_invalid) {
          await sendWhatsApp(supabaseUrl, serviceRoleKey, {
            phone_number: client.whatsapp_number,
            template_name: 'qms_intake_expiring',
            parameters: [
              { name: 'client_name', value: client.name },
              { name: 'ref_number', value: ref },
              { name: 'link', value: intakeUrl },
            ],
          })
        }

        // Notify admin — intake form not filled, link expiring today
        if (adminUserId) {
          await sb.from('notifications').insert({
            user_id: adminUserId,
            type: 'intake_expiring',
            title: `Intake Not Filled — ${ref}`,
            body: `${client.name} has not filled the intake form. Link expires today. Take follow-up.`,
            enquiry_id: linkedEnquiry?.id ?? null,
            link: linkedEnquiry ? `/enquiries/${linkedEnquiry.id}` : null,
          })
        }

        // Also email admin
        if (settings.admin_email) {
          await sendEmail(supabaseUrl, serviceRoleKey, {
            to: settings.admin_email,
            template: 'intake_expiry_admin',
            params: { ref_number: ref, client_name: client.name, client_phone: client.phone ?? client.whatsapp_number ?? '—', expiry_date: expiresDate },
          })
        }

        // Create follow-up task for admin
        if (linkedEnquiry) {
          await sb.from('follow_ups').insert({
            enquiry_id: linkedEnquiry.id,
            scheduled_date: today,
            follow_up_type: 'call_back',
            notes: `Client ${client.name} did not fill intake form (link expiring today). Call to follow up or fill on behalf.`,
            outcome: 'pending',
            reminder_sent: false,
          })

          await sb.from('communication_log').insert({
            enquiry_id: linkedEnquiry.id,
            client_id: tk.client_id,
            channel: 'email',
            direction: 'outbound',
            subject: `Intake Final Reminder (Day 7) — ${ref}`,
            body: `Automated final reminder sent to ${client.name}. Admin notified.`,
            status: 'sent',
          })
        }

        intakeReminderCount++
      }
    }

    results.intake_reminders = { processed: intakeReminderCount }
  } catch (err) {
    results.intake_reminders = { error: (err as Error).message }
  }

  // ── 9. Missed Call Morning Prompt (leads from yesterday that are still new) ──
  try {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStart = yesterday.toISOString().split('T')[0] + 'T00:00:00.000Z'
    const yesterdayEnd = yesterday.toISOString().split('T')[0] + 'T23:59:59.999Z'

    const { data: missedCalls } = await sb
      .from('enquiries')
      .select('id, ref_number, client_id, clients(name, phone)')
      .eq('lead_source', 'missed_call')
      .eq('status', 'new')
      .gte('created_at', yesterdayStart)
      .lte('created_at', yesterdayEnd)
      .is('deleted_at', null)

    let missedCount = 0
    for (const enq of missedCalls ?? []) {
      const client = (enq as any).clients as any

      if (adminUserId) {
        await sb.from('notifications').insert({
          user_id: adminUserId,
          type: 'morning_prompt',
          title: `Missed Call Follow-up — ${enq.ref_number}`,
          body: `Return call to ${client?.name ?? 'Unknown'} (${client?.phone ?? '—'}) — missed yesterday`,
          enquiry_id: enq.id,
          link: `/enquiries/${enq.id}`,
        })
      }

      await sb.from('follow_ups').insert({
        enquiry_id: enq.id,
        scheduled_date: today,
        follow_up_type: 'call_back',
        notes: `Return missed call from yesterday — ${client?.name ?? 'Unknown'} (${client?.phone ?? '—'})`,
        outcome: 'pending',
        reminder_sent: false,
      })

      missedCount++
    }

    results.missed_call_prompts = { processed: missedCount }
  } catch (err) {
    results.missed_call_prompts = { error: (err as Error).message }
  }

  // ── 7. Site Visit Day — WhatsApp + Email to Geologist at 8 AM ──
  try {
    const appUrl = Deno.env.get('APP_URL') || 'https://qms.globalgeoconsultancy.com'

    const { data: todayVisits } = await sb
      .from('site_visits')
      .select(`
        id, visit_date, token, geologist_id, observations,
        enquiries(
          id, ref_number, site_address, site_city, structure_type, num_bores, expected_depth_m,
          clients(name, phone, email, company)
        )
      `)
      .eq('visit_date', today)
      .eq('status', 'scheduled')
      .eq('notification_sent', false)

    let siteVisitCount = 0

    for (const sv of todayVisits ?? []) {
      const enq = sv.enquiries as any
      if (!enq) continue
      const client = enq.clients as any
      const ref = enq.ref_number
      const formUrl = `${appUrl}/site-visit?t=${sv.token}`
      const siteAddress = enq.site_address || enq.site_city
      const contactName = client?.name ?? 'Client'
      const contactPhone = client?.phone ?? '—'
      const initialNotes = (sv.observations as any)?.notes ?? ''

      // Get geologist details
      let geologistPhone: string | null = null
      let geologistEmail: string | null = null
      let geologistName = 'Team'
      if (sv.geologist_id) {
        const { data: geo } = await sb
          .from('profiles')
          .select('full_name, phone, email')
          .eq('id', sv.geologist_id)
          .single()
        if (geo) {
          geologistName = geo.full_name ?? 'Team'
          geologistPhone = geo.phone
          geologistEmail = geo.email
        }
      }

      // Send WhatsApp to geologist
      if (geologistPhone) {
        await sendWhatsApp(supabaseUrl, serviceRoleKey, {
          phone_number: geologistPhone,
          template_name: 'qms_site_visit_today',
          parameters: [
            { name: 'geologist_name', value: geologistName },
            { name: 'ref_number', value: ref },
            { name: 'client_name', value: contactName },
            { name: 'client_phone', value: contactPhone },
            { name: 'site_address', value: siteAddress },
            { name: 'form_url', value: formUrl },
          ],
        })
      }

      // Also send WhatsApp to admin
      if (settings.admin_whatsapp) {
        await sendWhatsApp(supabaseUrl, serviceRoleKey, {
          phone_number: settings.admin_whatsapp,
          template_name: 'qms_site_visit_today',
          parameters: [
            { name: 'geologist_name', value: geologistName },
            { name: 'ref_number', value: ref },
            { name: 'client_name', value: contactName },
            { name: 'client_phone', value: contactPhone },
            { name: 'site_address', value: siteAddress },
            { name: 'form_url', value: formUrl },
          ],
        })
      }

      // Send email to geologist with all details
      if (geologistEmail) {
        await sendEmail(supabaseUrl, serviceRoleKey, {
          to: geologistEmail,
          template: 'site_visit_today',
          params: { ref_number: ref, geologist_name: geologistName, client_name: contactName, client_phone: contactPhone, client_email: client?.email, site_address: siteAddress, structure_type: enq.structure_type, num_bores: enq.num_bores, depth_m: enq.expected_depth_m, notes: initialNotes, form_url: formUrl },
        })
      }

      // Also email admin
      if (settings.admin_email) {
        await sendEmail(supabaseUrl, serviceRoleKey, {
          to: settings.admin_email,
          subject: `Site Visit Today — ${ref} — ${geologistName} visiting ${siteAddress}`,
          template: 'site_visit_today',
          params: { ref_number: ref, geologist_name: geologistName, client_name: contactName, client_phone: contactPhone, client_email: client?.email, site_address: siteAddress, structure_type: enq.structure_type, num_bores: enq.num_bores, depth_m: enq.expected_depth_m, notes: initialNotes, form_url: formUrl },
        })
      }

      // Create in-app notification
      if (adminUserId) {
        await sb.from('notifications').insert({
          user_id: adminUserId,
          type: 'site_visit_today',
          title: `Site Visit Today — ${ref}`,
          body: `${geologistName} visiting ${siteAddress} for ${contactName}`,
          enquiry_id: enq.id,
          link: `/enquiries/${enq.id}`,
        })
      }

      // If geologist is a different user, notify them too
      if (sv.geologist_id && sv.geologist_id !== adminUserId) {
        await sb.from('notifications').insert({
          user_id: sv.geologist_id,
          type: 'site_visit_today',
          title: `Your Site Visit Today — ${ref}`,
          body: `Visit ${siteAddress} — Contact: ${contactName} (${contactPhone})`,
          enquiry_id: enq.id,
          link: `/enquiries/${enq.id}`,
        })
      }

      // Mark notification as sent
      await sb.from('site_visits').update({
        notification_sent: true,
        notification_sent_at: new Date().toISOString(),
      }).eq('id', sv.id)

      // Log communication
      await sb.from('communication_log').insert({
        enquiry_id: enq.id,
        client_id: enq.clients?.id ?? enq.client_id,
        channel: 'whatsapp',
        direction: 'outbound',
        subject: `Site Visit Reminder — ${ref}`,
        body: `Automated site visit reminder sent to ${geologistName} for ${siteAddress}`,
        status: 'sent',
      })

      siteVisitCount++
    }

    results.site_visit_notifications = { processed: siteVisitCount }
  } catch (err) {
    results.site_visit_notifications = { error: (err as Error).message }
  }

  return new Response(
    JSON.stringify({ success: true, ...results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})

// ── Helper: invoke send-email function ──
// Pass a template body { to, template, params } (preferred) or raw { to, subject, html_body }.
async function sendEmail(supabaseUrl: string, serviceRoleKey: string, body: Record<string, unknown>) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('send-email failed:', err)
  }
}

// ── Helper: invoke send-whatsapp function ──
async function sendWhatsApp(supabaseUrl: string, serviceRoleKey: string, body: { phone_number: string; template_name: string; parameters: any[] }) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('send-whatsapp failed:', err)
  }
}

// Email HTML now lives in ../_shared/email-templates.ts and is rendered by the
// send-email function. Cron jobs just pass { to, template, params }.
