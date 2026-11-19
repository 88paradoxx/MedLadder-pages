// Google Play real-time developer notifications (Cloud Pub/Sub push).
// Keeps Pro in step with renewals, cancellations, expiry, holds and refunds, even when
// the app is never opened again. Deploy with --no-verify-jwt (Pub/Sub has no Supabase
// login); authenticity comes from the secret ?token= in the push endpoint URL, and every
// change is re-read from Google's own API rather than trusted from the message.
//
// Pub/Sub push endpoint: https://<project>.supabase.co/functions/v1/play-rtdn?token=<PLAY_RTDN_TOKEN>
import { adminClient } from '../_shared/common.ts';
import { timingSafeEqual } from '../_shared/logic.ts';
import { applySubscription, getSubscription, isSafeToken, PACKAGE_NAME } from '../_shared/play.ts';

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const expected = Deno.env.get('PLAY_RTDN_TOKEN') || '';
    const given = new URL(req.url).searchParams.get('token') || '';
    if (!expected || !timingSafeEqual(given, expected)) return new Response('Forbidden', { status: 403 });

    const body = await req.json().catch(() => null);
    const data = body && body.message && body.message.data;
    if (typeof data !== 'string') return new Response('ignored', { status: 200 });
    let n: any;
    try { n = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)))); }
    catch { return new Response('bad message', { status: 200 }); }

    if (n.packageName && n.packageName !== PACKAGE_NAME) return new Response('other app', { status: 200 });
    if (n.testNotification) { console.log('play-rtdn: test notification received'); return new Response('ok', { status: 200 }); }

    const admin = adminClient();

    if (n.subscriptionNotification) {
      const token = n.subscriptionNotification.purchaseToken;
      if (!isSafeToken(token)) return new Response('bad token', { status: 200 });
      const sub = await getSubscription(token);
      if (!sub) return new Response('not found', { status: 200 });
      const r = await applySubscription(admin, token, sub, null);
      console.log('play-rtdn: type', n.subscriptionNotification.notificationType, 'state', sub.subscriptionState, '->', r.status, r.skipped || '');
      return new Response('ok', { status: 200 });
    }

    if (n.voidedPurchaseNotification) {
      // Refund or chargeback: Pro ends now.
      const token = n.voidedPurchaseNotification.purchaseToken;
      if (isSafeToken(token)) {
        const nowIso = new Date().toISOString();
        await admin.from('subscriptions').update({ status: 'refunded', expires_at: nowIso, updated_at: nowIso })
          .eq('play_purchase_token', token);
        console.log('play-rtdn: voided purchase, Pro removed');
      }
      return new Response('ok', { status: 200 });
    }

    return new Response('ignored', { status: 200 });
  } catch (e) {
    // 5xx makes Pub/Sub retry, which is what we want for a Google or database hiccup.
    console.error('play-rtdn error', e);
    return new Response('error', { status: 500 });
  }
});
