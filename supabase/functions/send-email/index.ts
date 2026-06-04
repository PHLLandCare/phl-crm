import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = 'PHL Land Care Inc. <admin@phllandcare.com>'

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { to, subject, html, text, from, reply_to } = await req.json()
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')
    if (!to || !subject) throw new Error('Missing required fields: to, subject')

    // Resolve recipient email — if 'to' is a client name, look it up
    let recipientEmail = to
    if (!to.includes('@')) {
      // It's a name — caller should pass email directly, but handle gracefully
      throw new Error(`Invalid email address: "${to}". Pass the client's email address, not their name.`)
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from || FROM_EMAIL,
        to: [recipientEmail],
        subject,
        html: html || `<p>${text || ''}</p>`,
        reply_to: reply_to || 'admin@phllandcare.com',
      }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Resend API error')

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
