import { Router } from 'express';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { rate_matrix } from '../../db/schema';
import { authenticate, getAuth } from '../../middleware/auth';
import { requireQuoting, requireFeature } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { notFound } from '../../lib/errors';

const STRUCTURE = z.enum(['residential', 'commercial', 'industrial', 'infrastructure', 'other']);
const SOIL = z.enum(['soil', 'rock', 'mixed']);

const createSchema = z.object({
  city: z.string().min(1),
  state: z.string().nullish(),
  structure_type: STRUCTURE,
  soil_type: SOIL,
  rate_per_bore: z.number(),
  rate_per_metre_soil: z.number(),
  rate_per_metre_rock: z.number(),
  rate_reporting: z.number(),
  rate_travel_per_km: z.number().nullish(),
  minimum_charge: z.number().nullish(),
  is_active: z.boolean().optional(),
  effective_from: z.string().optional(),
  effective_to: z.string().nullish(),
});

const updateSchema = createSchema.partial();

export const rateMatrixRouter = Router();
rateMatrixRouter.use(authenticate, requireFeature('quotations'));

// RLS parity: select = all authenticated; insert/update/delete = is_editor.
rateMatrixRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await db.select().from(rate_matrix).orderBy(asc(rate_matrix.city)));
  }),
);

rateMatrixRouter.post(
  '/',
  requireQuoting,
  asyncHandler(async (req, res) => {
    const auth = getAuth(req);
    const body = createSchema.parse(req.body);
    const rows = await db
      .insert(rate_matrix)
      .values({ ...body, created_by: auth.userId, org_id: requireOrgId() })
      .returning();
    res.status(201).json(rows[0]);
  }),
);

rateMatrixRouter.patch(
  '/:id',
  requireQuoting,
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const rows = await db
      .update(rate_matrix)
      .set(body)
      .where(eq(rate_matrix.id, getParam(req, 'id')))
      .returning();
    if (!rows[0]) throw notFound('Rate not found');
    res.json(rows[0]);
  }),
);

rateMatrixRouter.delete(
  '/:id',
  requireQuoting,
  asyncHandler(async (req, res) => {
    const rows = await db
      .delete(rate_matrix)
      .where(eq(rate_matrix.id, getParam(req, 'id')))
      .returning();
    if (!rows[0]) throw notFound('Rate not found');
    res.json({ success: true });
  }),
);
