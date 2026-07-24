import { Router } from 'express';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { team_members } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { requireEditor } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { notFound } from '../../lib/errors';

/**
 * Operations team directory — who does what, and how to reach them. Exists
 * independently of `profiles` so the team can be recorded (and mobilisations
 * discussed) before their logins are created; `profile_id` links a member to
 * their account once the email address is known and the user is invited.
 *
 * Readable by any authenticated user in the org (assignment pickers need it);
 * edits are admin-only.
 */
export const teamMembersRouter = Router();
teamMembersRouter.use(authenticate);

const APP_ROLES = [
  'super_admin', 'admin', 'mobilization_lead',
  'execution_head', 'execution', 'planning', 'reporting', 'accounts',
  'viewer',
] as const;

const bodySchema = z.object({
  full_name: z.string().min(1),
  phone: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal('')),
  responsibility: z.string().nullish(),
  app_role: z.enum(APP_ROLES).nullish(),
  city: z.string().nullish(),
  profile_id: z.string().uuid().nullish(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  notes: z.string().nullish(),
});

teamMembersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select()
      .from(team_members)
      .where(eq(team_members.org_id, requireOrgId()))
      .orderBy(asc(team_members.sort_order), asc(team_members.full_name));
    res.json(rows);
  }),
);

teamMembersRouter.post(
  '/',
  requireEditor,
  asyncHandler(async (req, res) => {
    const body = bodySchema.parse(req.body);
    const rows = await db
      .insert(team_members)
      .values({ ...body, email: body.email || null, org_id: requireOrgId() })
      .returning();
    res.status(201).json(rows[0]);
  }),
);

teamMembersRouter.patch(
  '/:id',
  requireEditor,
  asyncHandler(async (req, res) => {
    const body = bodySchema.partial().parse(req.body);
    const rows = await db
      .update(team_members)
      .set({ ...body, ...(body.email !== undefined ? { email: body.email || null } : {}) })
      .where(eq(team_members.id, getParam(req, 'id')))
      .returning();
    if (!rows[0]) throw notFound('Team member not found');
    res.json(rows[0]);
  }),
);

teamMembersRouter.delete(
  '/:id',
  requireEditor,
  asyncHandler(async (req, res) => {
    await db.delete(team_members).where(eq(team_members.id, getParam(req, 'id')));
    res.json({ success: true });
  }),
);
