create table if not exists public.creator_tiktok_posts (
 creator_id text primary key references public.reddit_creator_directory(id) on delete cascade,
 fingerprint text not null,
 posts jsonb not null
);
alter table public.creator_tiktok_posts enable row level security;
