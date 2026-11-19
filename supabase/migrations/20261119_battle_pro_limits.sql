-- Applied to the live project on 2026-11-19.
-- Battle limits: free hosts 5 players / 20 questions; Pro hosts 100 players / 200 questions.
CREATE OR REPLACE FUNCTION public.battle_build(p_uid uuid, p_token uuid, p_nick text, p_source jsonb, p_max integer, p_n integer, p_minutes integer, p_neg boolean, p_title text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pro boolean := battle_is_pro(p_uid);
  mids int[]; qids int[]; v_code text; v_id uuid; v_pid uuid; tries int := 0;
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; i int;
  v_max int; v_n int; v_min int;
begin
  if p_source->>'scope' = 'all' then
    -- Custom mix: every topic for Pro hosts, the free topics for everyone else.
    if pro then select array_agg(id) into mids from modules;
    else select array_agg(module_id) into mids from free_modules; end if;
    p_source := p_source || jsonb_build_object('module_ids', to_jsonb(mids));
  else
    select array_agg(x::int) into mids from jsonb_array_elements_text(coalesce(p_source->'module_ids','[]'::jsonb)) x;
    if mids is null or cardinality(mids) = 0 or cardinality(mids) > 120 then raise exception 'bad_source'; end if;
  end if;
  -- Limits: free hosts 5 players / 20 questions; Pro hosts 100 players / 200 questions.
  v_max := greatest(2, least(coalesce(p_max,10), case when pro then 100 else 5 end));
  v_n := greatest(3, least(coalesce(p_n,20), case when pro then 200 else 20 end));
  v_min := greatest(3, least(coalesce(p_minutes,20), 120));
  if not pro then
    if (select count(*) from battles where host_user = p_uid and created_at > now() - interval '1 day') >= 3 then raise exception 'daily_limit'; end if;
    if exists (select 1 from unnest(mids) m where m not in (select module_id from free_modules)) then raise exception 'pro_required'; end if;
  end if;
  select array_agg(id) into qids from (
    select id from questions where module_id = any(mids) and coalesce(explanation,'') <> '' order by random() limit v_n
  ) q;
  if qids is null or cardinality(qids) < 3 then
    select array_agg(id) into qids from (select id from questions where module_id = any(mids) order by random() limit v_n) q;
  end if;
  if qids is null or cardinality(qids) < 3 then raise exception 'no_questions'; end if;
  loop
    v_code := '';
    for i in 1..6 loop v_code := v_code || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from battles where code = v_code);
    tries := tries + 1; if tries > 20 then raise exception 'code_failed'; end if;
  end loop;
  delete from battles where created_at < now() - interval '30 days';
  insert into battles (code, host_user, title, source, question_ids, max_players, minutes, neg)
  values (v_code, p_uid, left(coalesce(nullif(btrim(p_title),''),'Quiz Battle'), 60), p_source, qids, v_max, v_min, coalesce(p_neg,false))
  returning id into v_id;
  insert into battle_players (battle_id, token, user_id, nickname, is_host)
  values (v_id, p_token, p_uid, battle_clean_nick(p_nick), true) returning id into v_pid;
  return json_build_object('code', v_code, 'player_id', v_pid, 'n', cardinality(qids), 'max_players', v_max, 'minutes', v_min);
end $function$;
