// POST { purchase_token, product_id } -> { verified, status, expires_at, plan_id }
//
// Called by the Android app right after a Google Play purchase (and by "Restore
// purchases"). Trust chain: (1) valid Supabase session (2) Google's own API confirms
// the token for this app (3) the purchase was made for this MedLadder account
// (obfuscatedAccountId) and is not already linked to another account (4) only then
// write the subscription, and acknowledge the purchase so Google does not refund it.
import { adminClient, HttpError, json, preflight, requireUser } from '../_shared/common.ts';
import { applySubscription, getSubscription, isSafeToken, PLAY_PRODUCTS } from '../_shared/play.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req);

  try {
    const admin = adminClient();
    const user = await requireUser(req, admin);

    const body = await req.json().catch(() => ({}));
    const token = body && body.purchase_token;
    const productId = body && body.product_id;
    if (!isSafeToken(token)) return json({ verified: false, error: 'Bad request: invalid purchase token' }, 400, req);
    if (productId != null && !(typeof productId === 'string' && PLAY_PRODUCTS[productId])) {
      return json({ verified: false, error: 'Unknown product' }, 400, req);
    }

    const sub = await getSubscription(token);
    if (!sub) return json({ verified: false, error: 'Purchase not found' }, 404, req);

    const item = (sub.lineItems || [])[0] || {};
    if (!item.productId || !PLAY_PRODUCTS[item.productId]) return json({ verified: false, error: 'Unknown product' }, 400, req);
    if (productId && item.productId !== productId) return json({ verified: false, error: 'Purchase does not match product' }, 400, req);

    // The purchase must belong to this account.
    const obf = sub.externalAccountIdentifiers && sub.externalAccountIdentifiers.obfuscatedExternalAccountId;
    if (obf && obf !== user.id) return json({ verified: false, error: 'This purchase belongs to another MedLadder account' }, 409, req);
    const { data: owned } = await admin.from('subscriptions').select('user_id').eq('play_purchase_token', token).limit(1);
    if (owned && owned[0] && owned[0].user_id !== user.id) {
      return json({ verified: false, error: 'This purchase belongs to another MedLadder account' }, 409, req);
    }

    const r = await applySubscription(admin, token, sub, user.id);
    const ok = r.status === 'active' && !!r.expiresAt && Date.parse(r.expiresAt) > Date.now();
    return json({ verified: ok, status: r.status, expires_at: r.expiresAt, plan_id: r.planId, state: sub.subscriptionState || null }, 200, req);
  } catch (e) {
    if (e instanceof HttpError) return json({ verified: false, error: e.message }, e.status, req);
    console.error('play-verify error', e);
    return json({ verified: false, error: 'Unexpected error' }, 500, req);
  }
});
