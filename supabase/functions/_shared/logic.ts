// Pure helpers shared by the Edge Functions. No Deno / network imports here,
// so this file can be unit-tested with plain Node (see tools/test-logic.js).

export interface Plan {
  id: string;
  name: string;
  days: number;
  amountPaise: number;
}

// SERVER-SIDE price list. The browser only ever sends a plan id — it can never
// choose the amount or the duration. Keep in sync with PRO_PLANS in app.js
// (that copy is for display only).
// Prices revised 2026-11-19: 3 months 399 -> 499, 1 year 999 -> 1299.
export const PLANS: Record<string, Plan> = {
  '1_month':  { id: '1_month',  name: '1 Month',  days: 30,  amountPaise: 19900 },
  '3_months': { id: '3_months', name: '3 Months', days: 90,  amountPaise: 49900 },
  '6_months': { id: '6_months', name: '6 Months', days: 180, amountPaise: 79900 },
  '1_year':   { id: '1_year',   name: '1 Year',   days: 365, amountPaise: 129900 },
};

export function getPlan(id: unknown): Plan | null {
  if (typeof id !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(PLANS, id) ? PLANS[id] : null;
}

// New expiry = max(now, current expiry) + days, so renewing early never loses time.
export function computeExpiry(nowMs: number, currentExpiryMs: number | null, days: number): Date {
  const base = currentExpiryMs !== null && !Number.isNaN(currentExpiryMs) && currentExpiryMs > nowMs
    ? currentExpiryMs
    : nowMs;
  return new Date(base + days * 86_400_000);
}

const encoder = new TextEncoder();

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time string comparison (lengths are not secret here).
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Razorpay Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret)
export async function verifyCheckoutSignature(
  orderId: string, paymentId: string, signature: string, keySecret: string,
): Promise<boolean> {
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  const expected = await hmacSha256Hex(keySecret, orderId + '|' + paymentId);
  return timingSafeEqual(expected, signature);
}

// Razorpay webhook signature: HMAC_SHA256(raw request body, webhook_secret)
export async function verifyWebhookSignature(
  rawBody: string, signature: string, webhookSecret: string,
): Promise<boolean> {
  if (!rawBody || !signature || !webhookSecret) return false;
  const expected = await hmacSha256Hex(webhookSecret, rawBody);
  return timingSafeEqual(expected, signature);
}

export function parseAllowedOrigins(env: string | undefined | null): string[] {
  const raw = env && env.trim()
    ? env
    : 'https://medladder.top,https://www.medladder.top';
  return raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
}

export function corsHeadersFor(origin: string | null, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (
    origin &&
    (allowed.indexOf(origin) !== -1 ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin))
  ) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

// Razorpay receipts must be <= 40 chars.
export function makeReceipt(userId: string, nowMs: number): string {
  return ('ml_' + userId.replace(/-/g, '').slice(0, 12) + '_' + nowMs.toString(36)).slice(0, 40);
}

export function isSafeId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_]{6,64}$/.test(v);
}

export function isValidEmail(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
