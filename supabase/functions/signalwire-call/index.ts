import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { action, to, callSid } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: s } = await supabase.from('org_settings').select(
      'signalwire_project_id,signalwire_api_token,signalwire_space_url,signalwire_phone_number'
    ).limit(1).single()

    if (!s?.signalwire_project_id) throw new Error('SignalWire not configured')

    const spaceUrl = s.signalwire_space_url.replace(/^https?:\/\//, '')
    const auth = btoa(`${s.signalwire_project_id}:${s.signalwire_api_token}`)
    const baseUrl = `https://${spaceUrl}/api/laml/2010-04-01/Accounts/${s.signalwire_project_id}`

    if (action === 'dial') {
      const body = new URLSearchParams({
        To:   to,
        From: s.signalwire_phone_number,
        Url:  `https://${spaceUrl}/laml-bins/simple-dial`, // basic connect
        StatusCallback: `${Deno.env.get('SUPABASE_URL')}/functions/v1/signalwire-call-status`,
        StatusCallbackMethod: 'POST',
      })
      const resp = await fetch(`${baseUrl}/Calls.json`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.message || 'Call failed')
      return new Response(JSON.stringify({ success: true, callSid: result.sid }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'hangup' && callSid) {
      const resp = await fetch(`${baseUrl}/Calls/${callSid}.json`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ Status: 'completed' }).toString(),
      })
      return new Response(JSON.stringify({ success: resp.ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    throw new Error('Unknown action')
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
