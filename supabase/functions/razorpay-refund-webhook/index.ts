// Razorpay -> server webhook for refunds and chargebacks. Revokes Pro when a
// payment is refunded or disputed. Deploy with --no-verify-jwt.
//
// Dashboard: Settings > Webhooks > add events: refund.created, payment.dispute.created
//            to the same webhook URL, or to a separate one for this function.
import { adminClient } from '../_shared/common.ts';
import { verifyWebhookSignature } from '../_shared/logic.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
  if (!secret) return new Response('Not configured', { status: 500 });

  const raw = await req.text();
  const sig = req.headers.get('x-razorpay-signature') || '';
  if (!(await verifyWebhookSignature(raw, sig, secret))) {
    return new Response('Bad signature', { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response('Bad JSON', { status: 400 }); }

  const name = event && event.event;

  // ── Handle refund.created ─────────────────────────────────────────────────
  if (name === 'refund.created') {
    const refund = event.payload && event.payload.refund && event.payload.refund.entity;
    if (!refund || !refund.payment_id) return new Response('ignored', { status: 200 });

    try {
      const admin = adminClient();

      // Find the subscription(s) granted by this payment and cancel them.
      const { data: subs, error } = await admin.from('subscriptions')
        .select('id, user_id, status')
        .eq('razorpay_payment_id', refund.payment_id)
        .eq('status', 'active');

      if (error) {
        console.error('refund-webhook: lookup error', error.message);
        return new Response('db error', { status: 500 });
      }

      if (subs && subs.length > 0) {
        const { error: updateErr } = await admin.from('subscriptions')
          .update({ status: 'refunded', updated_at: new Date().toISOString() })
          .eq('razorpay_payment_id', refund.payment_id)
          .eq('status', 'active');

        if (updateErr) {
          console.error('refund-webhook: update error', updateErr.message);
          return new Response('db error', { status: 500 });
        }

        // Also mark the payment row as refunded
        await admin.from('payments')
          .update({ status: 'refunded', updated_at: new Date().toISOString() })
          .eq('razorpay_payment_id', refund.payment_id);

        console.log(`refund-webhook: revoked ${subs.length} subscription(s) for payment ${refund.payment_id}`);
      } else {
        console.log(`refund-webhook: no active subscription for payment ${refund.payment_id}, nothing to revoke`);
      }

      return new Response('ok', { status: 200 });
    } catch (e) {
      console.error('refund-webhook error', e);
      return new Response('error', { status: 500 });
    }
  }

  // ── Handle payment.dispute.created (chargeback) ───────────────────────────
  if (name === 'payment.dispute.created') {
    const dispute = event.payload && event.payload.dispute && event.payload.dispute.entity;
    if (!dispute || !dispute.payment_id) return new Response('ignored', { status: 200 });

    try {
      const admin = adminClient();

      // Cancel any active subscription tied to the disputed payment.
      const { error: updateErr } = await admin.from('subscriptions')
        .update({ status: 'disputed', updated_at: new Date().toISOString() })
        .eq('razorpay_payment_id', dispute.payment_id)
        .eq('status', 'active');

      if (updateErr) {
        console.error('dispute-webhook: update error', updateErr.message);
        return new Response('db error', { status: 500 });
      }

      // Mark payment as disputed
      await admin.from('payments')
        .update({ status: 'disputed', updated_at: new Date().toISOString() })
        .eq('razorpay_payment_id', dispute.payment_id);

      console.log(`dispute-webhook: handled dispute for payment ${dispute.payment_id}`);
      return new Response('ok', { status: 200 });
    } catch (e) {
      console.error('dispute-webhook error', e);
      return new Response('error', { status: 500 });
    }
  }

  // Unknown event type — acknowledge so Razorpay doesn't retry
  return new Response('ignored', { status: 200 });
});
