// Razorpay -> server webhook. Grants Pro even if the student closes the tab
// right after paying. Deploy with --no-verify-jwt (Razorpay has no Supabase login);
// authenticity comes from the X-Razorpay-Signature HMAC instead.
//
// Dashboard: Settings > Webhooks > URL = https://<project>.supabase.co/functions/v1/razorpay-webhook
//            events: payment.captured, order.paid   secret = RAZORPAY_WEBHOOK_SECRET
import { adminClient, grantSubscription } from '../_shared/common.ts';
import { getPlan, verifyWebhookSignature } from '../_shared/logic.ts';

Deno.serve(async (req: Request) => {
  // Wrap the ENTIRE handler so EarlyDrop never happens silently.
  try {
    console.log('razorpay-webhook: received', req.method, req.url);

    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    if (!secret) {
      console.error('razorpay-webhook: RAZORPAY_WEBHOOK_SECRET not configured');
      return new Response('Not configured', { status: 500 });
    }

    let raw: string;
    try {
      raw = await req.text();
    } catch (e) {
      console.error('razorpay-webhook: failed to read request body', e);
      return new Response('Bad request', { status: 400 });
    }

    const sig = req.headers.get('x-razorpay-signature') || '';
    console.log('razorpay-webhook: verifying signature, body length', raw.length, 'sig length', sig.length);

    if (!(await verifyWebhookSignature(raw, sig, secret))) {
      console.error('razorpay-webhook: signature mismatch');
      return new Response('Bad signature', { status: 400 });
    }

    let event: any;
    try { event = JSON.parse(raw); } catch { return new Response('Bad JSON', { status: 400 }); }

    const name = event && event.event;
    console.log('razorpay-webhook: event type', name);
    if (name !== 'payment.captured' && name !== 'order.paid') return new Response('ignored', { status: 200 });

    const pay = event.payload && event.payload.payment && event.payload.payment.entity;
    if (!pay || !pay.id) return new Response('ignored', { status: 200 });

    const admin = adminClient();

    // --- Step 1: Find the payments row ---
    // Prefer lookup by order_id (most reliable), fall back to payment_id
    // (handles standalone payments where order creation failed client-side).
    let order: Record<string, unknown> | null = null;

    if (pay.order_id) {
      const { data: rows, error } = await admin.from('payments').select('*')
        .eq('razorpay_order_id', pay.order_id)
        .order('created_at', { ascending: false }).limit(1);
      if (error) {
        console.error('razorpay-webhook: db error looking up order', error);
        return new Response('db error', { status: 500 }); // 5xx => Razorpay retries
      }
      order = rows && rows[0] ? rows[0] : null;
    }

    // Fallback: look up by payment_id (standalone payment path)
    if (!order) {
      const { data: rows2 } = await admin.from('payments').select('*')
        .eq('razorpay_payment_id', pay.id)
        .order('created_at', { ascending: false }).limit(1);
      order = rows2 && rows2[0] ? rows2[0] : null;
    }

    // --- Step 2: Resolve plan ---
    // If we have a payments row use its plan_id. Otherwise try the Razorpay notes field.
    let plan = order ? getPlan(order.plan_id as string) : null;

    if (!plan) {
      // Razorpay order notes may carry plan_id (set in razorpay-order Edge Function)
      const notePlanId = pay.notes && pay.notes.plan_id;
      plan = notePlanId ? getPlan(notePlanId) : null;
    }

    if (!plan) {
      console.error('webhook: cannot resolve plan for payment', pay.id, 'amount', pay.amount);
      return new Response('unknown plan', { status: 200 }); // 200 so Razorpay stops retrying
    }

    // Amount / currency guard. The expected amount is the one the server recorded
    // when it created the order, so a price change between checkout and payment
    // never strands a buyer. With no payments row, fall back to today's price.
    const recorded = order ? Number(order.amount_paise) : NaN;
    const expectedPaise = Number.isInteger(recorded) && recorded > 0 ? recorded : plan.amountPaise;
    if (pay.amount !== expectedPaise || pay.currency !== 'INR') {
      console.error('webhook amount/plan mismatch', pay.id, pay.amount, plan.id, expectedPaise);
      return new Response('mismatch', { status: 200 });
    }

    // --- Step 3: Resolve user_id ---
    // From payments row (preferred) or from Razorpay order notes.
    const userId: string | null = (order && order.user_id as string) ||
      (pay.notes && pay.notes.user_id as string) || null;

    if (!userId) {
      console.error('webhook: no user_id for payment', pay.id);
      return new Response('no user', { status: 200 });
    }

    // --- Step 4: If still no payments row, create a ledger entry ---
    if (!order) {
      const { data: inserted, error: insErr } = await admin.from('payments').insert({
        user_id: userId,
        razorpay_payment_id: pay.id,
        razorpay_order_id: pay.order_id || null,
        plan_id: plan.id,
        plan_name: plan.name,
        amount_paise: expectedPaise,
        currency: 'INR',
        status: 'paid',
        verified_on_server: true,
      }).select().limit(1);
      if (!insErr && inserted && inserted[0]) order = inserted[0];
    }

    // --- Step 5: Grant subscription (idempotent) ---
    console.log('razorpay-webhook: granting subscription for user', userId, 'plan', plan.id);
    const grant = await grantSubscription(admin, {
      userId, planId: plan.id, days: plan.days,
      paymentId: pay.id, orderId: pay.order_id || null, grantedBy: 'razorpay',
    });

    // --- Step 6: Update the payments row ---
    if (order) {
      await admin.from('payments').update({
        status: 'paid',
        razorpay_payment_id: pay.id,
        verified_on_server: true,
        expires_at: grant.expiresAt,
        updated_at: new Date().toISOString(),
      }).eq('id', (order as { id: string }).id);
    }

    console.log('razorpay-webhook: done, alreadyGranted:', grant.alreadyGranted, 'expiresAt:', grant.expiresAt);
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('razorpay-webhook: unhandled error', e);
    return new Response('error', { status: 500 }); // 5xx => Razorpay retries
  }
});
