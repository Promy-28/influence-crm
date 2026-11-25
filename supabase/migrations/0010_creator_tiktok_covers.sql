-- Private snapshots of publicly available cover images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creator-tiktok-covers','creator-tiktok-covers',false,262144,array['image/jpeg','image/webp','image/png'])
on conflict (id) do nothing;
