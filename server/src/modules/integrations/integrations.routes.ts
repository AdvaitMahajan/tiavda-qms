import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireNotViewer, requireFeature } from '../../middleware/roles';
import { asyncHandler } from '../../lib/http';
import { sendEmail } from '../../integrations/email';
import { sendWhatsApp } from '../../integrations/whatsapp';
import { createDriveFolder } from '../../integrations/drive';

const emailSchema = z.object({
  to: z.union([z.string(), z.array(z.string())]),
  subject: z.string().optional(),
  html_body: z.string().optional(),
  template: z.string().optional(),
  params: z.record(z.string(), z.any()).optional(),
  attachment_path: z.string().optional(),
  attachment_bucket: z.string().optional(),
  attachment_url: z.string().optional(),
});

const whatsappSchema = z.object({
  phone_number: z.string().min(1),
  template_name: z.string().min(1),
  parameters: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
});

const driveSchema = z.object({
  enquiry_id: z.string().uuid(),
  ref_number: z.string(),
  client_name: z.string(),
  city: z.string(),
});

// All integration sends require a non-viewer. Results are returned as structured
// JSON (200) so the client can read { success | error | whatsapp_invalid }.
export const integrationsRouter = Router();
integrationsRouter.use(authenticate, requireFeature('comms'));

integrationsRouter.post(
  '/email',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = emailSchema.parse(req.body);
    res.json(await sendEmail(body as Parameters<typeof sendEmail>[0]));
  }),
);

integrationsRouter.post(
  '/whatsapp',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = whatsappSchema.parse(req.body);
    res.json(await sendWhatsApp(body));
  }),
);

integrationsRouter.post(
  '/drive-folder',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = driveSchema.parse(req.body);
    res.json(await createDriveFolder(body));
  }),
);
