import { Router } from 'express';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../../db';
import { clients, enquiries, enquiry_events, follow_ups, job_reminders, payments, quotations } from '../../db/schema';
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
    // Client-level segmentation:
    //   converted = has >=1 enquiry that reached a won/executed state
    //   lost      = has enquiries and EVERY one ended lost/inactive (never converted)
    const WON = ['approved', 'payment_received', 'mobilization_scheduled', 'job_active', 'confirmed', 'completed'] as const;

    const [
      newEnq, sentQuotes, followToday, pendingPay, activeJobs, totalEnq, wonEnq, intakePending,
      bookValues, pendingQuotes, totalClients, convertedClients, lostClientsRes, activeByCityRes,
    ] = await Promise.all([
      db.select({ c: COUNT }).from(enquiries).where(and(eq(enquiries.status, 'new'), isNull(enquiries.deleted_at))),
      db.select({ c: COUNT }).from(enquiries).where(and(eq(enquiries.status, 'sent'), isNull(enquiries.deleted_at))),
      db.select({ c: COUNT }).from(follow_ups).where(and(eq(follow_ups.scheduled_date, t), eq(follow_ups.outcome, 'pending'))),
      db.select({ c: COUNT }).from(payments).where(eq(payments.status, 'request_sent')),
      db.select({ c: COUNT }).from(enquiries).where(and(inArray(enquiries.status, ['job_active', 'mobilization_scheduled']), isNull(enquiries.deleted_at))),
      db.select({ c: COUNT }).from(enquiries).where(isNull(enquiries.deleted_at)),
      db.select({ c: COUNT }).from(enquiries).where(and(inArray(enquiries.status, ['approved', 'payment_received', 'mobilization_scheduled', 'job_active', 'confirmed', 'completed']), isNull(enquiries.deleted_at))),
      db.select({ c: COUNT }).from(enquiries).where(and(eq(enquiries.status, 'intake_pending'), isNull(enquiries.deleted_at))),
      // Value KPIs keyed off the ENQUIRY stage, using the single finalized quotation
      // per enquiry (the winning variant: approved -> sent -> accepted). Filtering on
      // quotation.status='approved' alone missed quotes once sent/won, freezing these.
      //   Pipeline Value  = quotes out, awaiting client decision (not won, not lost)
      //   Order Book      = value of WON orders in execution (not yet completed)
      //   Quotation Book  = value of every live quotation (anything not lost/inactive)
      db.execute(sql`
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
      db.select({ c: COUNT }).from(enquiries).where(and(inArray(enquiries.status, ['sent', 'follow_up', 'negotiation']), isNull(enquiries.deleted_at))),
      // total clients
      db.select({ c: COUNT }).from(clients).where(isNull(clients.deleted_at)),
      // converted clients (distinct clients with at least one won/executed enquiry)
      db
        .select({ c: sql<number>`count(distinct ${enquiries.client_id})::int` })
        .from(enquiries)
        .where(and(inArray(enquiries.status, [...WON]), isNull(enquiries.deleted_at))),
      // lost clients: has enquiries, and none of them is anything other than lost/inactive
      db.execute(sql`
        select count(*)::int as c
        from clients c
        where c.deleted_at is null
          and exists (select 1 from enquiries e where e.client_id = c.id and e.deleted_at is null)
          and not exists (
            select 1 from enquiries e
            where e.client_id = c.id and e.deleted_at is null
              and e.status not in ('lost', 'inactive')
          )
      `),
      // Active jobs bucketed by city (free-text site_city → Mumbai / Pune / Other).
      db.execute(sql`
        select
          count(*) filter (where lower(trim(site_city)) = 'mumbai')::int as mumbai,
          count(*) filter (where lower(trim(site_city)) = 'pune')::int   as pune,
          count(*) filter (where lower(trim(site_city)) not in ('mumbai','pune'))::int as other
        from public.enquiries
        where status in ('job_active','mobilization_scheduled') and deleted_at is null
      `),
    ]);

    const lostClients = Number(
      ((lostClientsRes as unknown as { rows?: Array<{ c: number }> })?.rows?.[0]?.c) ?? 0,
    );
    const bv = (bookValues as unknown as {
      rows?: Array<{ pipeline_value: number; order_book_value: number; quotation_book_value: number }>;
    })?.rows?.[0];
    const abc = (activeByCityRes as unknown as {
      rows?: Array<{ mumbai: number; pune: number; other: number }>;
    })?.rows?.[0];

    res.json({
      new_enquiries: newEnq[0]?.c ?? 0,
      sent_quotes: sentQuotes[0]?.c ?? 0,
      followups_today: followToday[0]?.c ?? 0,
      pending_payments: pendingPay[0]?.c ?? 0,
      active_jobs: activeJobs[0]?.c ?? 0,
      active_jobs_mumbai: abc?.mumbai ?? 0,
      active_jobs_pune: abc?.pune ?? 0,
      active_jobs_other: abc?.other ?? 0,
      total_enquiries: totalEnq[0]?.c ?? 0,
      won_enquiries: wonEnq[0]?.c ?? 0,
      intake_pending: intakePending[0]?.c ?? 0,
      pipeline_value: bv?.pipeline_value ?? 0,
      quotation_book_value: bv?.quotation_book_value ?? 0,
      order_book: bv?.order_book_value ?? 0,
      pending_quotes: pendingQuotes[0]?.c ?? 0,
      total_clients: totalClients[0]?.c ?? 0,
      converted_clients: convertedClients[0]?.c ?? 0,
      lost_clients: lostClients,
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
