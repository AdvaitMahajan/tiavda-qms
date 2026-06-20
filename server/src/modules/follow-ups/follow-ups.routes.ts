import { Router } from 'express';
import { z } from 'zod';
import { asc, desc, eq } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { follow_ups } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { requireEditor, requireNotViewer } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { notFound } from '../../lib/errors';

const OUTCOME = z.enum(['pending', 'reached', 'no_response', 'callback_requested', 'closed']);

const createSchema = z.object({
  enquiry_id: z.string().uuid(),
  scheduled_date: z.string(),
  scheduled_time: z.string().nullish(),
  notes: z.string().nullish(),
  outcome: OUTCOME.optional(),
  auto_scheduled: z.boolean().optional(),
  is_conditional: z.boolean().optional(),
  assigned_to: z.string().uuid().nullish(),
});

const updateSchema = z.object({
  scheduled_date: z.string().optional(),
  scheduled_time: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  outcome: OUTCOME.optional(),
  outcome_notes: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  completed_by: z.string().uuid().nullable().optional(),
  reminder_sent: z.boolean().optional(),
  is_conditional: z.boolean().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

export const followUpsRouter = Router();
followUpsRouter.use(authenticate);

// GET /follow-ups            -> global list (FollowUps page), order scheduled_date asc
// GET /follow-ups?enquiry_id -> per-enquiry list (FollowUpsTab), order scheduled_date desc
// ?order=asc|desc overrides the default.
followUpsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const enquiryId = req.query.enquiry_id ? z.string().uuid().parse(req.query.enquiry_id) : null;
    const order = req.query.order === 'asc' ? 'asc' : req.query.order === 'desc' ? 'desc' : enquiryId ? 'desc' : 'asc';
    const orderBy = order === 'asc' ? asc(follow_ups.scheduled_date) : desc(follow_ups.scheduled_date);
    const rows = await db
      .select()
      .from(follow_ups)
      .where(enquiryId ? eq(follow_ups.enquiry_id, enquiryId) : undefined)
      .orderBy(orderBy);
    res.json(rows);
  }),
);

followUpsRouter.post(
  '/',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const rows = await db.insert(follow_ups).values({ ...body, org_id: requireOrgId() }).returning();
    res.status(201).json(rows[0]);
  }),
);

followUpsRouter.patch(
  '/:id',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const rows = await db.update(follow_ups).set(body).where(eq(follow_ups.id, getParam(req, 'id'))).returning();
    if (!rows[0]) throw notFound('Follow-up not found');
    res.json(rows[0]);
  }),
);

followUpsRouter.delete(
  '/:id',
  requireEditor,
  asyncHandler(async (req, res) => {
    const rows = await db.delete(follow_ups).where(eq(follow_ups.id, getParam(req, 'id'))).returning();
    if (!rows[0]) throw notFound('Follow-up not found');
    res.json({ success: true });
  }),
);
