import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { renderEmail } from '../_shared/email-templates.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Two ways to call this function:
    //   1. Template (preferred): { to, template, params, attachment_path? }
    //      → subject + HTML are rendered from _shared/email-templates.ts
    //   2. Raw (back-compat):    { to, subject, html_body, attachment_path? }
    //
    // attachment_path = storage path in the private quotation-pdfs bucket (preferred)
    // attachment_url  = a directly-fetchable URL (back-compat / public files)
    // attachment_bucket lets callers target a different private bucket (default quotation-pdfs)
    const body = await req.json()
    const { to, template, params, attachment_path, attachment_url, attachment_bucket } = body
    let { subject, html_body } = body

    if (!to) throw new Error('Missing "to" recipient')

    // Resolve template → subject + html (template overrides take precedence).
    if (template) {
      const rendered = renderEmail(template, params || {})
      html_body = rendered.html
      // Allow caller to override the template's default subject when provided.
      subject = subject || rendered.subject
    }

    if (!html_body) throw new Error('Nothing to send: provide a "template" or "html_body"')

    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')
    if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY not set')

    const SENDER_EMAIL = Deno.env.get('SENDER_EMAIL') || 'noreply@globalgeotechnical.com'
    const SENDER_NAME = Deno.env.get('SENDER_NAME') || 'Global Geotechnical Consultancy'

    const toBase64 = (buffer: ArrayBuffer) => {
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const chunk = 0x8000 // avoid call-stack overflow on large PDFs
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
      }
      return btoa(binary)
    }

    let attachment: any[] | undefined

    if (attachment_path) {
      // Download from a private bucket using the service-role key.
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
      const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
      const bucket = attachment_bucket || 'quotation-pdfs'
      const objectUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${attachment_path}`
      const fileRes = await fetch(objectUrl, {
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      })
      if (!fileRes.ok) {
        throw new Error(`Failed to fetch attachment ${bucket}/${attachment_path} (${fileRes.status})`)
      }
      const buffer = await fileRes.arrayBuffer()
      attachment = [{
        content: toBase64(buffer),
        name: attachment_path.split('/').pop() || 'attachment.pdf',
      }]
    } else if (attachment_url) {
      const fileRes = await fetch(attachment_url)
      const buffer = await fileRes.arrayBuffer()
      attachment = [{
        content: toBase64(buffer),
        name: 'quotation.pdf',
      }]
    }

    const recipients = (Array.isArray(to) ? to : [to])
      .filter(Boolean)
      .map((email: string) => ({ email }))

    const payload: Record<string, unknown> = {
      sender: { email: SENDER_EMAIL, name: SENDER_NAME },
      to: recipients,
      subject,
      htmlContent: html_body,
    }
    if (attachment) {
      payload.attachment = attachment
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Brevo error (${res.status}): ${error}`)
    }

    const data = await res.json()

    return new Response(
      JSON.stringify({ success: true, message_id: data.messageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
