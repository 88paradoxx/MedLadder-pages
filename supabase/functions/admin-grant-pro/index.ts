// POST { action: 'grant' | 'revoke', target_email, days? } -> { success, expires_at? }
// Only callable by a signed-in user whose app_metadata.role === 'admin'.
import {
  adminClient, grantSubscription, HttpError, isAdminUser, json, preflight, requireUser,
} from '../_shared/common.ts';
import { isValidEmail } from '../_shared/logic.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, req);

  try {
    const admin = adminClient();
    const caller = await requireUser(req, admin);
    if (!isAdminUser(caller)) return json({ error: 'Admins only' }, 403, req);

    const body = await req.json().catch(() => ({}));
    const action = body && body.action === 'revoke' ? 'revoke' : 'grant';
    const email = typeof body.target_email === 'string' ? body.target_email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) return json({ error: 'Enter a valid email' }, 400, req);

    const { data: targetId, error: findErr } = await admin.rpc('admin_find_user_id', { p_email: email });
    if (findErr) throw new HttpError(500, 'User lookup failed');
    if (!targetId) return json({ error: 'No account with that email — ask the student to sign up first.' }, 404, req);

    let expiresAt: string | null = null;
    let days: number | null = null;

    if (action === 'grant') {
      days = Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > 3650) {
        return json({ error: 'Days must be a whole number from 1 to 3650' }, 400, req);
      }
      const g = await grantSubscription(admin, {
        userId: targetId, planId: 'admin_grant', days,
        paymentId: null, orderId: null, grantedBy: caller.email || 'admin',
      });
      expiresAt = g.expiresAt;
    } else {
      const { error } = await admin.from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('user_id', targetId).eq('status', 'active');
      if (error) throw new HttpError(500, 'Could not revoke');
    }

    await admin.from('admin_audit').insert({
      admin_id: caller.id, admin_email: caller.email,
      action, target_id: targetId, target_email: email,
      details: { days, expires_at: expiresAt },
    });

    return json({ success: true, expires_at: expiresAt }, 200, req);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status, req);
    console.error('admin-grant-pro error', e);
    return json({ error: 'Unexpected error' }, 500, req);
  }
});
