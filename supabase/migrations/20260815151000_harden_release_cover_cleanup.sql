-- Bind managed artwork paths to their release and retain failed Storage deletions for retry.
alter table public.music_releases
  drop constraint if exists music_releases_cover_image_path_check;

alter table public.music_releases
  add constraint music_releases_cover_image_path_check check (
    cover_image_path is null
    or (
      char_length(cover_image_path) <= 160
      and cover_image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
      and split_part(cover_image_path, '/', 1) = id::text
    )
  );

create table if not exists public.release_cover_cleanup_queue (
  path text primary key,
  attempt_count smallint not null default 0 check (attempt_count between 0 and 20),
  last_error text check (
    last_error is null or char_length(btrim(last_error)) between 1 and 500
  ),
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint release_cover_cleanup_queue_path_check check (
    char_length(path) <= 160
    and path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
  )
);

create index if not exists release_cover_cleanup_queue_ready_idx
  on public.release_cover_cleanup_queue (next_attempt_at, created_at);

drop trigger if exists release_cover_cleanup_queue_touch_updated_at
  on public.release_cover_cleanup_queue;
create trigger release_cover_cleanup_queue_touch_updated_at
before update on public.release_cover_cleanup_queue
for each row execute function public.touch_release_lead_updated_at();

alter table public.release_cover_cleanup_queue enable row level security;

revoke all on table public.release_cover_cleanup_queue
  from public, anon, authenticated;
grant select, insert, update, delete on table public.release_cover_cleanup_queue
  to service_role;

notify pgrst, 'reload schema';
