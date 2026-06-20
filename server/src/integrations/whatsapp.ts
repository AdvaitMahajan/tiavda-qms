import { currentOrgId } from '../db';
import { resolveWhatsAppCreds } from '../lib/org-integrations';

export interface SendWhatsAppInput {
  phone_number: string;
  template_name: string;
  parameters?: Array<{ name: string; value: string }>;
  /** Org whose provisioned WATI creds to use; defaults to the request's org. */
  orgId?: string | null;
}

export interface SendWhatsAppResult {
  success?: boolean;
  messageId?: string;
  error?: string;
  whatsapp_invalid?: boolean;
}

// Faithful port of the send-whatsapp edge function (WATI BSP API).
export async function sendWhatsApp(input: SendWhatsAppInput): Promise<SendWhatsAppResult> {
  const { phone_number, template_name, parameters } = input;
  const creds = await resolveWhatsAppCreds(input.orgId ?? currentOrgId());
  if (!creds.api_token || !creds.base_url) return { error: 'WhatsApp is not configured for this organization' };

  const normalised = phone_number.replace(/^\+/, '');
  const res = await fetch(`${creds.base_url}/api/v1/sendTemplateMessage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.api_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ whatsappNumber: normalised, template_name, broadcast_name: template_name, parameters }),
  });

  const data = (await res.json()) as { result?: boolean; error?: string; message?: string; messageId?: string };
  if (data.result === false || data.error) {
    const errorMsg = data.error || data.message || 'Unknown WATI error';
    const whatsapp_invalid =
      errorMsg.toLowerCase().includes('not a valid whatsapp') || errorMsg.toLowerCase().includes('number not found');
    return { error: errorMsg, whatsapp_invalid };
  }
  return { success: true, messageId: data.messageId };
}
