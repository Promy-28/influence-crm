-- Runs the tool's 5-minute tick from inside Supabase. The app writes its own URL into settings.cron_url
-- the first time someone opens the Settings page, so nothing here needs editing.
-- If your project has not enabled these extensions yet, Supabase allows it from Database → Extensions too.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function influence_tick() returns void language plpgsql security definer set search_path = public as $$
declare u text;
begin
  select value #>> '{}' into u from settings where key = 'cron_url';
  if u is null or u = '' then return; end if;
  perform net.http_post(url := u, body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 60000);
end $$;

select cron.schedule('influence-tick', '*/5 * * * *', 'select influence_tick()');
