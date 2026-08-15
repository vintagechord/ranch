-- Store administrator-managed release artwork separately from external thumbnails.
alter table public.music_releases
  add column if not exists cover_image_path text;

alter table public.music_releases
  drop constraint if exists music_releases_cover_image_path_check;

alter table public.music_releases
  add constraint music_releases_cover_image_path_check check (
    cover_image_path is null
    or (
      char_length(cover_image_path) <= 160
      and cover_image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
    )
  );

create unique index if not exists music_releases_cover_image_path_key
  on public.music_releases (cover_image_path)
  where cover_image_path is not null;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'release-covers',
  'release-covers',
  true,
  3145728,
  array['image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
