-- Additive, isolated queue. Rollback: pause control and unschedule only creator-cloud-review.
create table if not exists public.creator_cloud_control (
 id boolean primary key default true check(id), enabled boolean not null default false,
 until_at timestamptz, started_at timestamptz, last_tick_at timestamptz,
 last_error text, updated_at timestamptz not null default now()
);
insert into public.creator_cloud_control(id) values(true) on conflict do nothing;
create table if not exists public.creator_cloud_jobs (
 creator_id text primary key references public.reddit_creator_directory(id),
 fingerprint text, status text not null default 'queued' check(status in ('queued','processing','completed','blocked')),
 source text, parent_url text, samples jsonb not null default '[]',
 error text, attempts int not null default 0, lease_until timestamptz,
 next_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.creator_cloud_claims (
 hour timestamptz not null, creator_id text not null, primary key(hour,creator_id)
);
alter table public.creator_cloud_control enable row level security;
alter table public.creator_cloud_jobs enable row level security;
alter table public.creator_cloud_claims enable row level security;
create or replace function public.claim_creator_cloud_jobs() returns setof public.creator_cloud_jobs
language plpgsql security definer set search_path=public as $$
declare n int; j public.creator_cloud_jobs; h timestamptz:=date_trunc('hour',now());
begin
 perform pg_advisory_xact_lock(615214003);
 update creator_cloud_control set last_tick_at=now() where id=true;
 if not exists(select 1 from creator_cloud_control where enabled and (until_at is null or until_at>now())) then return; end if;
 select count(*) into n from creator_cloud_claims where hour=h;
 if (select count(*) from creator_cloud_jobs where lease_until>now())>=2 then return; end if;
 for j in select * from creator_cloud_jobs where status in ('queued','processing') and next_at<=now() and (lease_until is null or lease_until<now()) order by (status='processing') desc,next_at,creator_id limit 20 loop
  if n>=20 and not exists(select 1 from creator_cloud_claims where hour=h and creator_id=j.creator_id) then continue; end if;
  insert into creator_cloud_claims(hour,creator_id) values(h,j.creator_id) on conflict do nothing;
  if found then n:=n+1; end if;
  update creator_cloud_jobs set lease_until=now()+interval '6 minutes',updated_at=now() where creator_id=j.creator_id returning * into j;
  return next j;
  exit when (select count(*) from creator_cloud_jobs where lease_until>now())>=2;
 end loop;
end $$;
revoke all on function public.claim_creator_cloud_jobs() from public,anon,authenticated;
grant execute on function public.claim_creator_cloud_jobs() to service_role;
-- URL/token are provisioned by the authenticated Start button, never included in SQL/source.
create or replace function public.creator_cloud_wake() returns void language plpgsql security definer set search_path=public as $$
declare u text;
begin
 if not exists(select 1 from creator_cloud_control where enabled and (until_at is null or until_at>now())) then return; end if;
 select value #>> '{}' into u from settings where key='creator_cloud_cron_url';
 if u like 'https://influence-crm-ashy.vercel.app/api/creator-review/cloud-tick?token=%' then
  perform net.http_post(url:=u,body:='{}'::jsonb,headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=5000);
 end if;
end $$;
revoke all on function public.creator_cloud_wake() from public,anon,authenticated;
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('creator-cloud-review','* * * * *','select public.creator_cloud_wake()');
