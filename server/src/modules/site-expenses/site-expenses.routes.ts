import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { site_expenses } from '../../db/schema';
import { authenticate, getAuth } from '../../middleware/auth';
import { requireMobiliser, requireManager } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { notFound } from '../../lib/errors';

/**
 * Site Expenses under Mobilisation (#6). The Site Supervisor (mobilisation team
 * lead — a mobilising role) records expenses; a Manager (Admin / Execution Head)
 * approves or rejects. Approve/reject stamp approved_by/approved_at like the
 * quotation approval flow.
 */
export const siteExpensesRouter = Router();
siteExpensesRouter.use(authenticate);

const createSchema = z.object({
  enquiry_id: z.string().uuid(),
  expense_head: z.string().optional(),
  description: z.string().nullish(),
  amount: z.number().nonnegative(),
  expense_date: z.string().nullish(),
  receipt_url: z.string().nullish(),
});

siteExpensesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const enquiryId = String(req.query.enquiry_id ?? '');
    const where = enquiryId
      ? and(eq(site_expenses.org_id, requireOrgId()), eq(site_expenses.enquiry_id, enquiryId))
      : eq(site_expenses.org_id, requireOrgId());
    const rows = await db.select().from(site_expenses).where(where).orderBy(asc(site_expenses.created_at));
    res.json(rows);
  }),
);

// Record an expense — the assigned team / mobilising roles.
siteExpensesRouter.post(
  '/',
  requireMobiliser,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const rows = await db
      .insert(site_expenses)
      .values({ ...body, org_id: requireOrgId(), submitted_by: getAuth(req).userId, status: 'pending' })
      .returning();
    res.status(201).json(rows[0]);
  }),
);

// Edit own pending expense.
siteExpensesRouter.patch(
  '/:id',
  requireMobiliser,
  asyncHandler(async (req, res) => {
    const body = createSchema.partial().omit({ enquiry_id: true }).parse(req.body);
    const rows = await db
      .update(site_expenses)
      .set(body)
      .where(and(eq(site_expenses.id, getParam(req, 'id')), eq(site_expenses.status, 'pending')))
      .returning();
    if (!rows[0]) throw notFound('Expense not found or already decided');
    res.json(rows[0]);
  }),
);

// Manager decision.
function decide(status: 'approved' | 'rejected'): import('express').RequestHandler {
  return asyncHandler(async (req, res) => {
    const { note } = z.object({ note: z.string().nullish() }).parse(req.body ?? {});
    const rows = await db
      .update(site_expenses)
      .set({
        status,
        approved_by: getAuth(req).userId,
        approved_at: new Date().toISOString(),
        decision_note: note ?? null,
      })
      .where(eq(site_expenses.id, getParam(req, 'id')))
      .returning();
    if (!rows[0]) throw notFound('Expense not found');
    res.json(rows[0]);
  });
}
siteExpensesRouter.post('/:id/approve', requireManager, decide('approved'));
siteExpensesRouter.post('/:id/reject', requireManager, decide('rejected'));

siteExpensesRouter.delete(
  '/:id',
  requireMobiliser,
  asyncHandler(async (req, res) => {
    await db
      .delete(site_expenses)
      .where(and(eq(site_expenses.id, getParam(req, 'id')), eq(site_expenses.status, 'pending')));
    res.json({ success: true });
  }),
);
