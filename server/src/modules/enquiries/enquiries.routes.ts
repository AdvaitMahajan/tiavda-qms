import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import { clients, enquiries, enquiry_events, quotations } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { requireNotViewer } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { notFound } from '../../lib/errors';

const STRUCTURE = z.enum(['residential', 'commercial', 'industrial', 'infrastructure', 'other']);
const SOIL = z.enum(['soil', 'rock', 'mixed']);
const LEAD_STATUS = z.enum([
  'new', 'intake_pending', 'pending', 'sent', 'follow_up', 'negotiation', 'approved',
  'payment_received', 'mobilization_scheduled', 'job_active', 'confirmed', 'lost', 'inactive', 'completed',
]);

const createSchema = z.object({
  client_id: z.string().uuid(),
  site_city: z.string().min(1),
  service_type: z.string().optional(),
  status: LEAD_STATUS.optional(),
  lead_source: z.string().nullish(),
  remarks: z.string().nullish(),
  site_address: z.string().nullish(),
  structure_type: STRUCTURE.nullish(),
  soil_type_hint: SOIL.nullish(),
  num_bores: z.number().int().nullish(),
  expected_depth_m: z.number().nullish(),
  assigned_to: z.string().uuid().nullish(),
  submission_id: z.string().uuid().nullish(),
});

// Whitelisted updatable columns (unknown keys are stripped by zod).
const updateSchema = z.object({
  status: LEAD_STATUS.optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  service_type: z.string().optional(),
  site_city: z.string().optional(),
  site_address: z.string().nullable().optional(),
  structure_type: STRUCTURE.nullable().optional(),
  soil_type_hint: SOIL.nullable().optional(),
  num_bores: z.number().int().nullable().optional(),
  expected_depth_m: z.number().nullable().optional(),
  next_follow_up: z.string().nullable().optional(),
  confirmed_date: z.string().nullable().optional(),
  lost_date: z.string().nullable().optional(),
  lost_reason: z.string().nullable().optional(),
  lead_source: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  consultancy_data: z.any().optional(),
  site_visit_required: z.boolean().nullable().optional(),
  contact_person: z.string().nullable().optional(),
  gst_number: z.string().nullable().optional(),
  google_maps_url: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  distance_km: z.number().nullable().optional(),
  architect_name: z.string().nullable().optional(),
  architect_phone: z.string().nullable().optional(),
  architect_address: z.string().nullable().optional(),
  rcc_consultant_name: z.string().nullable().optional(),
  rcc_consultant_phone: z.string().nullable().optional(),
  rcc_consultant_address: z.string().nullable().optional(),
  num_podiums: z.number().int().nullable().optional(),
  height_of_basements: z.number().nullable().optional(),
  soil_fraction: z.number().nullable().optional(),
  water_available: z.boolean().nullable().optional(),
  water_quantity: z.string().nullable().optional(),
  electricity_available: z.boolean().nullable().optional(),
  security_available: z.boolean().nullable().optional(),
  plot_fenced: z.string().nullable().optional(),
  site_access: z.string().nullable().optional(),
  site_access_types: z.any().optional(),
  permissions_obtained: z.boolean().nullable().optional(),
  safety_required: z.boolean().nullable().optional(),
  safety_requirements: z.string().nullable().optional(),
  demobilization_consent: z.boolean().nullable().optional(),
});

const listQuery = z.object({
  status: z.string().optional(), // comma-separated list
  client_id: z.string().uuid().optional(),
  service_type: z.string().optional(),
  include_deleted: z.coerce.boolean().default(false),
  order: z.enum(['created_at', 'confirmed_date', 'enquiry_date']).default('created_at'),
  embed: z.string().optional(), // comma list: client,quote
});

const eventSchema = z.object({
  event_type: z.string().min(1),
  from_status: LEAD_STATUS.nullish(),
  to_status: LEAD_STATUS.nullish(),
  metadata: z.any().optional(),
});

export const enquiriesRouter = Router();
enquiriesRouter.use(authenticate);

enquiriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const conds: SQL[] = [];
    if (!q.include_deleted) conds.push(isNull(enquiries.deleted_at));
    if (q.client_id) conds.push(eq(enquiries.client_id, q.client_id));
    if (q.service_type) conds.push(eq(enquiries.service_type, q.service_type));
    if (q.status) {
      const statuses = q.status.split(',').map((s) => s.trim()).filter(Boolean) as Array<
        z.infer<typeof LEAD_STATUS>
      >;
      if (statuses.length) conds.push(inArray(enquiries.status, statuses));
    }
    const orderCol =
      q.order === 'confirmed_date'
        ? enquiries.confirmed_date
        : q.order === 'enquiry_date'
          ? enquiries.enquiry_date
          : enquiries.created_at;
    const rows = await db
      .select()
      .from(enquiries)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(orderCol));

    const embed = (q.embed ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!embed.length || rows.length === 0) {
      res.json(rows);
      return;
    }

    // Batched enrichment (no N+1): one query for clients, one for quote totals.
    let clientMap: Map<string, { id: string; name: string; phone: string }> | null = null;
    let quoteMap: Map<string, number> | null = null;

    if (embed.includes('client')) {
      const clientIds = [...new Set(rows.map((r) => r.client_id))];
      const cs = await db
        .select({ id: clients.id, name: clients.name, phone: clients.phone })
        .from(clients)
        .where(inArray(clients.id, clientIds));
      clientMap = new Map(cs.map((c) => [c.id, c]));
    }

    if (embed.includes('quote')) {
      const ids = rows.map((r) => r.id);
      const qs = await db
        .select({
          enquiry_id: quotations.enquiry_id,
          total_amount: quotations.total_amount,
        })
        .from(quotations)
        .where(and(inArray(quotations.enquiry_id, ids), inArray(quotations.status, ['approved', 'sent', 'accepted'])))
        .orderBy(desc(quotations.version));
      quoteMap = new Map();
      for (const qr of qs) {
        if (!quoteMap.has(qr.enquiry_id)) quoteMap.set(qr.enquiry_id, qr.total_amount);
      }
    }

    res.json(
      rows.map((r) => ({
        ...r,
        ...(clientMap ? { client: clientMap.get(r.client_id) ?? null } : {}),
        ...(quoteMap ? { quote_total: quoteMap.get(r.id) ?? null } : {}),
      })),
    );
  }),
);

enquiriesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const rows = await db.select().from(enquiries).where(eq(enquiries.id, getParam(req, 'id'))).limit(1);
    if (!rows[0]) throw notFound('Enquiry not found');
    res.json(rows[0]);
  }),
);

enquiriesRouter.post(
  '/',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const rows = await db.insert(enquiries).values(body).returning();
    res.status(201).json(rows[0]);
  }),
);

// Status changes are validated by the DB trigger (validate_status_transition);
// invalid transitions surface as a 400 via the central error handler.
enquiriesRouter.patch(
  '/:id',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const rows = await db.update(enquiries).set(body).where(eq(enquiries.id, getParam(req, 'id'))).returning();
    if (!rows[0]) throw notFound('Enquiry not found');
    res.json(rows[0]);
  }),
);

// ── Audit log (enquiry_events) ──
enquiriesRouter.get(
  '/:id/events',
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(enquiry_events)
      .where(eq(enquiry_events.enquiry_id, getParam(req, 'id')))
      .orderBy(desc(enquiry_events.created_at));
    res.json(rows);
  }),
);

enquiriesRouter.post(
  '/:id/events',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = eventSchema.parse(req.body);
    const rows = await db
      .insert(enquiry_events)
      .values({ ...body, enquiry_id: getParam(req, 'id'), triggered_by: req.auth?.userId ?? null })
      .returning();
    res.status(201).json(rows[0]);
  }),
);
