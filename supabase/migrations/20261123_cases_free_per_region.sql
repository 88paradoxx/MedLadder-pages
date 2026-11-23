-- Clinical cases: the first 8 published cases of each system (in syllabus order) are free.
-- Kept up to date automatically when cases are added, removed, published/unpublished or reordered.
create or replace function public.cases_apply_free_quota(p_free int default 8)
returns void language plpgsql security definer set search_path = public as $$
begin
  with ranked as (
    select c.id,
      row_number() over (partition by c.region_id order by
        coalesce(array_position(r.topics, c.topic), 999), c.topic,
        case c.level when 'core' then 0 else 1 end, c.sort, c.created_at, c.id) as rn
    from clinical_cases c join case_regions r on r.id = c.region_id
    where c.published
  )
  , keep as (select id from ranked where rn <= p_free)
  update clinical_cases c
     set is_free = (c.id in (select id from keep))
   where c.is_free is distinct from (c.id in (select id from keep));
end $$;

create or replace function public.cases_free_quota_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;  -- ignore the trigger's own update
  perform public.cases_apply_free_quota(8);
  return null;
end $$;

drop trigger if exists cases_free_quota on public.clinical_cases;
create trigger cases_free_quota
  after insert or delete or update of published, region_id, topic, level, sort on public.clinical_cases
  for each statement execute function public.cases_free_quota_trg();

-- Topic order changes (admin adds a topic) can also shift the ranking.
drop trigger if exists cases_free_quota_regions on public.case_regions;
create trigger cases_free_quota_regions
  after update of topics on public.case_regions
  for each statement execute function public.cases_free_quota_trg();

revoke all on function public.cases_apply_free_quota(int) from public, anon, authenticated;

select public.cases_apply_free_quota(8);
