import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, like, ne } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { payments } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { requireBilling, requireFeature } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { conflict, notFound } from '../../lib/errors';

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
  invoice_number: z.string().trim().min(1).max(60).nullable().optional(),
  invoice_ref: z.string().trim().max(60).nullable().optional(),
});

/** Year series for invoice numbers: GG-INV-2026-001, GG-INV-2026-002, … */
const invoicePrefix = (year: string) => `GG-INV-${year}-`;

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

// Next free number in the year's series (scoped to the caller's org by RLS).
// Only a suggestion: the user can change it before the invoice is generated.
paymentsRouter.get(
  '/next-invoice-number',
  asyncHandler(async (req, res) => {
    const year = z.string().regex(/^\d{4}$/).parse(req.query.year ?? String(new Date().getFullYear()));
    const prefix = invoicePrefix(year);
    const rows = await db
      .select({ invoice_number: payments.invoice_number })
      .from(payments)
      .where(like(payments.invoice_number, `${prefix}%`));
    let max = 0;
    for (const r of rows) {
      const n = Number((r.invoice_number ?? '').slice(prefix.length));
      if (Number.isInteger(n) && n > max) max = n;
    }
    res.json({ invoice_number: `${prefix}${String(max + 1).padStart(3, '0')}` });
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
    const id = getParam(req, 'id');
    if (body.invoice_number) {
      // Friendly message ahead of the unique index (org_id, invoice_number).
      const taken = await db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.invoice_number, body.invoice_number), ne(payments.id, id)))
        .limit(1);
      if (taken[0]) throw conflict(`Invoice number ${body.invoice_number} is already used on another invoice`);
    }
    const rows = await db.update(payments).set(body).where(eq(payments.id, id)).returning();
    if (!rows[0]) throw notFound('Payment not found');
    res.json(rows[0]);
  }),
);
