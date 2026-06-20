import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../../db';
import { enquiries, quotations } from '../../db/schema';
import { authenticate, getAuth } from '../../middleware/auth';
import { requireEditor } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { badRequest, notFound } from '../../lib/errors';
import { logEnquiryEvent } from '../../lib/events';

const SOIL = z.enum(['soil', 'rock', 'mixed']);
const QUOT_STATUS = z.enum(['draft', 'approved', 'sent', 'accepted', 'rejected', 'superseded']);

const createSchema = z.object({
  enquiry_id: z.string().uuid(),
  variant: z.string().min(1),
  variant_label: z.string().nullish(),
  variant_notes: z.string().nullish(),
  version: z.number().int().optional(),
  template_type: z.string().optional(),
  service_type: z.string().optional(),
  status: QUOT_STATUS.optional(),
  is_lump_sum: z.boolean().optional(),
  num_bores: z.number().int().nullish(),
  depth_per_bore_m: z.number().nullish(),
  soil_type: SOIL.nullish(),
  rate_matrix_id: z.string().uuid().nullish(),
  line_items: z.any(),
  subtotal: z.number(),
  discount_type: z.string().nullish(),
  discount_value: z.number().nullish(),
  discount_amount: z.number().nullish(),
  gst_rate: z.number().nullish(),
  gst_type: z.string().nullish(),
  gst_amount: z.number(),
  total_amount: z.number(),
  mobilisation_cost: z.number().nullish(),
  drilling_cost: z.number().nullish(),
  reporting_cost: z.number().nullish(),
  travel_cost: z.number().nullish(),
});

const updateSchema = z.object({
  variant_label: z.string().nullish(),
  variant_notes: z.string().nullish(),
  status: QUOT_STATUS.optional(),
  line_items: z.any().optional(),
  subtotal: z.number().optional(),
  discount_type: z.string().nullish(),
  discount_value: z.number().nullish(),
  discount_amount: z.number().nullish(),
  gst_rate: z.number().nullish(),
  gst_amount: z.number().optional(),
  total_amount: z.number().optional(),
  mobilisation_cost: z.number().nullish(),
  drilling_cost: z.number().nullish(),
  reporting_cost: z.number().nullish(),
  travel_cost: z.number().nullish(),
  pdf_url: z.string().nullable().optional(),
  pdf_status: z.string().nullable().optional(),
  sent_at: z.string().nullable().optional(),
  approved_at: z.string().nullable().optional(),
  approved_by: z.string().uuid().nullable().optional(),
});

export const quotationsRouter = Router();
quotationsRouter.use(authenticate);

// GET /quotations?enquiry_id=...  (order: version desc, then variant) — read for all.
quotationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const enquiryId = z.string().uuid().parse(req.query.enquiry_id);
    const rows = await db
      .select()
      .from(quotations)
      .where(eq(quotations.enquiry_id, enquiryId))
      .orderBy(desc(quotations.version), asc(quotations.variant));
    res.json(rows);
  }),
);

quotationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const rows = await db.select().from(quotations).where(eq(quotations.id, getParam(req, 'id'))).limit(1);
    if (!rows[0]) throw notFound('Quotation not found');
    res.json(rows[0]);
  }),
);

// RLS parity: quotations writes require is_editor.
quotationsRouter.post(
  '/',
  requireEditor,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const rows = await db.insert(quotations).values(body).returning();
    res.status(201).json(rows[0]);
  }),
);

quotationsRouter.patch(
  '/:id',
  requireEditor,
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const rows = await db.update(quotations).set(body).where(eq(quotations.id, getParam(req, 'id'))).returning();
    if (!rows[0]) throw notFound('Quotation not found');
    res.json(rows[0]);
  }),
);

// Supersede a set of quotations (used by the builder before inserting a new version).
quotationsRouter.post(
  '/supersede',
  requireEditor,
  asyncHandler(async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(req.body);
    const rows = await db
      .update(quotations)
      .set({ status: 'superseded' })
      .where(inArray(quotations.id, ids))
      .returning({ id: quotations.id });
    res.json({ superseded: rows.map((r) => r.id) });
  }),
);

/**
 * Approve a variant — atomic cascade matching the original client-side flow:
 *   1. mark this quotation approved (approved_at, approved_by)
 *   2. supersede the enquiry's other non-final quotations (draft/approved/sent)
 *   3. move the enquiry to 'pending'
 *   4. log a 'quotation_approved' event
 * PDF generation stays client-side (browser @react-pdf) and is persisted via PATCH.
 */
quotationsRouter.post(
  '/:id/approve',
  requireEditor,
  asyncHandler(async (req, res) => {
    const auth = getAuth(req);
    const quotationId = getParam(req, 'id');

    const result = await db.transaction(async (tx) => {
      const found = await tx
        .select({ id: quotations.id, enquiry_id: quotations.enquiry_id })
        .from(quotations)
        .where(eq(quotations.id, quotationId))
        .limit(1);
      const quote = found[0];
      if (!quote) throw notFound('Quotation not found');

      const approved = await tx
        .update(quotations)
        .set({ status: 'approved', approved_at: new Date().toISOString(), approved_by: auth.userId })
        .where(eq(quotations.id, quotationId))
        .returning();

      await tx
        .update(quotations)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(quotations.enquiry_id, quote.enquiry_id),
            ne(quotations.id, quotationId),
            inArray(quotations.status, ['draft', 'approved', 'sent']),
          ),
        );

      const enqRows = await tx
        .select({ status: enquiries.status })
        .from(enquiries)
        .where(eq(enquiries.id, quote.enquiry_id))
        .limit(1);
      const prevStatus = enqRows[0]?.status ?? null;

      await tx.update(enquiries).set({ status: 'pending' }).where(eq(enquiries.id, quote.enquiry_id));

      await logEnquiryEvent(
        {
          enquiry_id: quote.enquiry_id,
          event_type: 'quotation_approved',
          from_status: prevStatus,
          to_status: 'pending',
          triggered_by: auth.userId,
        },
        tx,
      );

      return approved[0];
    });

    if (!result) throw badRequest('Approval failed');
    res.json(result);
  }),
);
