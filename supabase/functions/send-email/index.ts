import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { to, subject, html_body, attachment_url } = await req.json()

    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')
    if (!SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY not set')

    let attachments: any[] = []
    if (attachment_url) {
      const fileRes = await fetch(attachment_url)
      const buffer = await fileRes.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
      attachments = [{
        content: base64,
        filename: 'quotation.pdf',
        type: 'application/pdf',
        disposition: 'attachment'
      }]
    }

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'noreply@tiavda.com', name: 'Tiavda Enterprises' },
        subject,
        content: [{ type: 'text/html', value: html_body }],
        ...(attachments.length > 0 && { attachments }),
      }),
    })

    const message_id = res.headers.get('x-message-id')
    if (!res.ok) {
      const error = await res.text()
      throw new Error(`SendGrid error: ${error}`)
    }

    return new Response(
      JSON.stringify({ success: true, message_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
