# MedLadder backend (Supabase)

Everything that decides "who can read what" and "who is Pro" lives here, server-side.
The browser only ever asks; it never grants.

```
supabase/
  schema.sql              run once (safe to re-run): tables, RLS, helper functions
  grant-admin.sql         make YOUR account an admin
  functions/
    razorpay-order/       creates the Razorpay order (server picks the price)
    razorpay-verify/      checks signature + asks Razorpay + grants Pro
    razorpay-webhook/     Razorpay -> server; grants Pro even if the tab was closed
    admin-grant-pro/      admin-only grant / revoke by email
    _shared/              logic.ts (pure, tested) + common.ts
```

## 1. Database
1. Supabase dashboard -> SQL editor -> paste `schema.sql` -> Run.
2. If you change how many modules are free, edit `PRO_CONFIG.FREE_MODULES_PER_SUBJECT` in
   `app.js`, run `node tools/gen-free-modules.js <n>` and run its output in the SQL editor.

Assumes `questions` has `module_id` (matches `id` in `syllabus.js`) and `is_pyq`, and
`module_progress` has `user_id`. That is what `app.js` already queries.

## 2. Edge Functions
```
supabase login
supabase link --project-ref groeibwykzrliphzzruk
supabase secrets set RAZORPAY_KEY_ID=rzp_live_... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=...
# optional, defaults to https://medladder.top and https://www.medladder.top
supabase secrets set ALLOWED_ORIGINS=https://medladder.top,https://www.medladder.top

supabase functions deploy razorpay-order          --no-verify-jwt
supabase functions deploy razorpay-verify         --no-verify-jwt
supabase functions deploy razorpay-webhook        --no-verify-jwt
supabase functions deploy razorpay-refund-webhook --no-verify-jwt
supabase functions deploy admin-grant-pro         --no-verify-jwt
```
`--no-verify-jwt` is intentional: each function verifies the caller itself
(`auth.getUser(token)`), and the webhook is authenticated by Razorpay's HMAC signature.

Razorpay dashboard -> Settings -> Webhooks: URL
`https://groeibwykzrliphzzruk.supabase.co/functions/v1/razorpay-webhook`, events
`payment.captured` and `order.paid`, secret = `RAZORPAY_WEBHOOK_SECRET`.

Prices live in `functions/_shared/logic.ts` (`PLANS`). `PRO_PLANS` in `app.js` is display only:
change both together.

## 3. Admin access
Sign in once with your admin email, run `grant-admin.sql`, then sign out and back in.
The 👑 Admin button appears; the console can grant / revoke Pro by email. Admin status is
`auth.users.raw_app_meta_data.role = 'admin'`, which users cannot edit from the browser.

## 4. Before going live
- **Existing paying users** used to get Pro via `user_metadata`, which no longer counts. Add
  them to `subscriptions` first, e.g.
  `insert into public.subscriptions (user_id, plan_id, expires_at, granted_by)
   select id, 'migrated', '2026-12-31', 'migration' from auth.users where email in ('...');`
  or use the admin console.
- Old rows in `payments` were written by browsers: treat them as unverified.
- Test with Razorpay **test** keys first (`rzp_test_...` in `PRO_CONFIG.RAZORPAY_KEY_ID` + secrets).

## 5. Pin + SRI for supabase-js
Pages load `@supabase/supabase-js@2.45.4` (pinned). To add Subresource Integrity:
```
curl -s https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```
Add `integrity="sha384-<result>"` next to `crossorigin` in `index.html` and in `generate_seo.py`
(`render_page`), then run `python3 generate_seo.py`.

## Known limits
- `questions.answer` is still sent to the browser for rows a user may read (a Pro user can see
  answers in the network tab). Fixing that needs an answer-checking endpoint.
- Phone-number login is not implemented (Google, email/password and email code only).
