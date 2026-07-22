// ─────────────────────────────────────────────────────────────────────────────
// Client lifecycle touchpoints
//
// One helper for "send the client a message at a lifecycle event" so every
// touchpoint behaves identically: respects the email_bounced / whatsapp_invalid
// channel guards, flags a dead WhatsApp number, logs both channels to
// communication_log, and reports whether anything actually delivered. Delivery
// itself is inert until the org provisions Brevo/WATI credentials — these calls
// simply no-op (logged as failed) in that state, never throw.
// ─────────────────────────────────────────────────────────────────────────────
import { apiClient } from "@/lib/apiClient";
import { sendNotification, type NotificationTemplate, type NotificationParams } from "@/lib/notifications";

export interface TouchpointClient {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  email_bounced?: boolean | null;
  whatsapp_number?: string | null;
  whatsapp_invalid?: boolean | null;
}

export interface SendTouchpointOptions<T extends NotificationTemplate> {
  enquiryId: string;
  client: TouchpointClient | null | undefined;
  /** Human label used for the communication_log subject on both channels. */
  subject: string;
  emailTemplate: T;
  emailParams: NotificationParams[T];
  /** WATI template name (must be provisioned in WATI) + ordered parameters. */
  waTemplate: string;
  waParams: Array<{ name: string; value: string }>;
  /** Optional private-bucket path of a PDF to attach to the email. */
  attachmentPath?: string;
  /** User id recorded as the sender in communication_log. */
  sentBy?: string | null;
}

/**
 * Fire a client-facing email + WhatsApp for a lifecycle event. Never throws;
 * returns { delivered } true if at least one channel succeeded.
 */
export async function sendClientTouchpoint<T extends NotificationTemplate>(
  opts: SendTouchpointOptions<T>,
): Promise<{ delivered: boolean }> {
  const { enquiryId, client, subject } = opts;
  let delivered = false;

  const logComm = (channel: "email" | "whatsapp", ok: boolean) =>
    apiClient
      .post("/communications", {
        enquiry_id: enquiryId,
        client_id: client?.id ?? undefined,
        channel,
        direction: "outbound",
        subject,
        body: ok ? `${subject} sent` : `${subject} FAILED to send`,
        status: ok ? "sent" : "failed",
        sent_by: opts.sentBy ?? null,
      })
      .catch(() => {});

  // Email
  if (client?.email && !client.email_bounced) {
    const { ok } = await sendNotification({
      to: client.email,
      template: opts.emailTemplate,
      params: opts.emailParams,
      attachmentPath: opts.attachmentPath,
    });
    await logComm("email", ok);
    if (ok) delivered = true;
  }

  // WhatsApp
  if (client?.whatsapp_number && !client.whatsapp_invalid) {
    let waData: { error?: string; whatsapp_invalid?: boolean } = {};
    try {
      waData = await apiClient.post<{ error?: string; whatsapp_invalid?: boolean }>("/integrations/whatsapp", {
        phone_number: client.whatsapp_number,
        template_name: opts.waTemplate,
        parameters: opts.waParams,
      });
    } catch (e) {
      waData = { error: (e as Error).message };
    }
    if (waData?.whatsapp_invalid && client.id) {
      await apiClient.post(`/clients/${client.id}/flag-channel`, { channel: "whatsapp" }).catch(() => {});
      await logComm("whatsapp", false);
    } else if (waData?.error) {
      await logComm("whatsapp", false);
    } else {
      await logComm("whatsapp", true);
      delivered = true;
    }
  }

  return { delivered };
}
