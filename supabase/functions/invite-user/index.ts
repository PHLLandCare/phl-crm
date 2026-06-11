import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const {
      mode, email, full_name, role, password,
      phone, personal_email, address, city, state, zip,
      ssn, filing_status, employee_type, paperwork_files
    } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let userId: string | null = null

    if (mode === 'invite') {
      const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { full_name, role }
      })
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true, mode: 'invited' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (mode === 'manual') {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role }
      })
      if (error) throw new Error(error.message)
      userId = data.user?.id ?? null
    }

    if (userId) {
      await supabase.from('user_profiles').upsert({
        id: userId,
        full_name,
        role,
        active: true,
      })

      await supabase.from('employee_details').upsert({
        user_id: userId,
        full_name,
        work_email: email,
        personal_email: personal_email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        ssn: ssn || null,
        filing_status: filing_status || null,
        employee_type: employee_type || 'W2',
        paperwork_files: paperwork_files?.length > 0 ? JSON.stringify(paperwork_files) : null,
      })
    }

    return new Response(JSON.stringify({ success: true, mode: 'created', userId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
