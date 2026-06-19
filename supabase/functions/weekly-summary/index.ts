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

  const now = new Date()
  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekStart = weekAgo.toISOString()
  const todayStr = now.toISOString().split('T')[0]

  // ── Load admin email ──
  const { data: adminRow } = await sb
    .from('app_settings')
    .select('value')
    .eq('key', 'admin_email')
    .maybeSingle()

  if (!adminRow?.value) {
    return new Response(
      JSON.stringify({ error: 'admin_email not configured' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── Gather stats ──

  // New enquiries this week
  const { count: newEnquiries } = await sb
    .from('enquiries')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', weekStart)
    .is('deleted_at', null)

  // Enquiries by status
  const { data: allEnquiries } = await sb
    .from('enquiries')
    .select('status')
    .is('deleted_at', null)

  const statusCounts: Record<string, number> = {}
  for (const e of allEnquiries ?? []) {
    statusCounts[e.status] = (statusCounts[e.status] || 0) + 1
  }

  // Quotations sent this week
  const { count: quotationsSent } = await sb
    .from('quotations')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', weekStart)

  // Payments received this week
  const { data: weekPayments } = await sb
    .from('payments')
    .select('amount_received')
    .eq('status', 'received')
    .gte('received_at', weekStart)

  const totalReceived = (weekPayments ?? []).reduce((sum, p) => sum + (p.amount_received ?? 0), 0)
  const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(totalReceived)

  // Overdue follow-ups
  const { count: overdueFollowUps } = await sb
    .from('follow_ups')
    .select('id', { count: 'exact', head: true })
    .lt('scheduled_date', todayStr)
    .eq('outcome', 'pending')

  // Pending payments
  const { count: pendingPayments } = await sb
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'request_sent')

  // ── Send email (HTML rendered from _shared/email-templates.ts via send-email) ──
  const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: adminRow.value,
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
    }),
  })

  const emailOk = emailRes.ok

  return new Response(
    JSON.stringify({
      success: true,
      email_sent: emailOk,
      stats: {
        new_enquiries: newEnquiries ?? 0,
        quotations_sent: quotationsSent ?? 0,
        revenue_collected: totalReceived,
        pipeline: statusCounts,
        overdue_follow_ups: overdueFollowUps ?? 0,
        pending_payments: pendingPayments ?? 0,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
