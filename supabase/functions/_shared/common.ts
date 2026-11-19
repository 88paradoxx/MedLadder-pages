// Shared Deno-side plumbing for the Edge Functions.

import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { computeExpiry, corsHeadersFor, parseAllowedOrigins } from './logic.ts';

const allowedOrigins = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(req.headers.get('Origin'), allowedOrigins),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

// Answers the browser's CORS preflight. Without this, a browser's fetch()
// with an Authorization header is rejected before the real request is sent.
export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeadersFor(req.headers.get('Origin'), allowedOrigins) });
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// Verifies the caller's Supabase access token with Supabase Auth itself
// (never trusts anything the browser puts in the request body).
export async function requireUser(req: Request, admin: SupabaseClient): Promise<User> {
  const header = req.headers.get('Authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError(401, 'Sign in required');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data || !data.user) throw new HttpError(401, 'Invalid or expired session');
  return data.user;
}

export function isAdminUser(user: User): boolean {
  // app_metadata is server-controlled; user_metadata is user-editable and never trusted.
  return !!user.app_metadata && user.app_metadata.role === 'admin';
}

export interface GrantArgs {
  userId: string;
  planId: string;
  days: number;
  paymentId: string | null;
  orderId: string | null;
  grantedBy: string;
}

// Adds Pro time to a user. Idempotent per Razorpay payment id, so the
// browser's verify call and Razorpay's webhook can both fire safely.
export async function grantSubscription(
  admin: SupabaseClient, a: GrantArgs,
): Promise<{ expiresAt: string; alreadyGranted: boolean }> {
  if (a.paymentId) {
    const { data: dup } = await admin
      .from('subscriptions').select('expires_at, user_id')
      .eq('razorpay_payment_id', a.paymentId).limit(1);
    if (dup && dup.length > 0) {
      // SECURITY: ensure the payment belongs to the same user. Without this,
      // a payment ID could be replayed cross-user if a new code path is added.
      if (dup[0].user_id !== a.userId) {
        throw new HttpError(409, 'Payment already claimed by another account');
      }
      return { expiresAt: dup[0].expires_at, alreadyGranted: true };
    }
  }

  const nowIso = new Date().toISOString();
  const { data: latest, error: latestErr } = await admin
    .from('subscriptions').select('expires_at')
    .eq('user_id', a.userId).eq('status', 'active').gt('expires_at', nowIso)
    .order('expires_at', { ascending: false }).limit(1);
  if (latestErr) throw new HttpError(500, 'Could not read existing subscription');

  const currentMs = latest && latest.length > 0 ? Date.parse(latest[0].expires_at) : null;
  const expiresAt = computeExpiry(Date.now(), currentMs, a.days).toISOString();

  const { error } = await admin.from('subscriptions').insert({
    user_id: a.userId,
    plan_id: a.planId,
    status: 'active',
    starts_at: nowIso,
    expires_at: expiresAt,
    razorpay_payment_id: a.paymentId,
    razorpay_order_id: a.orderId,
    granted_by: a.grantedBy,
  });
  if (error) {
    // 23505 = unique violation: the other path (verify vs webhook) won the race.
    if ((error as { code?: string }).code === '23505') return { expiresAt, alreadyGranted: true };
    throw new HttpError(500, 'Could not save subscription');
  }
  return { expiresAt, alreadyGranted: false };
}

export function razorpayAuthHeader(): string {
  const id = Deno.env.get('RAZORPAY_KEY_ID');
  const secret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!id || !secret) throw new HttpError(500, 'Payment gateway is not configured');
  return 'Basic ' + btoa(id + ':' + secret);
}
