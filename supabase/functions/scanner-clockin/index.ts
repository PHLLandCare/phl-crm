// scanner-clockin Edge Function
// Called by Raspberry Pi scanner station when a worker badge is scanned
// POST { employee_id: "PHL-001", station: "warehouse-main", secret: "..." }
// Returns { ok: true, action: "in"|"out", name: "...", time: "..." }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SCANNER_SECRET = Deno.env.get("SCANNER_SECRET") || "phl-scanner-2024";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-scanner-secret",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const { employee_id, station = "unknown", secret } = body;

    // Auth check — Pi sends shared secret in body or header
    const headerSecret = req.headers.get("x-scanner-secret");
    if (secret !== SCANNER_SECRET && headerSecret !== SCANNER_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: cors,
      });
    }

    if (!employee_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing employee_id" }), {
        status: 400, headers: cors,
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const now = new Date().toISOString();

    // Look up employee
    const { data: emp, error: empErr } = await sb
      .from("employees")
      .select("id, employee_id, fname, lname, division, active")
      .or(`employee_id.eq.${employee_id},id.eq.${employee_id}`)
      .single();

    if (empErr || !emp) {
      // Log failed scan attempt
      await sb.from("scanner_events").insert({
        employee_id_raw: employee_id,
        station,
        status: "not_found",
        scanned_at: now,
      }).catch(() => {});
      return new Response(JSON.stringify({ ok: false, error: "Employee not found" }), {
        status: 404, headers: cors,
      });
    }

    if (!emp.active) {
      return new Response(JSON.stringify({ ok: false, error: "Employee inactive" }), {
        status: 403, headers: cors,
      });
    }

    // Check if currently clocked in
    const { data: openEvent } = await sb
      .from("clock_events")
      .select("id, clock_in")
      .eq("employee_id", emp.employee_id)
      .is("clock_out", null)
      .not("clock_in", "is", null)
      .order("clock_in", { ascending: false })
      .limit(1);

    const isClockedIn = openEvent && openEvent.length > 0;
    const action = isClockedIn ? "out" : "in";
    const employeeName = `${emp.fname} ${emp.lname}`;

    if (action === "in") {
      await sb.from("clock_events").insert({
        employee_id: emp.employee_id,
        employee_name: employeeName,
        division: emp.division,
        clock_in: now,
        method: `Scanner:${station}`,
        flagged: false,
      });
    } else {
      await sb.from("clock_events")
        .update({ clock_out: now })
        .eq("id", openEvent[0].id);
    }

    // Log scanner event for audit trail
    await sb.from("scanner_events").insert({
      employee_id_raw: emp.employee_id,
      employee_name: employeeName,
      station,
      action,
      status: "success",
      scanned_at: now,
    }).catch(() => {});

    // Update station last-ping
    await sb.from("scanner_stations")
      .update({ last_ping: now, last_employee: employeeName })
      .eq("station_id", station)
      .catch(() => {});

    return new Response(JSON.stringify({
      ok: true,
      action,
      name: employeeName,
      employee_id: emp.employee_id,
      division: emp.division,
      time: now,
    }), { headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500, headers: cors,
    });
  }
});
