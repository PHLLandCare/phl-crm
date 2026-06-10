import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const results: any = {}

  // 1. Fix Romy's name in employees table
  const { data: empFix, error: empErr } = await supabase
    .from('employees')
    .update({ fname: 'Romy', lname: 'Cruz' })
    .eq('employee_id', 'PHL-0001')
    .select()
  results.empFix = empErr ? empErr.message : `fixed ${empFix?.length} rows`

  // 2. Fix employee_name in clock_events for PHL-0001
  const { data: clockFix, error: clockErr } = await supabase
    .from('clock_events')
    .update({ employee_name: 'Romy Cruz' })
    .eq('employee_id', 'PHL-0001')
    .select('id,employee_name')
  results.clockFix = clockErr ? clockErr.message : `fixed ${clockFix?.length} clock_events`

  // 3. Delete the bad 8:19 PM punch (method='Mobile (GPS)', employee_id='PHL-0001', open session from tonight)
  const { data: badPunch, error: badErr } = await supabase
    .from('clock_events')
    .delete()
    .eq('employee_id', 'PHL-0001')
    .eq('method', 'Mobile (GPS)')
    .is('clock_out', null)
    .select()
  results.deletedBadPunch = badErr ? badErr.message : `deleted ${badPunch?.length} bad punch(es)`

  // 4. Create payments table if not exists
  const { error: payErr } = await supabase.rpc('exec_sql', { 
    sql: `
      CREATE TABLE IF NOT EXISTS payments (
        id bigserial PRIMARY KEY,
        invoice_id text NOT NULL,
        invoice_number text,
        client_name text,
        amount numeric NOT NULL,
        method text NOT NULL DEFAULT 'Square',
        note text,
        paid_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "payments_all" ON payments;
      CREATE POLICY "payments_all" ON payments FOR ALL USING (true) WITH CHECK (true);
      CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON payments(invoice_id);
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at timestamptz;
    `
  }).catch(() => null)
  results.paymentsTable = payErr ? 'note: exec_sql may not exist, run SQL manually' : 'payments table ready'

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
