import { supabase } from "@/integrations/supabase/client";
import { sendNotification } from "@/lib/notifications";

export function generateTokenString(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export async function createIntakeToken(
  clientId: string,
  createdBy: string,
  enquiryId?: string,
): Promise<string> {
  // Expire prior active tokens for the SAME enquiry (so generating a link for a
  // different/parallel enquiry of the same client doesn't kill the other's link).
  // For legacy client-level tokens (no enquiryId), expire the client's active ones.
  let expireQuery = supabase
    .from("intake_tokens")
    .update({ status: "expired" })
    .eq("status", "active");
  expireQuery = enquiryId
    ? expireQuery.eq("enquiry_id", enquiryId)
    : expireQuery.eq("client_id", clientId).is("enquiry_id", null);
  await expireQuery;

  const token = generateTokenString();
  const { error } = await supabase.from("intake_tokens").insert({
    token,
    client_id: clientId,
    enquiry_id: enquiryId ?? null,
    created_by: createdBy,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  if (error) throw error;
  return token;
}

export function getIntakeUrl(token: string): string {
  return `${window.location.origin}/intake?t=${token}`;
}

export async function sendIntakeLink(
  clientId: string,
  token: string,
  refNumber: string,
): Promise<{ emailSent: boolean; whatsappSent: boolean }> {
  const { data: client } = await supabase
    .from("clients")
    .select("name, email, email_bounced, whatsapp_number, whatsapp_invalid")
    .eq("id", clientId)
    .single();

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
    const { error } = await supabase.functions.invoke("send-whatsapp", {
      body: {
        phone_number: client.whatsapp_number,
        template_name: "qms_intake_form",
        parameters: [
          { name: "client_name", value: client.name },
          { name: "ref_number", value: refNumber },
          { name: "link", value: intakeUrl },
        ],
      },
    });
    if (!error) whatsappSent = true;
  }

  return { emailSent, whatsappSent };
}
