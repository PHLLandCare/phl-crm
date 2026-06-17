import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { sourceId, amount, currency = 'USD', note, invoiceId, clientName } = await req.json()

    // Load Square credentials from org_settings (where the Settings page
    // Save button writes them), falling back to Deno env vars if someone
    // set those instead. This matches the pattern used by send-email and
    // optimize-route, so Settings → Square → Save actually works end to end.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: settings } = await supabase.from('org_settings').select('*').limit(1).single()

    const SQUARE_ACCESS_TOKEN = settings?.square_access_token || Deno.env.get('SQUARE_ACCESS_TOKEN') || ''
    const SQUARE_LOCATION_ID  = settings?.square_location_id  || Deno.env.get('SQUARE_LOCATION_ID')  || ''
    const SQUARE_ENV          = Deno.env.get('SQUARE_ENV') || 'production' // 'sandbox' or 'production'

    if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) throw new Error('Square credentials not configured. Add them in Settings → Integrations → Square Payments.')
    if (!sourceId || !amount) throw new Error('Missing sourceId or amount')

    const baseUrl = SQUARE_ENV === 'sandbox'
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com'

    const idempotencyKey = `phl-${invoiceId || Date.now()}-${Math.random().toString(36).slice(2)}`

    const res = await fetch(`${baseUrl}/v2/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Square-Version': '2024-01-18',
      },
      body: JSON.stringify({
        idempotency_key: idempotencyKey,
        source_id: sourceId,
        amount_money: {
          amount: Math.round(amount * 100), // Square uses cents
          currency,
        },
        location_id: SQUARE_LOCATION_ID,
        note: note || `Invoice payment — ${clientName || 'PHL Land Care client'}`,
        reference_id: invoiceId || undefined,
      }),
    })

    const data = await res.json()
    if (!res.ok || data.errors) {
      const msg = data.errors?.[0]?.detail || data.errors?.[0]?.code || 'Square payment error'
      throw new Error(msg)
    }

    return new Response(JSON.stringify({
      success: true,
      paymentId: data.payment?.id,
      status: data.payment?.status,
      receiptUrl: data.payment?.receipt_url,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
