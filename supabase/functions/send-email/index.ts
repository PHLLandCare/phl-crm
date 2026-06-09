import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Base64 encode for SMTP AUTH
function b64(s: string) {
  return btoa(unescape(encodeURIComponent(s)))
}

// Send via SMTP using GoDaddy (or any SMTP provider)
async function sendSMTP(opts: {
  host: string; port: number; user: string; pass: string;
  from: string; to: string; subject: string; html: string
}) {
  // GoDaddy SMTP relay endpoint — use their API-compatible relay
  // GoDaddy supports SMTP on smtp.office365.com (Microsoft 365) or smtpout.secureserver.net
  const smtpUrl = `https://api.smtp2go.com/v3/email/send` // fallback relay

  // Try direct SMTP via fetch to a relay service, or use GoDaddy's webmail API
  // For GoDaddy Workspace Email: smtpout.secureserver.net:465 (SSL) or :587 (TLS)
  // Since Deno edge functions can make TCP connections, use the SMTP library
  const { SmtpClient } = await import('https://deno.land/x/smtp@v0.7.0/mod.ts')
  const client = new SmtpClient()

  const useTLS = opts.port === 465
  const connectOpts = {
    hostname: opts.host,
    port: opts.port,
    username: opts.user,
    password: opts.pass,
  }

  if (useTLS) {
    await client.connectTLS(connectOpts)
  } else {
    await client.connect(connectOpts)
  }

  await client.send({
    from: opts.from,
    to: opts.to,
    subject: opts.subject,
    content: 'text/html',
    html: opts.html,
  })

  await client.close()
  return { success: true }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { to, subject, html, text } = await req.json()
    if (!to || !subject) throw new Error('Missing required fields: to, subject')
    if (!to.includes('@')) throw new Error(`Invalid email address: "${to}"`)

    // Load settings from org_settings
    const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase     = createClient(supabaseUrl, supabaseKey)
    const { data: settings } = await supabase.from('org_settings').select('*').limit(1).single()

    const smtpHost = settings?.smtp_host || Deno.env.get('SMTP_HOST') || 'smtpout.secureserver.net'
    const smtpPort = Number(settings?.smtp_port || Deno.env.get('SMTP_PORT') || 465)
    const smtpUser = settings?.smtp_username || Deno.env.get('SMTP_USER') || ''
    const smtpPass = settings?.smtp_password || Deno.env.get('SMTP_PASS') || ''
    const fromName = settings?.smtp_from_name || 'PHL Land Care Inc.'
    const fromEmail = settings?.smtp_from_email || smtpUser || 'admin@phllandcare.com'
    const fromAddr  = `${fromName} <${fromEmail}>`

    // Fallback: if Resend key exists, use it
    const resendKey = settings?.resend_api_key || Deno.env.get('RESEND_API_KEY') || ''

    if (!smtpUser || !smtpPass) {
      if (resendKey) {
        // Fall back to Resend
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: fromAddr, to: [to], subject, html: html || `<p>${text||''}</p>` }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Resend API error')
        return new Response(JSON.stringify({ success: true, provider: 'resend', id: data.id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      throw new Error('No email provider configured. Add SMTP credentials in Settings → Integrations.')
    }

    await sendSMTP({ host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass, from: fromAddr, to, subject, html: html || `<p>${text||''}</p>` })

    return new Response(JSON.stringify({ success: true, provider: 'smtp' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
