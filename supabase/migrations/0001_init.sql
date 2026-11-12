-- Promy Influence CRM: finds UGC creators, emails them through Instantly, answers replies, tracks who registered on promy.io.
-- All access goes through the server with the service role; RLS stays on with no policies.

-- Keys and settings: one row per key. Secrets live here too and never leave the server.
create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- What we search for: TikTok/IG hashtags or search phrases. Yield decides which ones keep running.
create table queries (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('tiktok','instagram')),
  kind text not null default 'hashtag' check (kind in ('hashtag','search','profile')),
  value text not null,
  active boolean not null default true,
  origin text not null default 'manual' check (origin in ('manual','seed','learned')),
  runs int not null default 0,
  results int not null default 0,
  hits int not null default 0, -- approved creators who use this hashtag (learned queries switch on at 2)
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  unique (platform, kind, value)
);

-- Every Apify run: discovery (hashtag/search) or profile check.
create table runs (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  stage text not null check (stage in ('discover','profile')),
  actor text not null,
  input jsonb not null default '{}',
  query_ids uuid[] not null default '{}',
  apify_run_id text,
  status text not null default 'running' check (status in ('running','done','failed')),
  items int not null default 0,
  profiles int not null default 0,
  new_creators int not null default 0,
  cost_usd numeric not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index on runs(status);
create index on runs(started_at);

-- Accounts seen in discovery that still need a profile check (bio, email, last posts).
create table profile_queue (
  platform text not null,
  handle text not null,
  query_id uuid references queries(id) on delete set null,
  hint jsonb,
  status text not null default 'new' check (status in ('new','running','done')),
  run_id uuid references runs(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (platform, handle)
);
create index on profile_queue(status);

-- A/B tests. Each arm is its own Instantly campaign, so every lead's variant is known exactly.
create table experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hypothesis text,
  metric text not null default 'reply' check (metric in ('open','reply','positive','registered','profile')),
  status text not null default 'running' check (status in ('draft','running','done')),
  result text,
  winner_arm uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table arms (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid references experiments(id) on delete set null,
  label text not null,
  name text not null,
  steps jsonb not null, -- [{subject, body, delay_days}]
  inst_campaign_id text unique,
  status text not null default 'active' check (status in ('active','paused','archived')),
  inst_stats jsonb, -- totals as Instantly counts them, refreshed hourly
  stats_at timestamptz,
  created_at timestamptz not null default now()
);

-- One creator = one row. A creator with the same email on TikTok and Instagram stays one row.
create table creators (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('tiktok','instagram')),
  handle text not null,
  name text,
  first_name text,
  bio text,
  email text,
  email_source text,
  profile_url text,
  bio_link text,
  avatar_url text,
  region text,
  followers int,
  following int,
  likes bigint,
  posts_count int,
  verified boolean,
  private boolean,
  last_post_at timestamptz,
  posts_7d int,
  avg_views int,
  recent_posts jsonb not null default '[]',
  languages text[] not null default '{}',
  other_links jsonb not null default '{}',
  source text not null default 'apify',
  query_id uuid references queries(id) on delete set null,
  run_id uuid references runs(id) on delete set null,

  -- Filtering
  rule_flags text[] not null default '{}',
  ai_score int,
  ai_verdict text,
  ai_us boolean,
  ai_english boolean,
  ai_reasons text,
  ai_line text,
  ai_at timestamptz,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected','auto_rejected','existing')),
  reject_reason text,
  reviewed_by text,
  reviewed_at timestamptz,

  -- Outreach
  ref_code text unique,
  arm_id uuid references arms(id) on delete set null,
  inst_campaign_id text,
  inst_lead_id text,
  eaccount text,
  queued_at timestamptz,
  first_sent_at timestamptz,
  last_sent_at timestamptz,
  steps_sent int not null default 0,
  opened_at timestamptz,
  opens int not null default 0,
  clicked_at timestamptz,
  replied_at timestamptz,
  last_reply_at timestamptz,
  reply_label text,
  positive_at timestamptz,
  bounced_at timestamptz,
  unsubscribed_at timestamptz,
  do_not_contact boolean not null default false,
  needs_reply boolean not null default false,
  inst_reply_uuid text,
  inst_subject text,

  -- Promy
  registered_at timestamptz,
  profile_done_at timestamptz,
  first_video_at timestamptz,
  videos int not null default 0,
  promy_user_id text,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, handle)
);
create unique index creators_email_key on creators (lower(email)) where email is not null;
create index on creators(review_status);
create index on creators(first_sent_at);
create index on creators(arm_id);
create index on creators(needs_reply) where needs_reply;
create index on creators(created_at);

create or replace function touch() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger creators_touch before update on creators for each row execute function touch();

-- Everything that happened to a creator, with a date: the source for daily charts and per-arm numbers.
create table events (
  id bigint generated always as identity primary key,
  creator_id uuid not null references creators(id) on delete cascade,
  type text not null,
  step int not null default 0,
  arm_id uuid references arms(id) on delete set null,
  eaccount text,
  at timestamptz not null default now(),
  data jsonb
);
-- One of each per step. Videos use step = the video's number, so each one still counts.
alter table events add constraint events_once unique (creator_id, type, step);
create index on events(type, at);
create index on events(arm_id, type);

create table messages (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  subject text,
  body text not null,
  step int,
  eaccount text,
  inst_email_id text unique,
  via text not null default 'instantly',
  label text,
  sent_by text,
  at timestamptz not null default now()
);
create index on messages(creator_id, at);

-- AI reply drafts. The manager fixes them; edits teach the next drafts.
create table drafts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  label text,
  confidence numeric,
  summary text,
  body text not null,
  status text not null default 'new' check (status in ('new','scheduled','sent','skipped','superseded')),
  send_after timestamptz,
  sent_body text,
  edit_share numeric,
  auto boolean not null default false,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on drafts(status);
create index on drafts(creator_id);

create table activity_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  summary text not null,
  creator_id uuid references creators(id) on delete set null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index on activity_log(created_at);

-- Which searches bring creators worth emailing, and who registered from them.
create view query_stats as
select q.id, q.platform, q.kind, q.value, q.active, q.origin, q.runs, q.results, q.hits, q.last_run_at,
  count(c.id) as found,
  count(c.id) filter (where c.review_status = 'approved') as approved,
  count(c.id) filter (where c.review_status in ('rejected','auto_rejected')) as rejected,
  count(c.id) filter (where c.first_sent_at is not null) as emailed,
  count(c.id) filter (where c.replied_at is not null) as replied,
  count(c.id) filter (where c.registered_at is not null) as registered
from queries q left join creators c on c.query_id = q.id
group by q.id;

alter table settings enable row level security;
alter table queries enable row level security;
alter table runs enable row level security;
alter table profile_queue enable row level security;
alter table experiments enable row level security;
alter table arms enable row level security;
alter table creators enable row level security;
alter table events enable row level security;
alter table messages enable row level security;
alter table drafts enable row level security;
alter table activity_log enable row level security;

-- Starting searches. More are learned from the hashtags of creators you approve.
insert into queries (platform, kind, value) values
  ('tiktok','hashtag','ugccreator'), ('tiktok','hashtag','ugccommunity'), ('tiktok','hashtag','ugcportfolio'),
  ('tiktok','hashtag','ugcexample'), ('tiktok','hashtag','ugccontentcreator'), ('tiktok','hashtag','ugcjobs'),
  ('tiktok','hashtag','ugctips'), ('tiktok','hashtag','ugcbeginner'), ('tiktok','hashtag','ugcusa'),
  ('tiktok','search','ugc creator portfolio'), ('tiktok','search','day in the life ugc creator'), ('tiktok','search','ugc ad example'),
  ('instagram','hashtag','ugccreator'), ('instagram','hashtag','ugccommunity'), ('instagram','hashtag','ugcportfolio'),
  ('instagram','hashtag','ugccontentcreator'), ('instagram','hashtag','ugcusa'), ('instagram','hashtag','ugcexample');
insert into queries (platform, kind, value, origin) values
  ('tiktok','profile','andyjaael','seed'), ('tiktok','profile','vavrosaleks','seed'),
  ('tiktok','profile','janiceleelive','seed'), ('tiktok','profile','arieldoesugc','seed');
