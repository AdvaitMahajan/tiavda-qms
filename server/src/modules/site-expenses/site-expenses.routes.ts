import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { site_expenses, profiles, enquiries, notifications } from '../../db/schema';
import { authenticate, getAuth } from '../../middleware/auth';
import { requireMobiliser, requireManager } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { notFound } from '../../lib/errors';

const formatINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

/** Insert one notification row per target user (in-app; org-scoped). */
async function notifyUsers(
  userIds: string[],
  n: { type: string; title: string; body: string; enquiry_id?: string | null },
) {
  const orgId = requireOrgId();
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!unique.length) return;
  await db.insert(notifications).values(
    unique.map((uid) => ({
      org_id: orgId,
      user_id: uid,
      type: n.type,
      title: n.title,
      body: n.body,
      enquiry_id: n.enquiry_id ?? null,
      link: n.enquiry_id ? `/enquiries/${n.enquiry_id}` : null,
    })),
  );
}

async function managerIds(): Promise<string[]> {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.org_id, requireOrgId()), inArray(profiles.role, ['super_admin', 'admin', 'execution_head']), eq(profiles.is_active, true)));
  return rows.map((r) => r.id);
}

async function enquiryRef(enquiryId: string): Promise<string> {
  const rows = await db.select({ ref: enquiries.ref_number }).from(enquiries).where(eq(enquiries.id, enquiryId)).limit(1);
  return rows[0]?.ref ?? '';
}

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
    // Notify the managers that an expense needs approval.
    const ref = await enquiryRef(body.enquiry_id);
    await notifyUsers(await managerIds(), {
      type: 'expense_approval',
      title: `Site expense to approve — ${ref}`,
      body: `${formatINR(Number(body.amount))}${body.description ? ` · ${body.description}` : ''} — awaiting your approval.`,
      enquiry_id: body.enquiry_id,
    });
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
    // Notify the person who submitted it of the decision.
    const exp = rows[0];
    if (exp.submitted_by) {
      const ref = await enquiryRef(exp.enquiry_id);
      await notifyUsers([exp.submitted_by], {
        type: 'expense_decision',
        title: `Site expense ${status} — ${ref}`,
        body: `${formatINR(Number(exp.amount))}${exp.description ? ` · ${exp.description}` : ''} was ${status}${note ? ` — ${note}` : ''}.`,
        enquiry_id: exp.enquiry_id,
      });
    }
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
