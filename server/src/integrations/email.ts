import { currentOrgId } from '../db';
import { supabaseAdmin } from '../lib/supabase';
import { resolveEmailCreds } from '../lib/org-integrations';
import { renderEmail, type TemplateKey, type TemplateParams } from './email-templates';

export interface SendEmailInput {
  to: string | string[];
  subject?: string;
  html_body?: string;
  template?: TemplateKey;
  params?: Record<string, unknown>;
  attachment_path?: string; // storage path in a private bucket
  attachment_bucket?: string; // default quotation-pdfs
  attachment_url?: string; // directly fetchable url (back-compat)
  /** Org whose provisioned Brevo creds to use; defaults to the request's org. */
  orgId?: string | null;
}

export interface SendEmailResult {
  success: boolean;
  message_id?: string;
  error?: string;
}

// Faithful port of the send-email edge function (Brevo transactional API v3).
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { to, template, params, attachment_path, attachment_url, attachment_bucket } = input;
  let { subject, html_body } = input;

  if (!to) return { success: false, error: 'Missing "to" recipient' };

  if (template) {
    const rendered = renderEmail(template, (params ?? {}) as TemplateParams[TemplateKey]);
    html_body = rendered.html;
    subject = subject || rendered.subject;
  }
  if (!html_body) return { success: false, error: 'Nothing to send: provide a template or html_body' };

  const creds = await resolveEmailCreds(input.orgId ?? currentOrgId());
  if (!creds.api_key) return { success: false, error: 'Email is not configured for this organization' };
  const senderEmail = creds.sender_email;
  const senderName = creds.sender_name;

  let attachment: Array<{ content: string; name: string }> | undefined;
  if (attachment_path) {
    const bucket = attachment_bucket || 'quotation-pdfs';
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(attachment_path);
    if (error || !data) return { success: false, error: `Failed to fetch attachment ${bucket}/${attachment_path}` };
    const buffer = Buffer.from(await data.arrayBuffer());
    attachment = [{ content: buffer.toString('base64'), name: attachment_path.split('/').pop() || 'attachment.pdf' }];
  } else if (attachment_url) {
    const fileRes = await fetch(attachment_url);
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    attachment = [{ content: buffer.toString('base64'), name: 'quotation.pdf' }];
  }

  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean).map((email) => ({ email }));
  const payload: Record<string, unknown> = {
    sender: { email: senderEmail, name: senderName },
    to: recipients,
    subject,
    htmlContent: html_body,
  };
  if (attachment) payload.attachment = attachment;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': creds.api_key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.text();
    return { success: false, error: `Brevo error (${res.status}): ${error}` };
  }
  const data = (await res.json()) as { messageId?: string };
  return { success: true, message_id: data.messageId };
}
