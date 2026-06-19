import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !caller) throw new Error('Unauthorized')

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.role)) {
      throw new Error('Only admins can manage users')
    }

    const body = await req.json()
    const { action } = body

    // ── Reset password for existing user ──
    if (action === 'reset_password') {
      const { user_id, password } = body
      if (!user_id || !password) throw new Error('user_id and password are required')
      if (password.length < 6) throw new Error('Password must be at least 6 characters')

      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        password,
      })
      if (updateErr) throw updateErr

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }

    // ── Create new user ──
    const { email, full_name, role, password } = body
    if (!email || !full_name || !password) throw new Error('Email, full_name, and password are required')
    if (password.length < 6) throw new Error('Password must be at least 6 characters')

    const validRoles = ['super_admin', 'admin', 'mobilization_lead', 'viewer']
    const assignRole = validRoles.includes(role) ? role : 'viewer'

    if (assignRole === 'super_admin' && callerProfile.role !== 'super_admin') {
      throw new Error('Only super admins can assign super_admin role')
    }

    const { data: userData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: assignRole },
    })

    if (createErr) throw createErr

    return new Response(
      JSON.stringify({ user_id: userData.user.id, email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})
