import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/http';
import { badRequest, notFound } from '../../lib/errors';
import { supabaseAdmin } from '../../lib/supabase';
import { sendEmail } from '../../integrations/email';
import { sendWhatsApp } from '../../integrations/whatsapp';

/**
 * PUBLIC, unauthenticated, token-gated endpoints. They proxy the SECURITY DEFINER
 * RPCs that already validate the opaque token internally, so no JWT is required —
 * exactly as the anon Supabase client used them.
 */
export const publicRouter = Router();

async function rpc(name: string, args: Record<string, unknown>, res: import('express').Response) {
  const { data, error } = await supabaseAdmin.rpc(name, args);
  if (error) throw badRequest(error.message);
  res.json(data);
}

// ── Intake ──
publicRouter.get(
  '/intake/validate',
  asyncHandler(async (req, res) => {
    const token = z.string().min(1).parse(req.query.token);
    const { data, error } = await supabaseAdmin
      .from('intake_tokens')
      .select('id, status, expires_at, client_id')
      .eq('token', token)
      .maybeSingle();
    if (error) throw badRequest(error.message);
    res.json(data);
  }),
);

const intakeSubmitSchema = z.object({
  token: z.string(),
  site_address: z.string(),
  site_city: z.string(),
  site_state: z.string().nullish(),
  site_pincode: z.string().nullish(),
  structure_type: z.string(),
  num_floors: z.number().int().nullish(),
  basement_floors: z.number().int().nullish(),
  num_bores: z.number().int(),
  expected_depth_m: z.number().nullish(),
  soil_type_hint: z.string().nullish(),
  remarks: z.string().nullish(),
  extended: z.any().optional(),
  client_name: z.string().optional(),
});

publicRouter.post(
  '/intake/submit',
  asyncHandler(async (req, res) => {
    const b = intakeSubmitSchema.parse(req.body);
    const { data, error } = await supabaseAdmin.rpc('submit_intake_form', {
      p_token: b.token,
      p_site_address: b.site_address,
      p_site_city: b.site_city,
      p_site_state: b.site_state ?? null,
      p_site_pincode: b.site_pincode ?? null,
      p_structure_type: b.structure_type,
      p_num_floors: b.num_floors ?? null,
      p_basement_floors: b.basement_floors ?? null,
      p_num_bores: b.num_bores,
      p_expected_depth_m: b.expected_depth_m ?? null,
      p_soil_type_hint: b.soil_type_hint ?? null,
      p_remarks: b.remarks ?? null,
      p_extended: b.extended ?? null,
    });
    if (error) throw badRequest(error.message);

    const result = data as { success?: boolean; enquiry_id?: string; ref_number?: string; error?: string };
    // Best-effort admin notifications (in-app + email/WhatsApp) — never block the response.
    if (result?.success && result.enquiry_id && result.ref_number) {
      void notifyAdminsOfIntake(result.enquiry_id, result.ref_number, b.site_city, b.client_name ?? '', b.structure_type, b.num_bores);
    }
    res.json(result);
  }),
);

async function notifyAdminsOfIntake(
  enquiryId: string,
  refNumber: string,
  city: string,
  clientName: string,
  structureType: string,
  numBores: number,
): Promise<void> {
  try {
    await supabaseAdmin.rpc('notify_admin_intake', {
      p_city: city,
      p_client_name: clientName,
      p_enquiry_id: enquiryId,
      p_ref_number: refNumber,
    });
  } catch {
    /* in-app notify is best-effort */
  }
  try {
    const { data: settings } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .in('key', ['admin_email', 'admin_whatsapp']);
    const map = new Map((settings ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const adminEmail = map.get('admin_email');
    const adminWhatsapp = map.get('admin_whatsapp');
    if (adminEmail) {
      await sendEmail({
        to: adminEmail,
        template: 'new_intake_admin',
        params: { ref_number: refNumber, site_city: city, structure_type: structureType, num_bores: numBores },
      });
    }
    if (adminWhatsapp) {
      await sendWhatsApp({
        phone_number: adminWhatsapp,
        template_name: 'qms_intake_submitted',
        parameters: [
          { name: 'ref_number', value: refNumber },
          { name: 'city', value: city },
        ],
      });
    }
  } catch {
    /* admin email/WhatsApp is best-effort */
  }
}

publicRouter.post(
  '/intake/attach-files',
  asyncHandler(async (req, res) => {
    const b = z.object({ submission_id: z.string().uuid(), attachments: z.any() }).parse(req.body);
    await rpc('attach_intake_files', { p_submission_id: b.submission_id, p_attachments: b.attachments }, res);
  }),
);

publicRouter.post(
  '/intake/sign-upload',
  asyncHandler(async (req, res) => {
    const b = z.object({ token: z.string().min(1), path: z.string().min(1) }).parse(req.body);
    const { data: tok } = await supabaseAdmin
      .from('intake_tokens')
      .select('status, expires_at')
      .eq('token', b.token)
      .maybeSingle();
    if (!tok) throw notFound('Invalid intake token');
    if (tok.status === 'expired' || new Date(tok.expires_at) < new Date()) throw badRequest('Intake link expired');
    const { data, error } = await supabaseAdmin.storage.from('intake-uploads').createSignedUploadUrl(b.path);
    if (error || !data) throw badRequest(error?.message ?? 'Failed to create upload URL');
    res.json({ bucket: 'intake-uploads', ...data });
  }),
);

// ── Site visit (field form) ──
publicRouter.get(
  '/site-visit',
  asyncHandler(async (req, res) => {
    const token = z.string().min(1).parse(req.query.token);
    await rpc('get_site_visit', { p_token: token }, res);
  }),
);

publicRouter.post(
  '/site-visit/submit',
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        token: z.string(),
        feasibility: z.string(),
        water: z.boolean(),
        access: z.boolean(),
        security: z.boolean(),
        fencing: z.boolean(),
        observations: z.string(),
        recommendations: z.string(),
        cost_factors: z.any(),
      })
      .parse(req.body);
    await rpc(
      'submit_site_visit',
      {
        p_token: b.token,
        p_feasibility: b.feasibility,
        p_water: b.water,
        p_access: b.access,
        p_security: b.security,
        p_fencing: b.fencing,
        p_observations: b.observations,
        p_recommendations: b.recommendations,
        p_cost_factors: b.cost_factors,
      },
      res,
    );
  }),
);

publicRouter.post(
  '/site-visit/sign-upload',
  asyncHandler(async (req, res) => {
    const b = z.object({ token: z.string().min(1), path: z.string().min(1) }).parse(req.body);
    const { data: sv } = await supabaseAdmin.from('site_visits').select('id').eq('token', b.token).maybeSingle();
    if (!sv) throw notFound('Invalid site visit token');
    const { data, error } = await supabaseAdmin.storage.from('site-visit-photos').createSignedUploadUrl(b.path);
    if (error || !data) throw badRequest(error?.message ?? 'Failed to create upload URL');
    res.json({ bucket: 'site-visit-photos', ...data });
  }),
);

// ── Mobilisation confirmation ──
publicRouter.get(
  '/mob-confirmation',
  asyncHandler(async (req, res) => {
    const token = z.string().min(1).parse(req.query.token);
    await rpc('get_mob_confirmation', { p_token: token }, res);
  }),
);

publicRouter.post(
  '/mob-confirmation/confirm',
  asyncHandler(async (req, res) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    const { data, error } = await supabaseAdmin.rpc('confirm_mobilisation', { p_token: token });
    if (error) throw badRequest(error.message);

    // Best-effort client acknowledgement (thank-you) once genuinely confirmed.
    // Never blocks or fails the confirmation response; inert until creds exist.
    try {
      if (data && (data as { status?: string }).status === 'confirmed') {
        const { data: tok } = await supabaseAdmin
          .from('mob_confirmation_tokens')
          .select('client_id, enquiry_id, mobilisation_id')
          .eq('token', token)
          .maybeSingle();
        if (tok) {
          const [{ data: client }, { data: enq }, { data: mob }] = await Promise.all([
            supabaseAdmin.from('clients').select('name, email, email_bounced, whatsapp_number, whatsapp_invalid').eq('id', tok.client_id).maybeSingle(),
            supabaseAdmin.from('enquiries').select('ref_number, site_city').eq('id', tok.enquiry_id).maybeSingle(),
            supabaseAdmin.from('mobilisation').select('mobilisation_date').eq('id', tok.mobilisation_id).maybeSingle(),
          ]);
          const ref = enq?.ref_number ?? '';
          const city = enq?.site_city ?? '';
          const dateStr = mob?.mobilisation_date
            ? new Date(mob.mobilisation_date as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
            : '';
          const clientName = client?.name ?? 'Client';
          if (client?.email && !client.email_bounced) {
            await sendEmail({
              to: client.email,
              template: 'mobilisation_acknowledged',
              params: { client_name: clientName, ref_number: ref, date: dateStr, city },
            });
          }
          if (client?.whatsapp_number && !client.whatsapp_invalid) {
            await sendWhatsApp({
              phone_number: client.whatsapp_number,
              template_name: 'qms_mobilisation_acknowledged',
              parameters: [
                { name: 'client_name', value: clientName },
                { name: 'ref_number', value: ref },
                { name: 'date', value: dateStr },
              ],
            });
          }
        }
      }
    } catch {
      /* acknowledgement is best-effort */
    }

    res.json(data);
  }),
);

publicRouter.post(
  '/mob-confirmation/propose-alternate',
  asyncHandler(async (req, res) => {
    const b = z.object({ token: z.string().min(1), date: z.string(), notes: z.string().nullish() }).parse(req.body);
    await rpc('propose_alternate_mobilisation', { p_token: b.token, p_date: b.date, p_notes: b.notes ?? null }, res);
  }),
);
