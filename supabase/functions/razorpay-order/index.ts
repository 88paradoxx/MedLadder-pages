// POST { plan_id }  ->  { order_id, amount, currency, key_id }
// The amount and duration come from PLANS on the server — never from the browser.
import { adminClient, HttpError, json, preflight, razorpayAuthHeader, requireUser } from '../_shared/common.ts';
import { getPlan, makeReceipt } from '../_shared/logic.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req);

  try {
    const admin = adminClient();
    const user = await requireUser(req, admin);

    const body = await req.json().catch(() => ({}));
    const plan = getPlan(body && body.plan_id);
    if (!plan) return json({ error: 'Unknown plan' }, 400, req);

    // Cheap abuse guard: max 20 unpaid orders per user per hour.
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await admin.from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('status', 'created').gt('created_at', since);
    if ((count || 0) >= 20) return json({ error: 'Too many checkout attempts. Try again later.' }, 429, req);

    const rzp = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: razorpayAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: plan.amountPaise,
        currency: 'INR',
        receipt: makeReceipt(user.id, Date.now()),
        notes: { user_id: user.id, plan_id: plan.id },
      }),
    });
    if (!rzp.ok) {
      console.error('razorpay order failed', rzp.status, await rzp.text());
      return json({ error: 'Could not start checkout' }, 502, req);
    }
    const order = await rzp.json();

    const { error } = await admin.from('payments').insert({
      user_id: user.id,
      user_email: user.email || '',
      razorpay_order_id: order.id,
      plan_id: plan.id,
      plan_name: plan.name,
      amount_paise: plan.amountPaise,
      currency: 'INR',
      status: 'created',
      verified_on_server: false,
    });
    if (error) {
      console.error('payments insert failed', error.message);
      return json({ error: 'Could not start checkout' }, 500, req);
    }

    return json({
      order_id: order.id,
      amount: plan.amountPaise,
      currency: 'INR',
      key_id: Deno.env.get('RAZORPAY_KEY_ID'),
    }, 200, req);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status, req);
    console.error('razorpay-order error', e);
    return json({ error: 'Unexpected error' }, 500, req);
  }
});
