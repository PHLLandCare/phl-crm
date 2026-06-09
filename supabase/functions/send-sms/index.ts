import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { to, message } = await req.json()
    if (!to || !message) throw new Error('Missing required fields: to, message')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: settings } = await supabase.from('org_settings').select('*').limit(1).single()

    const sid   = settings?.twilio_account_sid  || Deno.env.get('TWILIO_ACCOUNT_SID')  || ''
    const token = settings?.twilio_auth_token   || Deno.env.get('TWILIO_AUTH_TOKEN')   || ''
    const from  = settings?.twilio_phone_number || Deno.env.get('TWILIO_PHONE_NUMBER') || ''

    if (!sid || !token) throw new Error('Twilio credentials not configured. Add them in Settings → Integrations.')

    const form = new URLSearchParams()
    form.append('To', to)
    form.append('From', from)
    form.append('Body', message)

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      { method: 'POST', headers: { 'Authorization': `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form }
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Twilio API error')

    return new Response(JSON.stringify({ success: true, sid: data.sid }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
