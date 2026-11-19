// Google Play Billing helpers shared by play-verify and play-rtdn.
//
// Auth: the service account JSON in the GOOGLE_PLAY_SERVICE_ACCOUNT secret signs a
// short-lived JWT, which Google swaps for an OAuth token for the Android Publisher API.
// The service account gets its rights from Play Console (Users and permissions), not
// from Google Cloud roles.
//
// Ownership: the app passes the Supabase user id as Play's obfuscatedAccountId when it
// starts a purchase, so every purchase token says which MedLadder account it belongs to.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './common.ts';

export const PACKAGE_NAME = Deno.env.get('PLAY_PACKAGE_NAME') || 'com.medladder.app';

// Play product id -> MedLadder plan id (same plan ids as the Razorpay PLANS in logic.ts).
export const PLAY_PRODUCTS: Record<string, string> = {
  pro_1m: '1_month',
  pro_3m: '3_months',
  pro_6m: '6_months',
  pro_1y: '1_year',
};

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/';

let cached: { token: string; exp: number } | null = null;

function b64url(bytes: Uint8Array | string): string {
  const s = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const raw = atob(body);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;

  const raw = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT');
  if (!raw) throw new HttpError(500, 'Google Play is not configured');
  let sa: { client_email: string; private_key: string; token_uri?: string };
  try { sa = JSON.parse(raw); } catch { throw new HttpError(500, 'Google Play key is not valid JSON'); }
  const aud = sa.token_uri || 'https://oauth2.googleapis.com/token';

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud, iat: now, exp: now + 3600 }));
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(header + '.' + claims)));
  const assertion = header + '.' + claims + '.' + b64url(sig);

  const res = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) {
    console.error('google token failed', res.status, await res.text());
    throw new HttpError(502, 'Could not reach Google Play');
  }
  const j = await res.json();
  cached = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return cached.token;
}

export interface PlaySub {
  subscriptionState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  testPurchase?: unknown;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
    offerDetails?: { basePlanId?: string };
  }>;
}

// purchases.subscriptionsv2.get — the source of truth for a purchase token.
export async function getSubscription(purchaseToken: string): Promise<PlaySub | null> {
  const t = await accessToken();
  const res = await fetch(API + encodeURIComponent(PACKAGE_NAME) + '/purchases/subscriptionsv2/tokens/' + encodeURIComponent(purchaseToken), {
    headers: { Authorization: 'Bearer ' + t },
  });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) {
    console.error('subscriptionsv2.get failed', res.status, await res.text());
    throw new HttpError(502, 'Google Play lookup failed');
  }
  return await res.json();
}

// A purchase that is not acknowledged within 3 days is refunded by Google.
export async function acknowledge(productId: string, purchaseToken: string): Promise<void> {
  const t = await accessToken();
  const res = await fetch(API + encodeURIComponent(PACKAGE_NAME) + '/purchases/subscriptions/' + encodeURIComponent(productId) +
    '/tokens/' + encodeURIComponent(purchaseToken) + ':acknowledge', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok && res.status !== 400) {
    // 400 usually means it is already acknowledged.
    console.error('acknowledge failed', res.status, await res.text());
  }
}

export function isSafeToken(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 10 && v.length <= 1000 && /^[A-Za-z0-9._:\-]+$/.test(v);
}

export interface ApplyResult { userId: string | null; status: string; expiresAt: string | null; planId: string | null; skipped?: string }

// Writes what Google says about one purchase token into public.subscriptions
// (one row per token, updated on every renewal or change).
export async function applySubscription(
  admin: SupabaseClient, purchaseToken: string, sub: PlaySub, knownUserId: string | null,
): Promise<ApplyResult> {
  const item = (sub.lineItems || [])[0] || {};
  const productId = item.productId || '';
  const planId = PLAY_PRODUCTS[productId] || null;
  if (!planId) return { userId: knownUserId, status: 'ignored', expiresAt: null, planId: null, skipped: 'unknown product ' + productId };

  const { data: existing } = await admin.from('subscriptions')
    .select('id, user_id').eq('play_purchase_token', purchaseToken).limit(1);
  const row = existing && existing[0];
  const obf = sub.externalAccountIdentifiers && sub.externalAccountIdentifiers.obfuscatedExternalAccountId || null;
  const userId = (row && row.user_id) || obf || knownUserId;
  if (!userId) return { userId: null, status: 'ignored', expiresAt: null, planId, skipped: 'no account on purchase' };

  const state = sub.subscriptionState || '';
  if (state === 'SUBSCRIPTION_STATE_PENDING' || state === 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED' || !item.expiryTime) {
    return { userId, status: 'pending', expiresAt: null, planId, skipped: state };
  }

  const now = Date.now();
  let expiresMs = Date.parse(item.expiryTime);
  let status = 'active';
  if (state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD') {
    // Payment is being retried: keep access for at least a day until Google tells us more.
    expiresMs = Math.max(expiresMs, now + 86_400_000);
  } else if (state === 'SUBSCRIPTION_STATE_EXPIRED' || state === 'SUBSCRIPTION_STATE_ON_HOLD' || state === 'SUBSCRIPTION_STATE_PAUSED') {
    status = 'expired';
    expiresMs = Math.min(expiresMs, now);
  }
  // ACTIVE and CANCELED (auto-renew off, still paid up) keep access until expiryTime.

  const record = {
    user_id: userId,
    plan_id: planId,
    status,
    expires_at: new Date(expiresMs).toISOString(),
    source: 'google_play',
    granted_by: 'google_play',
    play_purchase_token: purchaseToken,
    play_order_id: sub.latestOrderId || null,
    play_product_id: productId,
    play_base_plan_id: item.offerDetails && item.offerDetails.basePlanId || null,
    auto_renewing: !!(item.autoRenewingPlan && item.autoRenewingPlan.autoRenewEnabled),
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from('subscriptions').upsert(record, { onConflict: 'play_purchase_token' });
  if (error) {
    console.error('subscriptions upsert failed', error.message);
    throw new HttpError(500, 'Could not save subscription');
  }

  // An upgrade, downgrade or resubscribe replaces an older token: end the old one.
  if (sub.linkedPurchaseToken && sub.linkedPurchaseToken !== purchaseToken) {
    await admin.from('subscriptions')
      .update({ status: 'cancelled', expires_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('play_purchase_token', sub.linkedPurchaseToken).eq('status', 'active');
  }

  if (status === 'active' && sub.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') {
    await acknowledge(productId, purchaseToken);
  }
  return { userId, status, expiresAt: record.expires_at, planId };
}
