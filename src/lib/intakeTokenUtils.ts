import { apiClient } from "@/lib/apiClient";
import { sendNotification } from "@/lib/notifications";
import type { Tables } from "@/integrations/supabase/types";

export async function createIntakeToken(
  clientId: string,
  _createdBy: string,
  enquiryId?: string,
): Promise<string> {
  // The API generates the token + expires prior active ones. created_by is taken
  // from the authenticated user server-side (param kept for call-site compat).
  const row = await apiClient.post<{ token: string }>("/intake-tokens", {
    client_id: clientId,
    enquiry_id: enquiryId ?? null,
  });
  return row.token;
}

export function getIntakeUrl(token: string): string {
  return `${window.location.origin}/intake?t=${token}`;
}

export async function sendIntakeLink(
  clientId: string,
  token: string,
  refNumber: string,
): Promise<{ emailSent: boolean; whatsappSent: boolean }> {
  const client = await apiClient.get<Tables<"clients">>(`/clients/${clientId}`);
  if (!client) throw new Error("Client not found");

  const intakeUrl = getIntakeUrl(token);
  let emailSent = false;
  let whatsappSent = false;

  if (client.email && !client.email_bounced) {
    const { ok } = await sendNotification({
      to: client.email,
      template: "intake_link",
      params: { client_name: client.name, ref_number: refNumber, intake_url: intakeUrl },
    });
    if (ok) emailSent = true;
  }

  if (client.whatsapp_number && !client.whatsapp_invalid) {
    try {
      const r = await apiClient.post<{ error?: string }>("/integrations/whatsapp", {
        phone_number: client.whatsapp_number,
        template_name: "qms_intake_form",
        parameters: [
          { name: "client_name", value: client.name },
          { name: "ref_number", value: refNumber },
          { name: "link", value: intakeUrl },
        ],
      });
      if (!r.error) whatsappSent = true;
    } catch {
      /* non-blocking */
    }
  }

  return { emailSent, whatsappSent };
}
