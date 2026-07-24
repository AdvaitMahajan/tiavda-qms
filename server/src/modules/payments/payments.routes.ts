import { Router } from 'express';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { payments } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { requireBilling, requireFeature } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { notFound } from '../../lib/errors';

const PAYMENT_STATUS = z.enum(['pending_request', 'request_sent', 'received', 'partial', 'refunded']);

const createSchema = z.object({
  enquiry_id: z.string().uuid(),
  quotation_id: z.string().uuid().nullish(),
  payment_type: z.string().min(1),
  amount_requested: z.number(),
  amount_received: z.number().nullish(),
  status: PAYMENT_STATUS.optional(),
  due_date: z.string().nullish(),
  notes: z.string().nullish(),
});

const updateSchema = z.object({
  amount_requested: z.number().optional(),
  amount_received: z.number().nullable().optional(),
  status: PAYMENT_STATUS.optional(),
  payment_method: z.string().nullable().optional(),
  transaction_ref: z.string().nullable().optional(),
  receipt_url: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  request_sent_at: z.string().nullable().optional(),
  received_at: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// RLS parity: select = all; insert/update/delete = is_editor.
export const paymentsRouter = Router();
paymentsRouter.use(authenticate, requireFeature('payments'));

paymentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const enquiryId = z.string().uuid().parse(req.query.enquiry_id);
    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.enquiry_id, enquiryId))
      .orderBy(desc(payments.created_at));
    res.json(rows);
  }),
);

paymentsRouter.post(
  '/',
  requireBilling,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const rows = await db.insert(payments).values({ ...body, org_id: requireOrgId() }).returning();
    res.status(201).json(rows[0]);
  }),
);

paymentsRouter.patch(
  '/:id',
  requireBilling,
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const rows = await db.update(payments).set(body).where(eq(payments.id, getParam(req, 'id'))).returning();
    if (!rows[0]) throw notFound('Payment not found');
    res.json(rows[0]);
  }),
);
