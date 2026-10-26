import { Router } from 'express';
import { z } from 'zod';
import { desc, eq, and, gte, type SQL } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { pending_work } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { requireNotViewer } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { notFound } from '../../lib/errors';

/**
 * Pending Work — a quick to-do list on the dashboard. An entry can be as small
 * as a phone number; it stays open until someone marks it done. Org-scoped by
 * RLS (org_isolation) like every business table.
 */
export const pendingWorkRouter = Router();
pendingWorkRouter.use(authenticate);

const listQuery = z.object({
  // Open entries always; recently finished ones only when asked for.
  include_done_days: z.coerce.number().int().min(0).max(90).default(0),
});

pendingWorkRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const open = await db
      .select()
      .from(pending_work)
      .where(eq(pending_work.status, 'open'))
      .orderBy(desc(pending_work.created_at));
    if (!q.include_done_days) {
      res.json(open);
      return;
    }
    const since = new Date(Date.now() - q.include_done_days * 86_400_000).toISOString();
    const conds: SQL[] = [eq(pending_work.status, 'done')];
    const recent = gte(pending_work.done_at, since);
    if (recent) conds.push(recent);
    const done = await db
      .select()
      .from(pending_work)
      .where(and(...conds))
      .orderBy(desc(pending_work.done_at));
    res.json([...open, ...done]);
  }),
);

pendingWorkRouter.post(
  '/',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const { title } = z.object({ title: z.string().trim().min(1).max(500) }).parse(req.body);
    const rows = await db
      .insert(pending_work)
      .values({ title, org_id: requireOrgId(), created_by: req.auth?.userId ?? null })
      .returning();
    res.status(201).json(rows[0]);
  }),
);

pendingWorkRouter.patch(
  '/:id',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().trim().min(1).max(500).optional(),
        status: z.enum(['open', 'done']).optional(),
      })
      .parse(req.body);
    const patch: Partial<typeof pending_work.$inferInsert> = { ...body };
    if (body.status === 'done') {
      patch.done_at = new Date().toISOString();
      patch.done_by = req.auth?.userId ?? null;
    } else if (body.status === 'open') {
      patch.done_at = null;
      patch.done_by = null;
    }
    const rows = await db.update(pending_work).set(patch).where(eq(pending_work.id, getParam(req, 'id'))).returning();
    if (!rows[0]) throw notFound('Entry not found');
    res.json(rows[0]);
  }),
);

pendingWorkRouter.delete(
  '/:id',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const rows = await db.delete(pending_work).where(eq(pending_work.id, getParam(req, 'id'))).returning({ id: pending_work.id });
    if (!rows[0]) throw notFound('Entry not found');
    res.json({ success: true });
  }),
);
