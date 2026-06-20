/**
 * Plans + per-org feature flags. Features are the source of truth (stored on
 * organizations.features); plans are presets the owner can start from and then
 * override per client. Enforced hard in the API via requireFeature().
 *
 * Toggleable features (base CRM — clients/enquiries/follow-ups/dashboard/
 * notifications/job-completion — is always on):
 *   quotations  → Quotations + Rate Matrix
 *   payments    → Payments + Accounts
 *   site_visits → Site Visits + Mobilisation
 *   comms       → Email / WhatsApp / Drive integrations
 */
export const FEATURE_KEYS = ['quotations', 'payments', 'site_visits', 'comms'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureMap = Record<FeatureKey, boolean>;

export const PLAN_KEYS = ['starter', 'pro', 'enterprise'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const PLAN_FEATURES: Record<PlanKey, FeatureMap> = {
  starter: { quotations: true, payments: false, site_visits: false, comms: false },
  pro: { quotations: true, payments: true, site_visits: true, comms: false },
  enterprise: { quotations: true, payments: true, site_visits: true, comms: true },
};

export const PLAN_LIMITS: Record<PlanKey, { max_users: number | null }> = {
  starter: { max_users: 3 },
  pro: { max_users: 10 },
  enterprise: { max_users: null },
};

export function featuresForPlan(plan: string | null | undefined): FeatureMap {
  return PLAN_FEATURES[(plan as PlanKey)] ?? PLAN_FEATURES.pro;
}

export function limitsForPlan(plan: string | null | undefined): { max_users: number | null } {
  return PLAN_LIMITS[(plan as PlanKey)] ?? PLAN_LIMITS.pro;
}

/** Normalise an arbitrary object into a full FeatureMap (missing keys → false). */
export function normaliseFeatures(input: Record<string, unknown> | null | undefined): FeatureMap {
  const out = {} as FeatureMap;
  for (const k of FEATURE_KEYS) out[k] = input?.[k] === true;
  return out;
}
