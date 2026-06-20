import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { notifications } from '../../db/schema';
import { authenticate, getAuth } from '../../middleware/auth';
import { requireNotViewer } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';

const createSchema = z.object({
  user_id: z.string().uuid(),
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  enquiry_id: z.string().uuid().nullish(),
  link: z.string().nullish(),
});

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

// Always scoped to the calling user — a user only ever sees their own notifications.
notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = getAuth(req);
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, auth.userId))
      .orderBy(desc(notifications.created_at))
      .limit(limit);
    res.json(rows);
  }),
);

notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const auth = getAuth(req);
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.user_id, auth.userId), eq(notifications.read, false)));
    res.json({ count: rows[0]?.count ?? 0 });
  }),
);

notificationsRouter.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    const auth = getAuth(req);
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.user_id, auth.userId), eq(notifications.read, false)));
    res.json({ success: true });
  }),
);

notificationsRouter.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const auth = getAuth(req);
    const rows = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, getParam(req, 'id')), eq(notifications.user_id, auth.userId)))
      .returning();
    res.json(rows[0] ?? { success: true });
  }),
);

// Create a notification for another user (e.g. assignment, payment received).
notificationsRouter.post(
  '/',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const rows = await db.insert(notifications).values({ ...body, org_id: requireOrgId() }).returning();
    res.status(201).json(rows[0]);
  }),
);
