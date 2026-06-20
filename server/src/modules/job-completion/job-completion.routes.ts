import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { job_completion, job_reminders } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { requireNotViewer } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { notFound } from '../../lib/errors';

const updateSchema = z.object({
  site_completion_date: z.string().nullable().optional(),
  site_completed_actual: z.string().nullable().optional(),
  site_done: z.boolean().optional(),
  site_completion_notes: z.string().nullable().optional(),
  report_delivery_date: z.string().nullable().optional(),
  report_delivered_actual: z.string().nullable().optional(),
  report_done: z.boolean().optional(),
  report_delivery_notes: z.string().nullable().optional(),
  report_file_url: z.string().nullable().optional(),
  final_bill_date: z.string().nullable().optional(),
  final_bill_raised_actual: z.string().nullable().optional(),
  final_bill_done: z.boolean().optional(),
  final_bill_amount: z.number().nullable().optional(),
  final_bill_notes: z.string().nullable().optional(),
  final_bill_url: z.string().nullable().optional(),
  mobilisation_id: z.string().uuid().nullable().optional(),
});

const reminderSchema = z.object({
  job_id: z.string().uuid(),
  enquiry_id: z.string().uuid(),
  reminder_type: z.string().min(1),
  days_before: z.number().int(),
  scheduled_for: z.string(),
  target_date: z.string(),
  channels: z.array(z.string()).nullish(),
});

export const jobCompletionRouter = Router();
jobCompletionRouter.use(authenticate);

// ── Reminders (defined before /:id so the path is not captured) ──
jobCompletionRouter.get(
  '/reminders',
  asyncHandler(async (req, res) => {
    const enquiryId = z.string().uuid().parse(req.query.enquiry_id);
    const rows = await db
      .select()
      .from(job_reminders)
      .where(eq(job_reminders.enquiry_id, enquiryId))
      .orderBy(asc(job_reminders.reminder_type), desc(job_reminders.days_before));
    res.json(rows);
  }),
);

jobCompletionRouter.post(
  '/reminders',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = reminderSchema.parse(req.body);
    const rows = await db.insert(job_reminders).values(body).returning();
    res.status(201).json(rows[0]);
  }),
);

// Delete unsent reminders for a job + reminder_type (used when a target date changes).
jobCompletionRouter.delete(
  '/reminders',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const jobId = z.string().uuid().parse(req.query.job_id);
    const reminderType = z.string().min(1).parse(req.query.reminder_type);
    await db
      .delete(job_reminders)
      .where(
        and(
          eq(job_reminders.job_id, jobId),
          eq(job_reminders.reminder_type, reminderType),
          eq(job_reminders.sent, false),
        ),
      );
    res.json({ success: true });
  }),
);

// ── Job completion (one row per enquiry) ──
jobCompletionRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const enquiryId = z.string().uuid().parse(req.query.enquiry_id);
    const rows = await db
      .select()
      .from(job_completion)
      .where(eq(job_completion.enquiry_id, enquiryId))
      .limit(1);
    res.json(rows[0] ?? null);
  }),
);

// Get-or-create the tracker for an enquiry.
jobCompletionRouter.post(
  '/',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const { enquiry_id } = z.object({ enquiry_id: z.string().uuid() }).parse(req.body);
    await db.insert(job_completion).values({ enquiry_id }).onConflictDoNothing();
    const rows = await db
      .select()
      .from(job_completion)
      .where(eq(job_completion.enquiry_id, enquiry_id))
      .limit(1);
    res.status(201).json(rows[0]);
  }),
);

jobCompletionRouter.patch(
  '/:id',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const rows = await db
      .update(job_completion)
      .set(body)
      .where(eq(job_completion.id, getParam(req, 'id')))
      .returning();
    if (!rows[0]) throw notFound('Job completion not found');
    res.json(rows[0]);
  }),
);
