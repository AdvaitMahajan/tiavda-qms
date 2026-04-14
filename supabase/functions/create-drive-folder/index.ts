import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getGoogleAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))
  const signingInput = `${header}.${payload}`
  const privateKey = serviceAccount.private_key
  const keyData = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput)
  )
  const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const tokenData = await tokenRes.json()
  return tokenData.access_token
}

async function findOrCreateFolder(name: string, parentId: string, accessToken: string): Promise<string> {
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(name)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const searchData = await searchRes.json()
  if (searchData.files && searchData.files.length > 0) return searchData.files[0].id
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
  const createData = await createRes.json()
  return createData.id
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const body = await req.json()
  const { enquiry_id, ref_number, client_name, city } = body

  try {
    const SERVICE_ACCOUNT_B64 = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_B64')
    const ROOT_FOLDER_ID = Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!SERVICE_ACCOUNT_B64 || !ROOT_FOLDER_ID) throw new Error('Google credentials not configured')

    const serviceAccount = JSON.parse(atob(SERVICE_ACCOUNT_B64))
    const accessToken = await getGoogleAccessToken(serviceAccount)
    const year = new Date().getFullYear().toString()
    const yearFolderId = await findOrCreateFolder(year, ROOT_FOLDER_ID, accessToken)
    const projectName = `${ref_number} — ${client_name} — ${city}`
    const projectFolderId = await findOrCreateFolder(projectName, yearFolderId, accessToken)
    const projectFolderUrl = `https://drive.google.com/drive/folders/${projectFolderId}`

    await Promise.all(
      ['Quotations', 'Reports', 'Site Photos', 'Borehole Logs', 'Correspondence']
        .map(name => findOrCreateFolder(name, projectFolderId, accessToken))
    )

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    await supabase.from('mobilisation').update({
      drive_folder_id: projectFolderId,
      drive_folder_url: projectFolderUrl,
      drive_folder_status: 'created',
    }).eq('enquiry_id', enquiry_id)

    return new Response(
      JSON.stringify({ success: true, folder_id: projectFolderId, folder_url: projectFolderUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    try {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
      await supabase.from('mobilisation').update({ drive_folder_status: 'failed' }).eq('enquiry_id', enquiry_id)
    } catch (_) {}
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
