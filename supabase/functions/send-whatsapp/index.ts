import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { phone_number, template_name, parameters } = await req.json()

    const WATI_API_TOKEN = Deno.env.get('WATI_API_TOKEN')
    const WATI_BASE_URL = Deno.env.get('WATI_BASE_URL')
    if (!WATI_API_TOKEN || !WATI_BASE_URL) throw new Error('WATI credentials not set')

    const normalised = phone_number.replace(/^\+/, '')

    const res = await fetch(`${WATI_BASE_URL}/api/v1/sendTemplateMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WATI_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        whatsappNumber: normalised,
        template_name,
        broadcast_name: template_name,
        parameters,
      }),
    })

    const data = await res.json()

    if (data.result === false || data.error) {
      const errorMsg = data.error || data.message || 'Unknown WATI error'
      const whatsapp_invalid = errorMsg.toLowerCase().includes('not a valid whatsapp')
        || errorMsg.toLowerCase().includes('number not found')
      return new Response(
        JSON.stringify({ error: errorMsg, whatsapp_invalid }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, messageId: data.messageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
