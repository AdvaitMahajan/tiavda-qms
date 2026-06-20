import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, getAuth } from '../../middleware/auth';
import { requireNotViewer } from '../../middleware/roles';
import { asyncHandler } from '../../lib/http';
import { badRequest } from '../../lib/errors';
import { supabaseAdmin } from '../../lib/supabase';

const BUCKETS = ['quotation-pdfs', 'receipts', 'reports', 'site-visit-photos', 'intake-uploads'] as const;
const bucketSchema = z.enum(BUCKETS);

// Every object is namespaced under the caller's org_id, so a caller can only ever
// sign/upload/read paths within their own tenant prefix — even if they knew
// another org's object path. Idempotent (won't double-prefix).
function orgScopedPath(req: Request, path: string): string {
  const orgId = getAuth(req).orgId;
  if (!orgId) throw badRequest('No organization context for storage');
  return path === orgId || path.startsWith(`${orgId}/`) ? path : `${orgId}/${path}`;
}

// Browser uploads go directly to Supabase Storage via a short-lived signed upload
// URL (no file passes through this API). Downloads use signed URLs for private buckets.
export const storageRouter = Router();
storageRouter.use(authenticate);

storageRouter.post(
  '/sign-upload',
  requireNotViewer,
  asyncHandler(async (req, res) => {
    const { bucket, path, upsert } = z
      .object({ bucket: bucketSchema, path: z.string().min(1), upsert: z.boolean().optional() })
      .parse(req.body);
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUploadUrl(orgScopedPath(req, path), { upsert: upsert ?? false });
    if (error || !data) throw badRequest(error?.message ?? 'Failed to create upload URL');
    res.json({ bucket, ...data }); // { signedUrl, token, path } — path is org-prefixed
  }),
);

storageRouter.post(
  '/sign-url',
  asyncHandler(async (req, res) => {
    const { bucket, path, expires_in } = z
      .object({ bucket: bucketSchema, path: z.string().min(1), expires_in: z.number().int().positive().optional() })
      .parse(req.body);
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(orgScopedPath(req, path), expires_in ?? 86_400 * 30);
    if (error || !data) throw badRequest(error?.message ?? 'Failed to create signed URL');
    res.json({ signed_url: data.signedUrl });
  }),
);

storageRouter.get(
  '/public-url',
  asyncHandler(async (req, res) => {
    const bucket = bucketSchema.parse(req.query.bucket);
    const path = z.string().min(1).parse(req.query.path);
    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(orgScopedPath(req, path));
    res.json({ public_url: data.publicUrl });
  }),
);
