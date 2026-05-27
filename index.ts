// supabase/functions/stripe-webhook/index.ts
// ============================================================
// PHL CRM — Stripe Webhook Handler
// Handles: payment_intent.succeeded, payment_intent.payment_failed,
//          charge.dispute.created, customer.subscription.*
//
// Deploy: supabase functions deploy stripe-webhook
// Set secrets:
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Stripe client (secret key — server only, never exposed to frontend) ──
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

// ── Supabase admin client (service_role — server only, bypasses RLS intentionally) ──
// This is the ONE place service_role is acceptable — a trusted server environment
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// ── Allowed Stripe event types — reject anything not in this list ──
const HANDLED_EVENTS = new Set([
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'charge.dispute.created',
  'charge.refunded',
]);

serve(async (req: Request): Promise<Response> => {
  // ── Only accept POST requests ──
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // ── Read raw body — required for signature verification ──
  // NEVER parse JSON before verifying the signature
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    console.error('[stripe-webhook] Missing stripe-signature header');
    return new Response('Missing signature', { status: 400 });
  }

  // ── Verify webhook signature — CRITICAL security step ──
  // This proves the request actually came from Stripe, not an attacker
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    // Return 400 — Stripe will retry. Do NOT return 200 on failed verification.
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  // ── Ignore events we don't handle — return 200 so Stripe doesn't retry ──
  if (!HANDLED_EVENTS.has(event.type)) {
    console.log(`[stripe-webhook] Ignoring unhandled event type: ${event.type}`);
    return new Response(JSON.stringify({ received: true, handled: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`[stripe-webhook] Processing event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {

      // ── Payment succeeded ──
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentSucceeded(intent);
        break;
      }

      // ── Payment failed ──
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailed(intent);
        break;
      }

      // ── Payment canceled ──
      case 'payment_intent.canceled': {
        const intent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentCanceled(intent);
        break;
      }

      // ── Dispute opened — flag invoice, alert org owner ──
      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        await handleDisputeCreated(dispute);
        break;
      }

      // ── Refund issued ──
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await handleRefund(charge);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true, handled: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    // Log the error but still return 200 to prevent infinite Stripe retries
    // on application-level errors. Investigate via Supabase logs.
    console.error(`[stripe-webhook] Handler error for ${event.type}:`, err);
    return new Response(JSON.stringify({ received: true, error: err.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});


// ============================================================
// Handler: payment_intent.succeeded
// ============================================================
async function handlePaymentSucceeded(intent: Stripe.PaymentIntent): Promise<void> {
  const invoiceId = intent.metadata?.invoice_id;

  if (!invoiceId) {
    console.warn('[stripe-webhook] payment_intent.succeeded has no invoice_id in metadata:', intent.id);
    return;
  }

  // ── Idempotency check: has this payment already been recorded? ──
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id')
    .eq('stripe_payment_intent_id', intent.id)
    .eq('status', 'completed')
    .maybeSingle();

  if (existingPayment) {
    console.log(`[stripe-webhook] Payment already recorded for intent ${intent.id}, skipping`);
    return;
  }

  // ── Fetch the invoice to validate it exists and get org_id ──
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, org_id, customer_id, total, amount_paid, status')
    .eq('id', invoiceId)
    .single();

  if (invoiceError || !invoice) {
    throw new Error(`Invoice not found for id ${invoiceId}: ${invoiceError?.message}`);
  }

  const amountPaid = intent.amount_received / 100; // Convert cents to dollars

  // ── Record the payment ──
  const { error: paymentError } = await supabase.from('payments').insert({
    org_id: invoice.org_id,
    invoice_id: invoiceId,
    customer_id: invoice.customer_id,
    amount: amountPaid,
    method: 'card',
    status: 'completed',
    stripe_payment_intent_id: intent.id,
    paid_at: new Date().toISOString(),
  });

  if (paymentError) {
    throw new Error(`Failed to insert payment record: ${paymentError.message}`);
  }

  // ── Recalculate invoice balance and update status ──
  const { error: rpcError } = await supabase.rpc('recalculate_invoice_balance', {
    p_invoice_id: invoiceId,
  });

  if (rpcError) {
    throw new Error(`Failed to recalculate invoice balance: ${rpcError.message}`);
  }

  console.log(`[stripe-webhook] Payment of $${amountPaid} recorded for invoice ${invoiceId}`);
}


// ============================================================
// Handler: payment_intent.payment_failed
// ============================================================
async function handlePaymentFailed(intent: Stripe.PaymentIntent): Promise<void> {
  const invoiceId = intent.metadata?.invoice_id;
  if (!invoiceId) return;

  // ── Mark any pending payment record as failed ──
  await supabase
    .from('payments')
    .update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', intent.id)
    .eq('status', 'pending');

  const failureReason = intent.last_payment_error?.message ?? 'Unknown reason';
  console.log(`[stripe-webhook] Payment failed for invoice ${invoiceId}: ${failureReason}`);

  // TODO: Trigger notification to customer via Resend/Twilio Edge Function
}


// ============================================================
// Handler: payment_intent.canceled
// ============================================================
async function handlePaymentCanceled(intent: Stripe.PaymentIntent): Promise<void> {
  await supabase
    .from('payments')
    .update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', intent.id)
    .neq('status', 'completed'); // Never overwrite a completed payment

  console.log(`[stripe-webhook] Payment intent canceled: ${intent.id}`);
}


// ============================================================
// Handler: charge.dispute.created
// ============================================================
async function handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  // Find the payment record by charge ID
  const { data: payment } = await supabase
    .from('payments')
    .select('id, invoice_id, org_id, customer_id')
    .eq('stripe_payment_intent_id', dispute.payment_intent as string)
    .maybeSingle();

  if (!payment) {
    console.warn(`[stripe-webhook] Dispute created but no matching payment found for charge ${dispute.charge}`);
    return;
  }

  // Flag the invoice as disputed
  await supabase
    .from('invoices')
    .update({
      status: 'overdue', // Or add a 'disputed' status if needed
      updated_at: new Date().toISOString(),
    })
    .eq('id', payment.invoice_id);

  console.warn(`[stripe-webhook] DISPUTE created for invoice ${payment.invoice_id} — amount: $${dispute.amount / 100}`);

  // TODO: Send urgent alert to org owner via Edge Function
}


// ============================================================
// Handler: charge.refunded
// ============================================================
async function handleRefund(charge: Stripe.Charge): Promise<void> {
  const refundAmount = charge.amount_refunded / 100;

  const { data: payment } = await supabase
    .from('payments')
    .select('id, invoice_id, org_id')
    .eq('stripe_payment_intent_id', charge.payment_intent as string)
    .maybeSingle();

  if (!payment) return;

  // Update payment status
  await supabase
    .from('payments')
    .update({
      status: 'refunded',
      updated_at: new Date().toISOString(),
    })
    .eq('id', payment.id);

  // Recalculate invoice balance
  await supabase.rpc('recalculate_invoice_balance', {
    p_invoice_id: payment.invoice_id,
  });

  console.log(`[stripe-webhook] Refund of $${refundAmount} processed for invoice ${payment.invoice_id}`);
}
