import { supabaseAdmin } from '../lib/supabase';
import type { TemplateKey } from './email-templates';

/**
 * Templates addressed to the firm's own staff rather than to the client.
 * These are the ones the shared team inbox is copied on; client-facing mail
 * (quotations, payment requests, intake links) is deliberately excluded so the
 * inbox does not receive correspondence meant for the client.
 */
const INTERNAL_TEMPLATES: ReadonlySet<TemplateKey> = new Set<TemplateKey>([
  'intake_expiry_admin',
  'new_intake_admin',
  'followup_reminder',
  'followup_digest',
  'job_reminder',
  'site_visit_today',
  'weekly_summary',
]);

export function isInternalTemplate(template?: TemplateKey): boolean {
  return !!template && INTERNAL_TEMPLATES.has(template);
}

/**
 * The shared team inbox(es) for an org, from the `team_notification_emails`
 * setting (comma-separated). Every staff-facing notification is copied here, so
 * the team sees them without each alert having to name individuals.
 */
export async function teamInboxes(orgId?: string | null): Promise<string[]> {
  if (!orgId) return [];
  try {
    const { data } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('org_id', orgId)
      .eq('key', 'team_notification_emails')
      .maybeSingle();
    return String(data?.value ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
  } catch {
    return []; // never block a send because the lookup failed
  }
}
