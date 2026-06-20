import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { mobilisation, mob_confirmation_tokens } from '../../db/schema';
import { authenticate, getAuth } from '../../middleware/auth';
import { requireNotViewer } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { badRequest, notFound } from '../../lib/errors';

const createSchema = z.object({
  enquiry_id: z.string().uuid(),
  mobilisation_date: z.string(),
  mobilisation_time: z.string().nullish(),
  team_lead_id: z.string().uuid().nullish(),
  team_description: z.string().nullish(),
  equipment_notes: z.string().nullish(),
  site_contact_name: z.string().nullish(),
  site_contact_phone: z.string().nullish(),
  drive_folder_status: z.string().nullish(),
  notes: z.string().nullish(),
});

const updateSchema = z.object({
  mobilisation_date: z.string().optional(),
  mobilisation_time: z.string().nullable().optional(),
  team_lead_id: z.string().uuid().nullable().optional(),
  team_description: z.string().nullable().optional(),
  equipment_notes: z.string().nullable().optional(),
  site_contact_name: z.string().nullable().optional(),
  site_contact_phone: z.string().nullable().optional(),
  client_confirmed: z.boolean().optional(),
  client_confirmed_at: z.string().nullable().optional(),
  admin_override: z.boolean().optional(),
  admin_override_by: z.string().uuid().nullable().optional(),
  admin_override_at: z.string().nullable().optional(),
  drive_folder_id: z.string().nullable().optional(),
  drive_folder_url: z.string().nullable().optional(),
  drive_folder_status: z.string().nullable().optional(),
  notification_sent: z.boolean().optional(),
  notification_sent_at: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const mobilisationRouter = Router();
mobilisationRouter.use(authenticate);

// GET /mobilisation?enquiry_id=    -> single row or null
// GET /mobilisation?enquiry_ids=.. -> list (pipeline queue)
mobilisationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    if (typeof req.query.enquiry_ids === 'string' && req.query.enquiry_ids) {
      const ids = req.query.enquiry_ids.split(',').map((s) => s.trim()).filter(Boolean);
      const rows = ids.length
        ? await db.select().from(mobilisation).where(inArray(mobilisation.enquiry_id, ids))
        : [];
      res.json(rows);
      return;
    }
    const enquiryId = z.string().uuid().parse(req.query.enquiry_id);
    const rows = await db.select().from(mobilisation).where(eq(mobilisation.enquiry_id, enquiryId)).limit(1);
    res.json(rows[0] ?? null);
  }),
);

mobilisationRouter.post(
  '/',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const rows = await db.insert(mobilisation).values(body).returning();
    res.status(201).json(rows[0]);
  }),
);

mobilisationRouter.patch(
  '/:id',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const rows = await db.update(mobilisation).set(body).where(eq(mobilisation.id, getParam(req, 'id'))).returning();
    if (!rows[0]) throw notFound('Mobilisation not found');
    res.json(rows[0]);
  }),
);

// ── Confirmation tokens ──
// Latest token for a mobilisation (used to show confirmation status; replaces the
// realtime channel with an on-demand poll).
mobilisationRouter.get(
  '/:id/confirmation-token',
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(mob_confirmation_tokens)
      .where(eq(mob_confirmation_tokens.mobilisation_id, getParam(req, 'id')))
      .orderBy(desc(mob_confirmation_tokens.created_at))
      .limit(1);
    res.json(rows[0] ?? null);
  }),
);

// Issue (or re-issue) a confirmation token: supersede any prior pending/alternate
// tokens, then create a fresh one. Returns the new token row.
mobilisationRouter.post(
  '/:id/confirmation-token',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    getAuth(req);
    const mobId = getParam(req, 'id');
    const body = z
      .object({
        enquiry_id: z.string().uuid(),
        client_id: z.string().uuid().nullish(),
        expires_days: z.number().int().positive().max(60).default(7),
      })
      .parse(req.body);

    const expiresAt = new Date(Date.now() + body.expires_days * 86_400_000).toISOString();
    const token = randomBytes(16).toString('hex'); // 32 chars

    const result = await db.transaction(async (tx) => {
      await tx
        .update(mob_confirmation_tokens)
        .set({ status: 'expired' })
        .where(
          and(
            eq(mob_confirmation_tokens.mobilisation_id, mobId),
            inArray(mob_confirmation_tokens.status, ['pending', 'alternate_proposed']),
          ),
        );
      const inserted = await tx
        .insert(mob_confirmation_tokens)
        .values({
          mobilisation_id: mobId,
          enquiry_id: body.enquiry_id,
          client_id: body.client_id ?? null,
          token,
          status: 'pending',
          expires_at: expiresAt,
        })
        .returning();
      return inserted[0];
    });

    if (!result) throw badRequest('Failed to issue confirmation token');
    res.status(201).json(result);
  }),
);

// Update a confirmation token (team-lead accepting an alternate date, or admin
// override confirming on the client's behalf).
const tokenUpdateSchema = z.object({
  status: z.string().optional(),
  confirmed_at: z.string().nullable().optional(),
  alternate_date: z.string().nullable().optional(),
  alternate_notes: z.string().nullable().optional(),
});
mobilisationRouter.patch(
  '/confirmation-token/:tokenId',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = tokenUpdateSchema.parse(req.body);
    const rows = await db
      .update(mob_confirmation_tokens)
      .set(body)
      .where(eq(mob_confirmation_tokens.id, getParam(req, 'tokenId')))
      .returning();
    if (!rows[0]) throw notFound('Confirmation token not found');
    res.json(rows[0]);
  }),
);
