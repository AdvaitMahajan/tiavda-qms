import { Router } from 'express';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, requireOrgId } from '../../db';
import { communication_log } from '../../db/schema';
import { authenticate } from '../../middleware/auth';
import { requireNotViewer } from '../../middleware/roles';
import { asyncHandler } from '../../lib/http';

const createSchema = z.object({
  enquiry_id: z.string().uuid(),
  client_id: z.string().uuid(),
  channel: z.enum(['email', 'whatsapp', 'in_app']),
  direction: z.enum(['outbound', 'inbound']),
  subject: z.string().nullish(),
  body: z.string().min(1),
  status: z.string().nullish(),
  sent_by: z.string().uuid().nullish(),
  template_id: z.string().nullish(),
  external_msg_id: z.string().nullish(),
  attachments: z.any().optional(),
  error_detail: z.any().optional(),
});

// The communication LOG only. Actual email/WhatsApp delivery is the integrations
// module; callers log here after a send (RLS parity: insert = is_not_viewer).
export const communicationsRouter = Router();
communicationsRouter.use(authenticate);

communicationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const enquiryId = z.string().uuid().parse(req.query.enquiry_id);
    const rows = await db
      .select()
      .from(communication_log)
      .where(eq(communication_log.enquiry_id, enquiryId))
      .orderBy(desc(communication_log.created_at));
    res.json(rows);
  }),
);

communicationsRouter.post(
  '/',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const rows = await db.insert(communication_log).values({ ...body, org_id: requireOrgId() }).returning();
    res.status(201).json(rows[0]);
  }),
);
