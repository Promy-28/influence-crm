-- The texts last pushed to Instantly. When an arm's steps differ, the tick pushes them again.
alter table arms add column if not exists synced_steps jsonb;
alter table experiments add column if not exists hypothesis_id text;
