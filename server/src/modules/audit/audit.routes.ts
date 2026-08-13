import { Router } from 'express';
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db, series } from '../../db';
import { enquiry_events, enquiries, clients, profiles } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { requireEditor } from '../../middleware/roles';
import { asyncHandler } from '../../lib/http';

/**
 * Audit Log — a readable "who did what, when" feed over enquiry_events.
 *
 * enquiry_events already stamps the acting user (triggered_by) and org_id, and is
 * RLS-scoped to the caller's org. Here we resolve the actor uuid to a name and
 * join the enquiry/client for context; the client turns each row into plain text.
 * Admin-only, matching the Settings / Quotation Config gating.
 */
export const auditRouter = Router();
auditRouter.use(authenticate, requireEditor);

auditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 200);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);
    const eventType = String(req.query.event_type ?? '').trim();
    const q = String(req.query.q ?? '').trim();

    const filters: (SQL | undefined)[] = [];
    if (eventType) filters.push(eq(enquiry_events.event_type, eventType));
    if (q) {
      const like = `%${q}%`;
      filters.push(
        or(
          ilike(enquiries.ref_number, like),
          ilike(clients.name, like),
          ilike(profiles.full_name, like),
          ilike(profiles.email, like),
        ),
      );
    }
    const where = filters.length ? and(...filters) : undefined;

    const [rows, totalRes, typesRes] = await series([
      () => db
        .select({
          id: enquiry_events.id,
          event_type: enquiry_events.event_type,
          from_status: enquiry_events.from_status,
          to_status: enquiry_events.to_status,
          metadata: enquiry_events.metadata,
          created_at: enquiry_events.created_at,
          triggered_by: enquiry_events.triggered_by,
          ref_number: enquiries.ref_number,
          enquiry_id: enquiry_events.enquiry_id,
          client_name: clients.name,
          actor_name: profiles.full_name,
          actor_email: profiles.email,
        })
        .from(enquiry_events)
        .leftJoin(enquiries, eq(enquiry_events.enquiry_id, enquiries.id))
        .leftJoin(clients, eq(enquiries.client_id, clients.id))
        .leftJoin(profiles, eq(enquiry_events.triggered_by, profiles.id))
        .where(where)
        .orderBy(desc(enquiry_events.created_at))
        .limit(limit)
        .offset(offset),
      () => db
        .select({ c: sql<number>`count(*)::int` })
        .from(enquiry_events)
        .leftJoin(enquiries, eq(enquiry_events.enquiry_id, enquiries.id))
        .leftJoin(clients, eq(enquiries.client_id, clients.id))
        .leftJoin(profiles, eq(enquiry_events.triggered_by, profiles.id))
        .where(where),
      // Distinct event types present (for the filter dropdown), org-scoped by RLS.
      () => db.select({ t: enquiry_events.event_type }).from(enquiry_events).groupBy(enquiry_events.event_type),
    ]);

    res.json({
      rows,
      total: totalRes[0]?.c ?? 0,
      limit,
      offset,
      event_types: typesRes.map((r) => r.t).filter(Boolean).sort(),
    });
  }),
);
