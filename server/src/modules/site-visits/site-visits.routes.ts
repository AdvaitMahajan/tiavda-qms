import { Router } from 'express';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { site_visits } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { requireNotViewer, requireFeature } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { notFound } from '../../lib/errors';

const createSchema = z.object({
  enquiry_id: z.string().uuid(),
  visit_date: z.string(),
  geologist_id: z.string().uuid().nullish(),
  status: z.string().optional(),
  observations: z.any().optional(),
});

const updateSchema = z.object({
  visit_date: z.string().optional(),
  geologist_id: z.string().uuid().nullable().optional(),
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

siteVisitsRouter.post(
  '/',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const rows = await db.insert(site_visits).values({ ...body, org_id: requireOrgId() }).returning();
    res.status(201).json(rows[0]);
  }),
);

siteVisitsRouter.patch(
  '/:id',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const rows = await db.update(site_visits).set(body).where(eq(site_visits.id, getParam(req, 'id'))).returning();
    if (!rows[0]) throw notFound('Site visit not found');
    res.json(rows[0]);
  }),
);
