import { env } from '../env';
import { supabaseAdmin } from './supabase';
import { encryptJson, decryptJson } from './crypto';

/**
 * Per-org integration credentials. Read/written via the service-role client
 * (bypasses RLS) so it works in any context (request, cron, public flows). The
 * owner provisions each org's keys; secrets are AES-GCM encrypted at rest.
 *
 * Resolution order at send time: the org's provisioned keys if present, else the
 * global env fallback (keeps the default/platform org working as before).
 */
export type IntegrationProvider = 'email' | 'whatsapp' | 'drive';

interface OrgIntegrationRow {
  config: Record<string, unknown>;
  secrets: Record<string, unknown>;
  is_active: boolean;
}

export async function getOrgIntegration(
  orgId: string,
  provider: IntegrationProvider,
): Promise<OrgIntegrationRow | null> {
  const { data } = await supabaseAdmin
    .from('org_integrations')
    .select('config, secret_ciphertext, is_active')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .maybeSingle();
  if (!data) return null;
  return {
    config: (data.config ?? {}) as Record<string, unknown>,
    secrets: decryptJson(data.secret_ciphertext as string | null) ?? {},
    is_active: data.is_active !== false,
  };
}

export async function upsertOrgIntegration(
  orgId: string,
  provider: IntegrationProvider,
  input: { config?: Record<string, unknown>; secrets?: Record<string, unknown>; is_active?: boolean },
  updatedBy?: string,
): Promise<void> {
  const patch: Record<string, unknown> = { org_id: orgId, provider, updated_at: new Date().toISOString() };
  if (input.config !== undefined) patch.config = input.config;
  if (input.secrets !== undefined) patch.secret_ciphertext = encryptJson(input.secrets);
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (updatedBy) patch.updated_by = updatedBy;
  const { error } = await supabaseAdmin.from('org_integrations').upsert(patch, { onConflict: 'org_id,provider' });
  if (error) throw new Error(error.message);
}

/** A non-secret status view for the Admin Console (never returns raw secrets). */
export async function listOrgIntegrationStatus(
  orgId: string,
): Promise<Record<IntegrationProvider, { configured: boolean; is_active: boolean; config: Record<string, unknown> }>> {
  const { data } = await supabaseAdmin
    .from('org_integrations')
    .select('provider, config, secret_ciphertext, is_active')
    .eq('org_id', orgId);
  const out = {
    email: { configured: false, is_active: false, config: {} as Record<string, unknown> },
    whatsapp: { configured: false, is_active: false, config: {} as Record<string, unknown> },
    drive: { configured: false, is_active: false, config: {} as Record<string, unknown> },
  };
  for (const row of data ?? []) {
    const p = row.provider as IntegrationProvider;
    if (out[p]) {
      out[p] = {
        configured: !!row.secret_ciphertext,
        is_active: row.is_active !== false,
        config: (row.config ?? {}) as Record<string, unknown>,
      };
    }
  }
  return out;
}

// ── Resolvers used at send time (org keys → env fallback) ────────────────────

export async function resolveEmailCreds(
  orgId: string | null,
): Promise<{ api_key?: string; sender_email: string; sender_name: string }> {
  let api_key = env.BREVO_API_KEY;
  let sender_email = env.SENDER_EMAIL;
  let sender_name = env.SENDER_NAME;
  if (orgId) {
    const row = await getOrgIntegration(orgId, 'email');
    if (row && row.is_active) {
      api_key = (row.secrets.api_key as string) || api_key;
      sender_email = (row.config.sender_email as string) || sender_email;
      sender_name = (row.config.sender_name as string) || sender_name;
    }
  }
  return {
    api_key,
    sender_email: sender_email || 'noreply@globalgeotechnical.com',
    sender_name: sender_name || 'Global Geotechnical Consultancy',
  };
}

export async function resolveWhatsAppCreds(
  orgId: string | null,
): Promise<{ api_token?: string; base_url?: string }> {
  let api_token = env.WATI_API_TOKEN;
  let base_url = env.WATI_BASE_URL;
  if (orgId) {
    const row = await getOrgIntegration(orgId, 'whatsapp');
    if (row && row.is_active) {
      api_token = (row.secrets.api_token as string) || api_token;
      base_url = (row.config.base_url as string) || base_url;
    }
  }
  return { api_token, base_url };
}

export async function resolveDriveCreds(
  orgId: string | null,
): Promise<{ service_account_b64?: string; root_folder_id?: string }> {
  let service_account_b64 = env.GOOGLE_SERVICE_ACCOUNT_B64;
  let root_folder_id = env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (orgId) {
    const row = await getOrgIntegration(orgId, 'drive');
    if (row && row.is_active) {
      service_account_b64 = (row.secrets.service_account_b64 as string) || service_account_b64;
      root_folder_id = (row.config.root_folder_id as string) || root_folder_id;
    }
  }
  return { service_account_b64, root_folder_id };
}
