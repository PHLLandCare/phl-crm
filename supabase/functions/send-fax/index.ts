import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { to, pdf_base64, filename } = await req.json()
    if (!to || !pdf_base64) throw new Error('Missing to or pdf_base64')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: s } = await supabase.from('org_settings').select(
      'signalwire_project_id,signalwire_api_token,signalwire_space_url,signalwire_phone_number'
    ).limit(1).single()

    if (!s?.signalwire_project_id) throw new Error('SignalWire not configured')

    // Upload PDF to Supabase storage temporarily, get public URL for SignalWire to pull
    const pdfBytes = Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0))
    const fname = filename || `fax-${Date.now()}.pdf`

    const { data: upload, error: uploadErr } = await supabase.storage
      .from('expense-receipts') // reuse public bucket for temp fax PDFs
      .upload(`fax-temp/${fname}`, pdfBytes, { contentType: 'application/pdf', upsert: true })

    if (uploadErr) throw new Error('PDF upload failed: ' + uploadErr.message)

    const { data: { publicUrl } } = supabase.storage.from('expense-receipts').getPublicUrl(`fax-temp/${fname}`)

    const spaceUrl = s.signalwire_space_url.replace(/^https?:\/\//, '')
    const auth = btoa(`${s.signalwire_project_id}:${s.signalwire_api_token}`)
    const url = `https://${spaceUrl}/api/laml/2010-04-01/Accounts/${s.signalwire_project_id}/Faxes.json`

    const body = new URLSearchParams({
      To:      to,
      From:    s.signalwire_phone_number,
      MediaUrl: publicUrl,
    })

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    const result = await resp.json()
    if (!resp.ok) throw new Error(result.message || 'Fax send failed')

    return new Response(JSON.stringify({ success: true, faxSid: result.sid }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
