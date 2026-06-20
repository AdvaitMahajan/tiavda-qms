import { env } from '../env';

export interface SendWhatsAppInput {
  phone_number: string;
  template_name: string;
  parameters?: Array<{ name: string; value: string }>;
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
  if (!env.WATI_API_TOKEN || !env.WATI_BASE_URL) return { error: 'WATI credentials not set' };

  const normalised = phone_number.replace(/^\+/, '');
  const res = await fetch(`${env.WATI_BASE_URL}/api/v1/sendTemplateMessage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WATI_API_TOKEN}`, 'Content-Type': 'application/json' },
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
