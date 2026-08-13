import { Router } from 'express';
import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db, series } from '../../db';
import { clients, enquiries, enquiry_events, follow_ups, job_reminders } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../lib/http';

const COUNT = sql<number>`count(*)::int`;
const today = () => new Date().toISOString().slice(0, 10);

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

// Headline stat cards.
dashboardRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const t = today();

    // The 18 stat tiles roll up into FOUR aggregate round-trips (all RLS-scoped
    // to the caller's org via the bound connection), instead of 14 count queries:
    //   1) enquiries  — every status tile + the Mumbai/Pune/Other job buckets +
    //      the converted-client count (distinct clients with a won/executed job).
    //   2) finalized  — the value KPIs off the single winning quotation per enquiry.
    //   3) clients    — total + "lost" (has enquiries, all ended lost/inactive).
    //   4) misc       — the two remaining cross-table counts in one trip.
    const [enqRes, valRes, clientRes, miscRes] = await series([
      () => db.execute(sql`
        select
          count(*) filter (where status = 'new')::int                                     as new_enquiries,
          count(*) filter (where status = 'sent')::int                                    as sent_quotes,
          count(*) filter (where status in ('job_active','mobilization_scheduled'))::int   as active_jobs,
          count(*)::int                                                                    as total_enquiries,
          count(*) filter (where status in ('approved','payment_received','mobilization_scheduled','job_active','confirmed','completed'))::int as won_enquiries,
          count(*) filter (where status = 'intake_pending')::int                           as intake_pending,
          count(*) filter (where status in ('sent','follow_up','negotiation'))::int        as pending_quotes,
          count(distinct client_id) filter (where status in ('approved','payment_received','mobilization_scheduled','job_active','confirmed','completed'))::int as converted_clients,
          count(*) filter (where status in ('job_active','mobilization_scheduled') and lower(trim(site_city)) = 'mumbai')::int               as active_jobs_mumbai,
          count(*) filter (where status in ('job_active','mobilization_scheduled') and lower(trim(site_city)) = 'pune')::int                 as active_jobs_pune,
          count(*) filter (where status in ('job_active','mobilization_scheduled') and lower(trim(site_city)) not in ('mumbai','pune'))::int as active_jobs_other
        from enquiries
        where deleted_at is null
      `),
      // Value KPIs keyed off the ENQUIRY stage, using the single finalized quotation
      // per enquiry (the winning variant: approved -> sent -> accepted). Filtering on
      // quotation.status='approved' alone missed quotes once sent/won, freezing these.
      //   Pipeline Value  = quotes out, awaiting client decision (not won, not lost)
      //   Order Book      = value of WON orders in execution (not yet completed)
      //   Quotation Book  = value of every live quotation (anything not lost/inactive)
      () => db.execute(sql`
        with finalized as (
          select distinct on (q.enquiry_id) q.enquiry_id, q.total_amount, e.status as estatus
          from quotations q
          join enquiries e on e.id = q.enquiry_id
          where q.status in ('approved','sent','accepted') and e.deleted_at is null
          order by q.enquiry_id, q.created_at desc
        )
        select
          coalesce(sum(total_amount) filter (where estatus in ('sent','follow_up','negotiation')),0)::float as pipeline_value,
          coalesce(sum(total_amount) filter (where estatus in ('approved','payment_received','mobilization_scheduled','job_active','confirmed')),0)::float as order_book_value,
          coalesce(sum(total_amount) filter (where estatus not in ('lost','inactive')),0)::float as quotation_book_value
        from finalized
      `),
      // Clients: total + "lost" (has enquiries, and every one ended lost/inactive).
      () => db.execute(sql`
        select
          count(*)::int as total_clients,
          count(*) filter (
            where exists (select 1 from enquiries e where e.client_id = c.id and e.deleted_at is null)
              and not exists (
                select 1 from enquiries e
                where e.client_id = c.id and e.deleted_at is null and e.status not in ('lost','inactive')
              )
          )::int as lost_clients
        from clients c
        where c.deleted_at is null
      `),
      // The two remaining cross-table counts in a single round-trip.
      () => db.execute(sql`
        select
          (select count(*) from follow_ups where scheduled_date = ${t} and outcome = 'pending')::int as followups_today,
          (select count(*) from payments where status = 'request_sent')::int as pending_payments
      `),
    ]);

    const rowOf = (r: unknown): Record<string, number> =>
      (r as { rows?: Array<Record<string, number>> }).rows?.[0] ?? {};
    const e = rowOf(enqRes);
    const v = rowOf(valRes);
    const c = rowOf(clientRes);
    const m = rowOf(miscRes);

    res.json({
      new_enquiries: e.new_enquiries ?? 0,
      sent_quotes: e.sent_quotes ?? 0,
      followups_today: m.followups_today ?? 0,
      pending_payments: m.pending_payments ?? 0,
      active_jobs: e.active_jobs ?? 0,
      active_jobs_mumbai: e.active_jobs_mumbai ?? 0,
      active_jobs_pune: e.active_jobs_pune ?? 0,
      active_jobs_other: e.active_jobs_other ?? 0,
      total_enquiries: e.total_enquiries ?? 0,
      won_enquiries: e.won_enquiries ?? 0,
      intake_pending: e.intake_pending ?? 0,
      pipeline_value: v.pipeline_value ?? 0,
      quotation_book_value: v.quotation_book_value ?? 0,
      order_book: v.order_book_value ?? 0,
      pending_quotes: e.pending_quotes ?? 0,
      total_clients: c.total_clients ?? 0,
      converted_clients: e.converted_clients ?? 0,
      lost_clients: c.lost_clients ?? 0,
    });
  }),
);

// Pipeline strip — counts per status (excluding soft-deleted).
dashboardRouter.get(
  '/pipeline',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({ status: enquiries.status, count: COUNT })
      .from(enquiries)
      .where(isNull(enquiries.deleted_at))
      .groupBy(enquiries.status);
    res.json(rows);
  }),
);

// Today's actions — overdue + due follow-ups.
dashboardRouter.get(
  '/actions',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        id: follow_ups.id,
        scheduled_date: follow_ups.scheduled_date,
        notes: follow_ups.notes,
        enquiry_id: follow_ups.enquiry_id,
        ref_number: enquiries.ref_number,
        site_city: enquiries.site_city,
        client_name: clients.name,
      })
      .from(follow_ups)
      .innerJoin(enquiries, eq(enquiries.id, follow_ups.enquiry_id))
      .leftJoin(clients, eq(clients.id, enquiries.client_id))
      .where(and(lte(follow_ups.scheduled_date, today()), eq(follow_ups.outcome, 'pending')))
      .orderBy(asc(follow_ups.scheduled_date))
      .limit(10);
    res.json(rows);
  }),
);

// Job reminders due within the next 7 days.
dashboardRouter.get(
  '/reminders',
  asyncHandler(async (_req, res) => {
    const t = today();
    const in7 = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const rows = await db
      .select({
        id: job_reminders.id,
        reminder_type: job_reminders.reminder_type,
        days_before: job_reminders.days_before,
        scheduled_for: job_reminders.scheduled_for,
        target_date: job_reminders.target_date,
        enquiry_id: job_reminders.enquiry_id,
        job_id: job_reminders.job_id,
        ref_number: enquiries.ref_number,
        client_name: clients.name,
      })
      .from(job_reminders)
      .innerJoin(enquiries, eq(enquiries.id, job_reminders.enquiry_id))
      .leftJoin(clients, eq(clients.id, enquiries.client_id))
      .where(and(gte(job_reminders.scheduled_for, t), lte(job_reminders.scheduled_for, in7), eq(job_reminders.sent, false)))
      .orderBy(asc(job_reminders.scheduled_for))
      .limit(8);
    res.json(rows);
  }),
);

// Recent activity feed.
dashboardRouter.get(
  '/activity',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        id: enquiry_events.id,
        event_type: enquiry_events.event_type,
        from_status: enquiry_events.from_status,
        to_status: enquiry_events.to_status,
        created_at: enquiry_events.created_at,
        enquiry_id: enquiry_events.enquiry_id,
        ref_number: enquiries.ref_number,
        client_name: clients.name,
      })
      .from(enquiry_events)
      .innerJoin(enquiries, eq(enquiries.id, enquiry_events.enquiry_id))
      .leftJoin(clients, eq(clients.id, enquiries.client_id))
      .orderBy(desc(enquiry_events.created_at))
      .limit(15);
    res.json(rows);
  }),
);
