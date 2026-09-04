import { Router } from 'express';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { site_visits } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { requireNotViewer, requireFeature } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { notFound } from '../../lib/errors';
import { enquiries, clients, profiles, team_members } from '../../db/schema';
import { env } from '../../env';
import { sendEmail } from '../../integrations/email';
import { teamInboxes } from '../../integrations/internal-recipients';

const createSchema = z.object({
  enquiry_id: z.string().uuid(),
  visit_date: z.string(),
  geologist_id: z.string().uuid().nullish(),
  geologist_member_id: z.string().uuid().nullish(),
  supervisor_member_id: z.string().uuid().nullish(),
  status: z.string().optional(),
  observations: z.any().optional(),
});

const updateSchema = z.object({
  visit_date: z.string().optional(),
  geologist_id: z.string().uuid().nullable().optional(),
  geologist_member_id: z.string().uuid().nullable().optional(),
  supervisor_member_id: z.string().uuid().nullable().optional(),
  status: z.string().optional(),
  feasibility: z.string().nullable().optional(),
  water_confirmed: z.boolean().optional(),
  access_confirmed: z.boolean().optional(),
  security_confirmed: z.boolean().optional(),
  fencing_confirmed: z.boolean().optional(),
  observations: z.any().optional(),
  cost_factors: z.any().optional(),
  recommendations: z.string().nullable().optional(),
  photos: z.array(z.string()).optional(),
  notification_sent: z.boolean().optional(),
  notification_sent_at: z.string().nullable().optional(),
});

// Authenticated site-visit management (the public field form uses the RPC routes).
export const siteVisitsRouter = Router();
siteVisitsRouter.use(authenticate, requireFeature('site_visits'));

siteVisitsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const enquiryId = z.string().uuid().parse(req.query.enquiry_id);
    const rows = await db
      .select()
      .from(site_visits)
      .where(eq(site_visits.enquiry_id, enquiryId))
      .orderBy(desc(site_visits.visit_date));
    res.json(rows);
  }),
);


/**
 * Email the shared team inbox that a site visit has been scheduled, naming the
 * person assigned and carrying the on-site form link. The team is reached
 * through one address, so who the visit belongs to has to be in the message.
 *
 * The assignee may be a login (profiles) or a directory-only member
 * (team_members); both are checked. Best-effort — the visit must save even if
 * the mail fails.
 */
async function notifySiteVisitAssigned(orgId: string, visit: typeof site_visits.$inferSelect) {
  try {
    const inboxes = await teamInboxes(orgId);
    if (inboxes.length === 0 || !visit.token) return;

    let assignee: string | undefined;
    if (visit.geologist_id) {
      const [pr] = await db
        .select({ full_name: profiles.full_name, email: profiles.email })
        .from(profiles).where(eq(profiles.id, visit.geologist_id)).limit(1);
      assignee = pr?.full_name?.trim() || pr?.email;
    }
    if (!assignee && visit.geologist_member_id) {
      const [m] = await db
        .select({ full_name: team_members.full_name })
        .from(team_members).where(eq(team_members.id, visit.geologist_member_id)).limit(1);
      assignee = m?.full_name?.trim();
    }

    const [enq] = await db
      .select({
        ref_number: enquiries.ref_number, site_address: enquiries.site_address,
        site_city: enquiries.site_city, client_id: enquiries.client_id,
      })
      .from(enquiries).where(eq(enquiries.id, visit.enquiry_id)).limit(1);
    if (!enq) return;
    const [client] = enq.client_id
      ? await db.select({ name: clients.name, phone: clients.phone })
          .from(clients).where(eq(clients.id, enq.client_id)).limit(1)
      : [];

    const appUrl = env.APP_URL || 'https://qms.globalgeoconsultancy.com';
    await sendEmail({
      to: inboxes,
      orgId,
      template: 'site_visit_assigned',
      params: {
        ref_number: enq.ref_number,
        assignee_name: assignee || 'Unassigned',
        visit_date: visit.visit_date,
        client_name: client?.name ?? null,
        site_address: enq.site_address ?? null,
        city: enq.site_city ?? null,
        client_phone: client?.phone ?? null,
        form_url: `${appUrl}/site-visit?t=${visit.token}`,
      },
    });
  } catch {
    /* never block the save on a notification */
  }
}

siteVisitsRouter.post(
  '/',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const orgId = requireOrgId();
    const rows = await db.insert(site_visits).values({ ...body, org_id: orgId }).returning();
    res.status(201).json(rows[0]);
    if (rows[0]) void notifySiteVisitAssigned(orgId, rows[0]);
  }),
);

siteVisitsRouter.patch(
  '/:id',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const orgId = requireOrgId();
    const rows = await db.update(site_visits).set(body).where(eq(site_visits.id, getParam(req, 'id'))).returning();
    if (!rows[0]) throw notFound('Site visit not found');
    res.json(rows[0]);
    // Only when the assignee changes — not on every status or observation edit.
    if (body.geologist_id !== undefined || body.geologist_member_id !== undefined) {
      void notifySiteVisitAssigned(orgId, rows[0]);
    }
  }),
);
