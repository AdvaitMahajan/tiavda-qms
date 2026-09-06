import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../env';
import { authenticate, getAuth } from '../../middleware/auth';
import { requirePlatformAdmin } from '../../middleware/roles';
import { asyncHandler, getParam } from '../../lib/http';
import { badRequest, notFound } from '../../lib/errors';
import { supabaseAdmin } from '../../lib/supabase';
import {
  upsertOrgIntegration,
  listOrgIntegrationStatus,
  type IntegrationProvider,
} from '../../lib/org-integrations';
import { PLAN_KEYS, featuresForPlan, limitsForPlan, normaliseFeatures } from '../../lib/plans';

/**
 * Platform-admin console (cross-org). Uses the service-role client throughout —
 * these operations are inherently cross-tenant and trusted. The owner manages
 * orgs, provisions each org's first admin, and sets per-org integration keys.
 * Owner visibility is metadata-only: NO business-data (enquiries/quotes/payments)
 * endpoints live here.
 */
export const adminRouter = Router();
adminRouter.use(authenticate, requirePlatformAdmin);

const ROLE = z.enum(['super_admin', 'admin', 'mobilization_lead', 'viewer']);

// ── Organizations ──
adminRouter.get(
  '/orgs',
  asyncHandler(async (_req, res) => {
    const { data: orgs, error } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw badRequest(error.message);
    const { data: profs } = await supabaseAdmin.from('profiles').select('org_id, is_active');
    const counts = new Map<string, number>();
    for (const p of profs ?? []) {
      if (p.org_id) counts.set(p.org_id, (counts.get(p.org_id) ?? 0) + 1);
    }
    res.json((orgs ?? []).map((o) => ({ ...o, user_count: counts.get(o.id) ?? 0 })));
  }),
);

adminRouter.post(
  '/orgs',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        slug: z.string().min(1).optional(),
        plan: z.enum(PLAN_KEYS).default('pro'),
        features: z.record(z.boolean()).optional(),
      })
      .parse(req.body);
    const features = body.features ? normaliseFeatures(body.features) : featuresForPlan(body.plan);
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: body.name,
        slug: body.slug ?? null,
        plan: body.plan,
        features,
        limits: limitsForPlan(body.plan),
      })
      .select()
      .single();
    if (error) throw badRequest(error.message);
    res.status(201).json(data);
  }),
);

adminRouter.patch(
  '/orgs/:id',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        status: z.enum(['active', 'suspended']).optional(),
        plan: z.enum(PLAN_KEYS).optional(),
        features: z.record(z.boolean()).optional(),
        limits: z.record(z.any()).optional(),
      })
      .parse(req.body);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.status !== undefined) patch.status = body.status;
    if (body.plan !== undefined) {
      patch.plan = body.plan;
      // Changing plan resets features/limits to that plan's preset unless the
      // request also sends explicit features/limits (overrides).
      if (body.features === undefined) patch.features = featuresForPlan(body.plan);
      if (body.limits === undefined) patch.limits = limitsForPlan(body.plan);
    }
    if (body.features !== undefined) patch.features = normaliseFeatures(body.features);
    if (body.limits !== undefined) patch.limits = body.limits;

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .update(patch)
      .eq('id', getParam(req, 'id'))
      .select()
      .single();
    if (error) throw badRequest(error.message);
    if (!data) throw notFound('Organization not found');
    res.json(data);
  }),
);

// ── Org users (provision the first admin, list members) ──
adminRouter.get(
  '/orgs/:id/users',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, is_active, created_at')
      .eq('org_id', getParam(req, 'id'))
      .order('created_at', { ascending: true });
    if (error) throw badRequest(error.message);
    res.json(data ?? []);
  }),
);

adminRouter.post(
  '/orgs/:id/users',
  asyncHandler(async (req, res) => {
    const orgId = getParam(req, 'id');
    const body = z
      .object({
        email: z.string().email(),
        full_name: z.string().min(1),
        password: z.string().min(6),
        role: ROLE.default('super_admin'),
      })
      .parse(req.body);

    // Enforce the plan's user limit.
    const { data: org } = await supabaseAdmin.from('organizations').select('limits').eq('id', orgId).maybeSingle();
    const maxUsers = (org?.limits as { max_users?: number | null } | null)?.max_users ?? null;
    if (maxUsers != null) {
      const { count } = await supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
      if ((count ?? 0) >= maxUsers) {
        throw badRequest(`User limit reached for this plan (${maxUsers}). Upgrade the plan to add more users.`);
      }
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name, role: body.role },
    });
    if (error || !data.user) throw badRequest(error?.message ?? 'Failed to create user');
    // Stamp the trigger-created profile into this org (org users are NOT platform admins).
    const { error: upErr } = await supabaseAdmin
      .from('profiles')
      .update({ org_id: orgId, role: body.role, full_name: body.full_name, is_active: true, is_platform_admin: false })
      .eq('id', data.user.id);
    if (upErr) throw badRequest(upErr.message);
    res.status(201).json({ user_id: data.user.id, email: body.email });
  }),
);

// ── Per-org integrations (status + provisioning; secrets never read back) ──
adminRouter.get(
  '/orgs/:id/integrations',
  asyncHandler(async (req, res) => {
    res.json(await listOrgIntegrationStatus(getParam(req, 'id')));
  }),
);

adminRouter.put(
  '/orgs/:id/integrations/:provider',
  asyncHandler(async (req, res) => {
    const provider = z.enum(['email', 'whatsapp', 'drive']).parse(getParam(req, 'provider')) as IntegrationProvider;
    const body = z
      .object({
        config: z.record(z.unknown()).optional(),
        secrets: z.record(z.unknown()).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(req.body);
    // Secrets are encrypted at rest; without ENCRYPTION_KEY the encrypt throws and
    // the console shows a bare "internal server error". Say what is actually wrong.
    if (body.secrets !== undefined && !env.ENCRYPTION_KEY) {
      throw badRequest(
        'ENCRYPTION_KEY is not set on the API. Set it in the server environment (a long random string) and redeploy before saving integration secrets.',
      );
    }
    await upsertOrgIntegration(getParam(req, 'id'), provider, body, getAuth(req).userId);
    res.json({ success: true });
  }),
);
