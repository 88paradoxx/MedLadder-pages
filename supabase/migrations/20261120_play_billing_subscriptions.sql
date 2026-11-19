-- Google Play Billing: one subscriptions row per Play purchase token, kept up to date by
-- the play-verify and play-rtdn edge functions. Also records where each Pro came from.

alter table public.subscriptions
  add column if not exists source text not null default 'razorpay',
  add column if not exists play_purchase_token text,
  add column if not exists play_order_id text,
  add column if not exists play_product_id text,
  add column if not exists play_base_plan_id text,
  add column if not exists auto_renewing boolean;

-- Existing rows: Razorpay purchases, or Pro granted by an admin.
update public.subscriptions
   set source = case when razorpay_payment_id is not null or granted_by = 'razorpay' then 'razorpay' else 'admin' end
 where source = 'razorpay';

alter table public.subscriptions drop constraint if exists subscriptions_source_check;
alter table public.subscriptions add constraint subscriptions_source_check
  check (source in ('razorpay', 'google_play', 'admin'));

-- Plain (not partial) unique index so upserts can use ON CONFLICT (play_purchase_token);
-- NULLs never clash, so Razorpay and admin rows are unaffected.
create unique index if not exists subscriptions_play_token_uidx on public.subscriptions (play_purchase_token);

-- Lets the website tell app subscribers to manage their plan in Google Play.
create or replace function public.my_pro_source()
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select json_build_object('source', s.source, 'expires_at', s.expires_at, 'auto_renewing', s.auto_renewing, 'product_id', s.play_product_id)
  from subscriptions s
  where s.user_id = auth.uid() and s.status = 'active' and s.expires_at > now()
  order by s.expires_at desc
  limit 1
$$;
revoke all on function public.my_pro_source() from public, anon;
grant execute on function public.my_pro_source() to authenticated;
