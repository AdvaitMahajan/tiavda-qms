// ─────────────────────────────────────────────────────────────────────────────
// Frontend notification helper
//
// The HTML/subject for every email lives ONCE in the edge function registry at
// supabase/functions/_shared/email-templates.ts. The frontend never builds HTML;
// it just names a template and passes params. This file mirrors the template
// keys + param shapes so callers get autocomplete and type-safety.
//
// Keep the param shapes below in sync with `TemplateParams` in the edge module.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "@/integrations/supabase/client";

/** Minimal shape we need from a Supabase client — keeps typed + public clients interchangeable. */
type InvokeCapableClient = { functions: { invoke: typeof supabase.functions.invoke } };

// Mirror of TemplateParams in supabase/functions/_shared/email-templates.ts
export interface NotificationParams {
  intake_link: { client_name: string; ref_number?: string; intake_url: string };
  intake_reminder: { client_name: string; ref_number: string; intake_url: string; is_final?: boolean };
  intake_expiry_admin: { ref_number: string; client_name: string; client_phone: string; expiry_date: string };
  new_intake_admin: { ref_number: string; site_city?: string; structure_type?: string; num_bores?: number | string };
  quotation_sent: { client_name: string; ref_number: string; total_amount: string; validity_date: string };
  payment_request: { client_name: string; ref_number: string; amount: string };
  payment_request_detailed: {
    client_name: string; ref_number: string; type_label: string; amount: string;
    due_date: string; bank_details: string; instructions?: string;
  };
  payment_reminder: { client_name: string; ref_number: string; amount: string; payment_type: string };
  mobilisation_confirmed: {
    client_name: string; ref_number: string; date: string; time?: string;
    city: string; contact_name?: string; contact_phone?: string;
  };
  mobilisation_revised: { client_name: string; ref_number: string; date: string; city: string; confirm_url: string };
  followup_reminder: { ref_number: string; client_name?: string; scheduled_date: string; notes?: string | null; is_overdue?: boolean };
  job_reminder: { ref_number: string; client_name?: string; type_label: string; days_before: number | string; target_date: string };
  site_visit_today: {
    ref_number: string; geologist_name: string; client_name: string; client_phone: string;
    client_email?: string | null; site_address: string; structure_type?: string | null;
    num_bores?: number | null; depth_m?: number | null; notes?: string; form_url: string;
  };
  weekly_summary: {
    week_ending: string; new_enquiries: number; quotations_sent: number; revenue: string;
    status_counts: Record<string, number>; overdue_follow_ups: number; pending_payments: number;
  };
}

export type NotificationTemplate = keyof NotificationParams;

export interface SendNotificationOptions<T extends NotificationTemplate> {
  to: string | string[];
  template: T;
  params: NotificationParams[T];
  /** Storage path of a PDF/file to attach (private bucket, default quotation-pdfs). */
  attachmentPath?: string;
  /** Override the bucket the attachment lives in. */
  attachmentBucket?: string;
  /** Override the template's default subject. */
  subject?: string;
  /** Use a specific supabase client (e.g. the public/anon client on the Intake page). */
  client?: InvokeCapableClient;
}

export interface SendNotificationResult {
  ok: boolean;
  error?: string;
}

/**
 * Send a templated email via the `send-email` edge function.
 * Never throws — returns { ok, error } so callers can fire-and-forget safely.
 */
export async function sendNotification<T extends NotificationTemplate>(
  opts: SendNotificationOptions<T>,
): Promise<SendNotificationResult> {
  const client = opts.client ?? supabase;
  try {
    const { data, error } = await client.functions.invoke("send-email", {
      body: {
        to: opts.to,
        template: opts.template,
        params: opts.params,
        ...(opts.subject ? { subject: opts.subject } : {}),
        ...(opts.attachmentPath ? { attachment_path: opts.attachmentPath } : {}),
        ...(opts.attachmentBucket ? { attachment_bucket: opts.attachmentBucket } : {}),
      },
    });
    if (error) return { ok: false, error: error.message };
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "send-email invocation failed" };
  }
}
