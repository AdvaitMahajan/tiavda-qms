import { Router } from 'express';
import { z } from 'zod';
import { asc } from 'drizzle-orm';
import { db } from '../../db';
import { profiles } from '../../db/schema';
import { authenticate, getAuth } from '../../middleware/auth';
import { requireEditor, isSuperAdmin } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { badRequest, forbidden } from '../../lib/errors';
import { supabaseAdmin } from '../../lib/supabase';

const ROLE = z.enum(['super_admin', 'admin', 'mobilization_lead', 'viewer']);

// Auth-admin operations (port of the invite-user edge function). Admins only;
// granting super_admin requires a super_admin caller.
export const teamRouter = Router();
teamRouter.use(authenticate);

teamRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(profiles).orderBy(asc(profiles.created_at));
    res.json(rows);
  }),
);

teamRouter.post(
  '/users',
  requireEditor,
  asyncHandler(async (req, res) => {
    const auth = getAuth(req);
    const body = z
      .object({
        email: z.string().email(),
        full_name: z.string().min(1),
        password: z.string().min(6),
        role: ROLE.default('viewer'),
      })
      .parse(req.body);

    if (body.role === 'super_admin' && !isSuperAdmin(auth.role)) {
      throw forbidden('Only super admins can assign the super_admin role');
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name, role: body.role },
    });
    if (error || !data.user) throw badRequest(error?.message ?? 'Failed to create user');
    // The on_auth_user_created trigger creates the matching profiles row.
    res.status(201).json({ user_id: data.user.id, email: body.email });
  }),
);

teamRouter.post(
  '/users/:id/reset-password',
  requireEditor,
  asyncHandler(async (req, res) => {
    const { password } = z.object({ password: z.string().min(6) }).parse(req.body);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(getParam(req, 'id'), { password });
    if (error) throw badRequest(error.message);
    res.json({ success: true });
  }),
);
