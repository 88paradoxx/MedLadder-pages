-- ============================================================================
-- Make an account an admin (run in the Supabase SQL editor, as the project owner).
--
-- Admin status lives in auth.users.raw_app_meta_data -> "role": "admin".
-- That field can only be changed from here / the service role — a signed-in user
-- cannot edit it from the browser, so it cannot be forged from the console.
--
-- 1. Sign in to medladder.top once with the account (Google or email) so it exists.
-- 2. Put that account's email below and run this.
-- 3. Sign OUT and sign back in — the admin flag is stamped into the login token,
--    so an already-open session will not see it until you sign in again.
-- ============================================================================

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
where lower(email) = lower('your-admin-email@example.com');   -- <-- your admin email

-- Check it worked (should return one row with role = admin):
select id, email, raw_app_meta_data ->> 'role' as role
from auth.users
where lower(email) = lower('your-admin-email@example.com');

-- To remove admin from an account later:
-- update auth.users set raw_app_meta_data = raw_app_meta_data - 'role'
-- where lower(email) = lower('someone@example.com');
