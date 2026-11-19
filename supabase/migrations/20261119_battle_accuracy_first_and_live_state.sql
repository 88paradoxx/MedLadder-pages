-- Applied to the live project on 2026-11-19 (two migrations, combined here in their final form).
--
-- 1. Accuracy first: score = 100 per right answer (-25 per wrong with negative marking).
--    Speed and streak go into a separate bonus that only breaks ties.
-- 2. battle_live_state: lighter state for in-game screens (top N players plus the caller).

alter table public.battle_answers add column if not exists bonus int not null default 0;
alter table public.battle_players add column if not exists bonus int not null default 0;

-- Move the speed/streak part of past answers out of their points (safe to re-run).
update public.battle_answers set bonus = points - 100, points = 100 where correct and points <> 100;
update public.battle_players p set bonus = s.b, score = p.score - s.b
from (select player_id, sum(bonus) b from public.battle_answers group by player_id) s
where s.player_id = p.id and p.bonus = 0 and s.b <> 0;

CREATE OR REPLACE FUNCTION public.battle_answer(p_code text, p_token uuid, p_qid integer, p_choice text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b battles; me battle_players; q questions; ok boolean; secs numeric; pts int; bon int := 0; ns int; spd int := 0; stk int := 0; ch text := upper(btrim(p_choice));
begin
  select * into b from battles where code = upper(btrim(p_code));
  if not found then raise exception 'not_found'; end if;
  select * into me from battle_players where battle_id = b.id and token = p_token for update;
  if not found then raise exception 'not_player'; end if;
  if b.status <> 'live' or now() < b.starts_at or now() > b.ends_at + interval '2 seconds' then
    perform battle_close(b.id); raise exception 'closed';
  end if;
  if ch not in ('A','B','C','D','E') or not (p_qid = any(b.question_ids)) then raise exception 'bad_answer'; end if;
  if exists (select 1 from battle_answers where player_id = me.id and question_id = p_qid) then
    return json_build_object('ok', true, 'dup', true, 'answered', me.answered, 'score', me.score, 'total_bonus', me.bonus, 'streak', me.streak);
  end if;
  select * into q from questions where id = p_qid;
  ok := upper(btrim(q.answer)) = ch;
  secs := least(600, greatest(0, extract(epoch from now() - greatest(coalesce(me.last_at, b.starts_at), b.starts_at))));
  ns := case when ok then me.streak + 1 else 0 end;
  if ok then
    -- Speed counts only after 3 s, so tapping blindly earns nothing extra.
    spd := case when secs < 3 then 0 else round(50 * greatest(0, 1 - (secs - 3) / 57))::int end;
    if secs >= 3 and secs < 8 then spd := 50; end if;
    stk := case when ns >= 3 then least(50, 10 * (ns - 2)) else 0 end;
    pts := 100;
    bon := spd + stk;  -- tie-breaker only; never added to the score
  else
    pts := case when b.neg then -25 else 0 end;
  end if;
  insert into battle_answers (battle_id, player_id, question_id, choice, correct, secs, points, bonus) values (b.id, me.id, p_qid, ch, ok, secs, pts, bon);
  update battle_players set score = score + pts, bonus = bonus + bon, correct = correct + (case when ok then 1 else 0 end), answered = answered + 1,
    streak = ns, best_streak = greatest(best_streak, ns), last_at = now(),
    time_used = extract(epoch from least(now(), b.ends_at) - b.starts_at),
    finished_at = case when answered + 1 >= cardinality(b.question_ids) then now() else finished_at end
  where id = me.id;
  perform battle_close(b.id);
  return json_build_object('ok', true, 'answer', upper(btrim(q.answer)), 'correct', ok, 'points', pts, 'bonus', bon, 'speed', spd, 'streak_bonus', stk, 'streak', ns,
    'score', me.score + pts, 'total_bonus', me.bonus + bon, 'answered', me.answered + 1, 'secs', round(secs, 1));
end $function$;

CREATE OR REPLACE FUNCTION public.battle_close(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b battles; unfinished int; total int;
begin
  select * into b from battles where id = p_id for update;
  if not found or b.status in ('ended', 'expired') then return; end if;
  -- An empty lobby (host alone) closes after 3 hours.
  if b.status = 'lobby' then
    if b.created_at < now() - interval '3 hours' and (select count(*) from battle_players where battle_id = p_id) < 2 then
      update battles set status = 'expired', ended_at = now() where id = p_id;
    end if;
    return;
  end if;
  if b.starts_at is null then return; end if;
  select count(*) filter (where finished_at is null), count(*) into unfinished, total from battle_players where battle_id = p_id;
  if now() >= b.ends_at or (total > 0 and unfinished = 0) then
    update battle_players set finished_at = coalesce(finished_at, least(now(), b.ends_at)) where battle_id = p_id;
    update battle_players p set rank = r.rk from (
      select id, row_number() over (order by score desc, bonus desc, time_used asc, joined_at asc) rk from battle_players where battle_id = p_id
    ) r where p.id = r.id;
    update battles set status = 'ended', ended_at = now() where id = p_id;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.battle_state(p_code text, p_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b battles; me battle_players; res json; pl json;
begin
  select * into b from battles where code = upper(btrim(p_code));
  if not found then raise exception 'not_found'; end if;
  perform battle_close(b.id);
  select * into b from battles where id = b.id;
  select * into me from battle_players where battle_id = b.id and token = p_token;
  select coalesce(json_agg(y.j order by y.ord), '[]'::json) into pl from (
    select row_number() over (order by case when b.status='lobby' then 0 else -score end, case when b.status='lobby' then 0 else -bonus end, time_used, joined_at) ord,
      json_build_object('id', id, 'nickname', nickname, 'is_host', is_host, 'answered', answered, 'score', score, 'bonus', bonus, 'correct', correct,
        'streak', streak, 'finished', finished_at is not null, 'rank', rank, 'member', user_id is not null) as j
    from battle_players where battle_id = b.id) y;
  res := json_build_object(
    'code', b.code, 'created_at', b.created_at, 'title', b.title, 'status', b.status, 'minutes', b.minutes, 'max_players', b.max_players,
    'neg', b.neg, 'n', cardinality(b.question_ids), 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'now', now(),
    'next_code', b.next_code, 'module_ids', b.source->'module_ids',
    'me', case when me.id is null then null else json_build_object('id', me.id, 'is_host', me.is_host,
        'finished', me.finished_at is not null, 'answered', me.answered, 'score', me.score, 'bonus', me.bonus, 'streak', me.streak) end,
    'players', pl);
  return res;
end $function$;

-- Lighter state for the in-game screens: the top p_top players plus the caller,
-- each with its place (equal points and bonus share a place), plus room totals.
-- In the lobby it returns the full battle_state, since the host needs every name.
create or replace function public.battle_live_state(p_code text, p_token uuid, p_top int)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare b battles; me battle_players; pl json; v_total int; v_still int; v_top int;
begin
  select * into b from battles where code = upper(btrim(p_code));
  if not found then raise exception 'not_found'; end if;
  if b.status = 'lobby' then return battle_state(p_code, p_token); end if;
  perform battle_close(b.id);
  select * into b from battles where id = b.id;
  select * into me from battle_players where battle_id = b.id and token = p_token;
  v_top := greatest(3, least(coalesce(p_top, 10), 50));
  select count(*), count(*) filter (where finished_at is null) into v_total, v_still
    from battle_players where battle_id = b.id;
  with r as (
    select p.*, rank() over (order by p.score desc, p.bonus desc) as place,
           row_number() over (order by p.score desc, p.bonus desc, p.correct desc, p.time_used, p.joined_at) as ord
    from battle_players p where p.battle_id = b.id)
  select coalesce(json_agg(json_build_object('id', id, 'nickname', nickname, 'is_host', is_host, 'answered', answered,
      'score', score, 'bonus', bonus, 'correct', correct, 'streak', streak, 'finished', finished_at is not null, 'rank', rank,
      'member', user_id is not null, 'place', place) order by ord), '[]'::json)
    into pl from r where ord <= v_top or (me.id is not null and id = me.id);
  return json_build_object(
    'code', b.code, 'created_at', b.created_at, 'title', b.title, 'status', b.status, 'minutes', b.minutes, 'max_players', b.max_players,
    'neg', b.neg, 'n', cardinality(b.question_ids), 'starts_at', b.starts_at, 'ends_at', b.ends_at, 'now', now(),
    'next_code', b.next_code, 'module_ids', b.source->'module_ids',
    'me', case when me.id is null then null else json_build_object('id', me.id, 'is_host', me.is_host,
        'finished', me.finished_at is not null, 'answered', me.answered, 'score', me.score, 'bonus', me.bonus, 'streak', me.streak) end,
    'players', pl, 'lite', true, 'total', v_total, 'still', v_still);
end $function$;
revoke all on function public.battle_live_state(text, uuid, int) from public;
grant execute on function public.battle_live_state(text, uuid, int) to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.battle_results(p_code text, p_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b battles; me battle_players; rk json; qs json; n int; res json; total int; can_exp boolean;
begin
  select * into b from battles where code = upper(btrim(p_code));
  if not found then raise exception 'not_found'; end if;
  perform battle_close(b.id);
  select * into b from battles where id = b.id;
  if b.status <> 'ended' then raise exception 'not_ended'; end if;
  select * into me from battle_players where battle_id = b.id and token = p_token;
  n := cardinality(b.question_ids);
  can_exp := battle_is_pro(auth.uid()) or not exists (
    select 1 from jsonb_array_elements_text(coalesce(b.source->'module_ids','[]'::jsonb)) m
    where m::int not in (select module_id from free_modules f where auth.uid() is not null or f.guest));
  select count(*) into total from battle_players where battle_id = b.id;
  select coalesce(json_agg(json_build_object('id', id, 'nickname', nickname, 'rank', rank, 'score', score, 'bonus', bonus, 'correct', correct,
     'answered', answered, 'time_used', round(time_used), 'best_streak', best_streak, 'is_me', id = me.id) order by rank), '[]'::json) into rk
  from battle_players where battle_id = b.id;
  if me.id is not null then
    select coalesce(json_agg(json_build_object('id', q.id, 'text', q.question_text, 'image', case when coalesce(q.image_url,'')<>'' then q.image_url end,
      'options', (select json_agg(o.t order by o.l) from (values ('A', q.option_a), ('B', q.option_b), ('C', q.option_c), ('D', q.option_d), ('E', q.option_e)) as o(l, t) where coalesce(o.t,'') <> ''),
      'letters', (select json_agg(o.l order by o.l) from (values ('A', q.option_a), ('B', q.option_b), ('C', q.option_c), ('D', q.option_d), ('E', q.option_e)) as o(l, t) where coalesce(o.t,'') <> ''),
      'answer', upper(btrim(q.answer)), 'explanation', case when can_exp then q.explanation end,
      'answered', (select count(*) from battle_answers a where a.battle_id = b.id and a.question_id = q.id),
      'right', (select count(*) from battle_answers a where a.battle_id = b.id and a.question_id = q.id and a.correct),
      'dist', (select coalesce(json_object_agg(c, k), '{}'::json) from (select choice c, count(*) k from battle_answers a where a.battle_id = b.id and a.question_id = q.id group by choice) d),
      'fastest', (select json_build_object('nickname', p.nickname, 'secs', round(a.secs,1)) from battle_answers a join battle_players p on p.id = a.player_id where a.battle_id = b.id and a.question_id = q.id and a.correct order by a.secs limit 1),
      'mine', (select a.choice from battle_answers a where a.player_id = me.id and a.question_id = q.id)
    ) order by array_position(b.question_ids, q.id)), '[]'::json) into qs
    from questions q where q.id = any(b.question_ids);
  end if;
  res := json_build_object('title', b.title, 'n', n, 'minutes', b.minutes, 'players', total, 'ranking', rk, 'questions', qs,
    'my_id', me.id, 'explanations_locked', not can_exp, 'is_host', coalesce(me.is_host,false), 'next_code', b.next_code, 'module_ids', b.source->'module_ids',
    'avg_secs', (select round(avg(secs),1) from battle_answers where player_id = me.id));
  return res;
end $function$;
