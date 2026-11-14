-- Autopilot answers on its own; these mark the conversations where a person has to step in.
alter table creators add column if not exists needs_human boolean not null default false;
alter table creators add column if not exists human_reason text;
alter table drafts add column if not exists escalate boolean not null default false;
alter table drafts add column if not exists escalate_reason text;
create index if not exists creators_needs_human on creators(needs_human) where needs_human;
