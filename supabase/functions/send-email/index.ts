// send-email Edge Function
// Sends transactional email via Resend API (primary) with console fallback
// Called by: Invoices, Quotes, Jobs, Schedule, Employee Portal, Team
// POST { to: string, subject: string, html: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { to, subject, html } = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing required fields: to, subject, html" }),
        { status: 400, headers: cors }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "noreply@mail.phllandcare.com";
    const FROM_NAME = Deno.env.get("FROM_NAME") || "PHL Land Care";

    // Try Resend if API key is configured
    if (RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("[send-email] Resend error:", data);
        return new Response(
          JSON.stringify({ ok: false, error: data.message || "Resend API error" }),
          { status: 500, headers: cors }
        );
      }

      console.log(`[send-email] Sent via Resend to ${to}: ${subject}`);
      return new Response(
        JSON.stringify({ ok: true, id: data.id, provider: "resend" }),
        { headers: cors }
      );
    }

    // No Resend key configured — log and return graceful fallback
    // This is expected until Resend is set up with the domain
    console.log(`[send-email] No RESEND_API_KEY configured. Would have sent:`);
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);

    return new Response(
      JSON.stringify({
        ok: true,
        queued: true,
        message: "Email logged (Resend not yet configured — add RESEND_API_KEY secret to enable sending)",
      }),
      { headers: cors }
    );

  } catch (e) {
    console.error("[send-email] Error:", e.message);
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 500, headers: cors }
    );
  }
});
