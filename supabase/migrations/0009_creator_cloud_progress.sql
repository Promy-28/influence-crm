create or replace function public.claim_creator_cloud_jobs() returns setof public.creator_cloud_jobs
language plpgsql security definer set search_path=public as $$
declare n int; j public.creator_cloud_jobs; h timestamptz:=date_trunc('hour',now());
begin
 perform pg_advisory_xact_lock(615214003);
 update creator_cloud_control set last_tick_at=now() where id=true;
 if not exists(select 1 from creator_cloud_control where enabled and (until_at is null or until_at>now())) then return; end if;
 select count(*) into n from creator_cloud_claims where hour=h;
 if (select count(*) from creator_cloud_jobs where lease_until>now())>=2 then return; end if;
 for j in select * from creator_cloud_jobs where status in ('queued','processing') and next_at<=now() and (lease_until is null or lease_until<now()) and (n<20 or exists(select 1 from creator_cloud_claims c where c.hour=h and c.creator_id=creator_cloud_jobs.creator_id)) order by (status='processing') desc,next_at,creator_id limit 20 loop
  if n>=20 and not exists(select 1 from creator_cloud_claims where hour=h and creator_id=j.creator_id) then continue; end if;
  insert into creator_cloud_claims(hour,creator_id) values(h,j.creator_id) on conflict do nothing;
  if found then n:=n+1; end if;
  update creator_cloud_jobs set status='processing',lease_until=now()+interval '6 minutes',updated_at=now() where creator_id=j.creator_id returning * into j;
  return next j;
  exit when (select count(*) from creator_cloud_jobs where lease_until>now())>=2;
 end loop;
end $$;
revoke all on function public.claim_creator_cloud_jobs() from public,anon,authenticated;
grant execute on function public.claim_creator_cloud_jobs() to service_role;


