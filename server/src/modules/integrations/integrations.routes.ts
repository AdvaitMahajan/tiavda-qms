import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireNotViewer, requireFeature } from '../../middleware/roles';
import { asyncHandler } from '../../lib/http';
import { sendEmail } from '../../integrations/email';
import { sendWhatsApp } from '../../integrations/whatsapp';
import { createDriveFolder, uploadToDrive } from '../../integrations/drive';
import { supabaseAdmin } from '../../lib/supabase';
import { currentOrgId } from '../../db';

const emailSchema = z.object({
  to: z.union([z.string(), z.array(z.string())]),
  subject: z.string().optional(),
  subject_prefix: z.string().optional(),
  reply_to: z.string().optional(),
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

/** Copy a file already in Supabase Storage into the job's Drive folder. */
const driveFileSchema = z.object({
  ref_number: z.string(),
  client_name: z.string(),
  city: z.string(),
  bucket: z.enum(['quotation-pdfs', 'receipts', 'reports', 'site-visit-photos', 'intake-uploads']),
  path: z.string().min(1),
  subfolder: z.string().min(1),
  file_name: z.string().min(1).optional(),
  mime_type: z.string().optional(),
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
  '/drive-file',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const body = driveFileSchema.parse(req.body);
    const orgId = currentOrgId();

    // Storage objects are namespaced by org_id while the DB keeps the logical
    // path, so scope it here the way the email attachment path does.
    const scoped =
      orgId && body.path !== orgId && !body.path.startsWith(`${orgId}/`) ? `${orgId}/${body.path}` : body.path;
    const { data, error } = await supabaseAdmin.storage.from(body.bucket).download(scoped);
    if (error || !data) {
      res.json({ success: false, error: `Could not read ${body.bucket}/${scoped}` });
      return;
    }

    res.json(
      await uploadToDrive({
        orgId,
        ref_number: body.ref_number,
        client_name: body.client_name,
        city: body.city,
        subfolder: body.subfolder,
        file_name: body.file_name || body.path.split('/').pop() || 'file',
        mime_type: body.mime_type || data.type || 'application/octet-stream',
        bytes: Buffer.from(await data.arrayBuffer()),
      }),
    );
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
