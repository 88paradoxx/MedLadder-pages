// POST { razorpay_payment_id, razorpay_order_id, razorpay_signature } -> { verified, expires_at }
//
// Trust chain: (1) valid Supabase session  (2) Razorpay's HMAC signature matches
// (3) order_id belongs to this user in our payments table  (4) Razorpay's own API
// says the payment is paid/captured  (5) only then write subscription.
//
// SECURITY: order_id is REQUIRED. The no-order fallback was removed because it
// allowed any authenticated user to claim another user's unclaimed payment ID.
// The webhook already covers closed-tab cases; admin-grant-pro covers stuck ones.
import {
  adminClient, grantSubscription, HttpError, json, preflight, razorpayAuthHeader, requireUser,
} from '../_shared/common.ts';
import { getPlan, isSafeId, verifyCheckoutSignature } from '../_shared/logic.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req);

  try {
    const admin = adminClient();
    const user = await requireUser(req, admin);

    // Rate limit: max 5 verification attempts per minute per user (rolling 60s window)
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin.from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('status', 'paid').eq('verified_on_server', true).gt('updated_at', since);
    if ((count || 0) >= 5) return json({ verified: false, error: 'Too many verification attempts. Try again later.' }, 429, req);

    const body = await req.json().catch(() => ({}));
    const paymentId = body && body.razorpay_payment_id;
    const orderId = body && body.razorpay_order_id;
    const signature = body && body.razorpay_signature;

    // Both paymentId and orderId are required.
    if (!isSafeId(paymentId)) {
      return json({ verified: false, error: 'Bad request: invalid payment id' }, 400, req);
    }
    if (!isSafeId(orderId)) {
      return json({ verified: false, error: 'Bad request: order id is required' }, 400, req);
    }

    const secret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!secret) throw new HttpError(500, 'Payment gateway is not configured');

    // --- Verify HMAC signature before any DB lookup ---
    if (typeof signature !== 'string' || signature.length > 128) {
      return json({ verified: false, error: 'Bad request: invalid signature' }, 400, req);
    }
    if (!(await verifyCheckoutSignature(orderId, paymentId, signature, secret))) {
      return json({ verified: false, error: 'Signature mismatch' }, 400, req);
    }

    // --- Look up the order: it must be one we created, for this same user ---
    const { data: rows, error: rowErr } = await admin.from('payments').select('*')
      .eq('razorpay_order_id', orderId).eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(1);
    if (rowErr) throw new HttpError(500, 'Lookup failed');
    const order = rows && rows[0] ? rows[0] : null;
    if (!order) {
      return json({ verified: false, error: 'Order not found for this account' }, 404, req);
    }

    // The amount was fixed by the server when this order was created (razorpay-order),
    // so a price change between opening checkout and paying never strands a buyer.
    const plan = getPlan(order.plan_id as string);
    const expectedPaise = Number(order.amount_paise);
    if (!plan || !Number.isInteger(expectedPaise) || expectedPaise <= 0) {
      return json({ verified: false, error: 'Order does not match a plan' }, 400, req);
    }

    // --- Ask Razorpay directly about this payment ---
    const pr = await fetch('https://api.razorpay.com/v1/payments/' + paymentId, {
      headers: { Authorization: razorpayAuthHeader() },
    });
    if (!pr.ok) return json({ verified: false, error: 'Payment lookup failed' }, 502, req);
    const pay = await pr.json();

    // Validate amount, currency, and order_id match
    if (pay.amount !== expectedPaise || pay.currency !== 'INR') {
      return json({ verified: false, error: 'Payment does not match plan' }, 400, req);
    }
    if (isSafeId(orderId) && pay.order_id !== orderId) {
      return json({ verified: false, error: 'Payment does not match order' }, 400, req);
    }

    if (pay.status === 'authorized') {
      const cap = await fetch('https://api.razorpay.com/v1/payments/' + paymentId + '/capture', {
        method: 'POST',
        headers: { Authorization: razorpayAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: expectedPaise, currency: 'INR' }),
      });
      if (!cap.ok) return json({ verified: false, error: 'Capture failed' }, 502, req);
    } else if (pay.status !== 'captured') {
      return json({ verified: false, error: 'Payment not completed' }, 400, req);
    }

    const grant = await grantSubscription(admin, {
      userId: user.id, planId: plan.id, days: plan.days,
      paymentId, orderId, grantedBy: 'razorpay',
    });

    await admin.from('payments').update({
      status: 'paid',
      razorpay_payment_id: paymentId,
      razorpay_signature: typeof signature === 'string' ? signature : null,
      verified_on_server: true,
      expires_at: grant.expiresAt,
      updated_at: new Date().toISOString(),
    }).eq('id', (order as { id: string }).id);

    return json({ verified: true, expires_at: grant.expiresAt }, 200, req);
  } catch (e) {
    if (e instanceof HttpError) return json({ verified: false, error: e.message }, e.status, req);
    console.error('razorpay-verify error', e);
    return json({ verified: false, error: 'Unexpected error' }, 500, req);
  }
});
