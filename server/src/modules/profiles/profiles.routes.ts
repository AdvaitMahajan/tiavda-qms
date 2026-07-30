import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import { profiles, organizations } from '../../db/schema';
import { authenticate, getAuth } from '../../middleware/auth';
import { requireEditor } from '../../middleware/roles';
import { isSuperAdmin } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { forbidden, notFound } from '../../lib/errors';

const ROLE = z.enum([
  'super_admin', 'admin', 'mobilization_lead',
  'execution_head', 'execution', 'planning', 'reporting', 'accounts', 'lab',
  'viewer',
]);

const listQuery = z.object({
  is_active: z.coerce.boolean().optional(),
  role: ROLE.optional(),
});

const updateSchema = z.object({
  role: ROLE.optional(),
  is_active: z.boolean().optional(),
  full_name: z.string().nullish(),
  phone: z.string().nullish(),
});

export const profilesRouter = Router();
profilesRouter.use(authenticate);

// List team members (used by AssigneeDropdown, TeamManagement, mobilisation).
profilesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const conds: SQL[] = [];
    if (q.is_active !== undefined) conds.push(eq(profiles.is_active, q.is_active));
    if (q.role) conds.push(eq(profiles.role, q.role));
    const rows = await db
      .select()
      .from(profiles)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(profiles.full_name));
    res.json(rows);
  }),
);

// Current user's profile + organization + platform-admin flag (powers useAuth,
// the top-bar org name, and Admin Console gating). Must precede '/:id'.
profilesRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const auth = getAuth(req);
    const rows = await db.select().from(profiles).where(eq(profiles.id, auth.userId)).limit(1);
    const profile = rows[0] ?? null;
    let organization: typeof organizations.$inferSelect | null = null;
    if (profile?.org_id) {
      const orgs = await db.select().from(organizations).where(eq(organizations.id, profile.org_id)).limit(1);
      organization = orgs[0] ?? null;
    }
    res.json({ profile, organization, is_platform_admin: auth.isPlatformAdmin });
  }),
);

profilesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const rows = await db.select().from(profiles).where(eq(profiles.id, getParam(req, 'id'))).limit(1);
    if (!rows[0]) throw notFound('Profile not found');
    res.json(rows[0]);
  }),
);

// Update role / active flag. Admins may manage members; only super admins may
// grant the super_admin role (mirrors invite-user's server-side check).
profilesRouter.patch(
  '/:id',
  requireEditor,
  asyncHandler(async (req, res) => {
    const auth = getAuth(req);
    const body = updateSchema.parse(req.body);
    if (body.role === 'super_admin' && !isSuperAdmin(auth.role)) {
      throw forbidden('Only super admins can assign the super_admin role');
    }
    const rows = await db
      .update(profiles)
      .set(body)
      .where(eq(profiles.id, getParam(req, 'id')))
      .returning();
    if (!rows[0]) throw notFound('Profile not found');
    res.json(rows[0]);
  }),
);
