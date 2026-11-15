alter table creator_media_reviews add column if not exists provider_file jsonb;

create table if not exists creator_media_subjects (
 hour timestamptz not null,
 creator_id text not null,
 primary key(hour,creator_id)
);
alter table creator_media_subjects enable row level security;
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
  if not exists(select 1 from creator_media_subjects where hour=date_trunc('hour',now()) and creator_id=p_creator_id) then
  if used_count >= 20 then return jsonb_build_object('claimed',false,'status','hourly_limit'); end if;
  update creator_media_budget set used = used + 1 where hour = date_trunc('hour',now());
  insert into creator_media_subjects(hour,creator_id) values(date_trunc('hour',now()),p_creator_id);
  end if;
  insert into creator_media_reviews(creator_id,source,status,started_at)
    values(p_creator_id,p_source,'processing',now())
    on conflict (creator_id,source) do update set status='processing',started_at=now(),finished_at=null,result=null,error=null;
  return jsonb_build_object('claimed',true,'status','processing');
end $$;
revoke all on function claim_creator_media_review(text,text) from public, anon, authenticated;
grant execute on function claim_creator_media_review(text,text) to service_role;
