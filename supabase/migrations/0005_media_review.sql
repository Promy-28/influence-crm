-- Isolated from outreach. No approval, campaign, DNC or email state is changed.
create table if not exists creator_media_reviews (
  creator_id text not null check (creator_id ~ '^(hub-[a-f0-9]{16}|[a-f0-9-]{36})$'),
  source text not null check (length(source) <= 2000),
  status text not null check (status in ('processing', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error text,
  primary key (creator_id, source)
);
create table if not exists creator_media_budget (
  hour timestamptz primary key,
  used integer not null check (used between 0 and 20)
);
alter table creator_media_reviews enable row level security;
alter table creator_media_budget enable row level security;
create or replace function claim_creator_media_review(p_creator_id text, p_source text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare current_row creator_media_reviews; used_count integer;
begin
  -- Serialize reservations across concurrent requests, not just one server instance.
  perform pg_advisory_xact_lock(615214001);
  if length(p_source) > 2000 or p_creator_id !~ '^(hub-[a-f0-9]{16}|[a-f0-9-]{36})$' then
    raise exception 'Invalid creator/media source';
  end if;
  select * into current_row from creator_media_reviews where creator_id = p_creator_id and source = p_source;
  if current_row.status = 'completed' then return jsonb_build_object('claimed', false, 'status', 'completed', 'result', current_row.result); end if;
  if current_row.status = 'processing' and current_row.started_at > now() - interval '5 minutes' then
    return jsonb_build_object('claimed', false, 'status', 'processing');
  end if;
  insert into creator_media_budget(hour,used) values (date_trunc('hour',now()),0) on conflict do nothing;
  select used into used_count from creator_media_budget where hour = date_trunc('hour',now());
  if used_count >= 20 then return jsonb_build_object('claimed',false,'status','hourly_limit'); end if;
  update creator_media_budget set used = used + 1 where hour = date_trunc('hour',now());
  insert into creator_media_reviews(creator_id,source,status,started_at)
    values(p_creator_id,p_source,'processing',now())
    on conflict (creator_id,source) do update set status='processing',started_at=now(),finished_at=null,result=null,error=null;
  return jsonb_build_object('claimed',true,'status','processing');
end $$;
revoke all on function claim_creator_media_review(text,text) from public, anon, authenticated;
grant execute on function claim_creator_media_review(text,text) to service_role;
