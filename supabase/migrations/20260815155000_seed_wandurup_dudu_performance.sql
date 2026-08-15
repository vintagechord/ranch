-- Seed the Wandurup Dudu performance project without overwriting live operations.
insert into public.project_page_settings (
  project_slug,
  lifecycle,
  is_public,
  sort_order
)
values (
  'wandurup-dudu',
  'active',
  true,
  30
)
on conflict (project_slug) do nothing;

insert into public.release_role_types (
  code,
  label_ko,
  category,
  description,
  is_active,
  sort_order
)
values
  ('show_direction', '공연 연출', 'other', '무대의 장면 구성과 공연 흐름을 설계하고 연출합니다.', true, 130),
  ('music_director', '음악 감독', 'music', '셋리스트와 음악적 연결, 리허설 방향을 조율합니다.', true, 140),
  ('stage_management', '무대 감독', 'other', '리허설과 본 공연의 무대 전환 및 큐를 관리합니다.', true, 150),
  ('live_guitar', '기타', 'music', '공연에 기타 연주로 참여합니다.', true, 160),
  ('live_bass', '베이스', 'music', '공연에 베이스 연주로 참여합니다.', true, 170),
  ('live_drums', '드럼', 'music', '공연에 드럼 연주로 참여합니다.', true, 180),
  ('live_keyboard', '키보드', 'music', '공연에 키보드 연주로 참여합니다.', true, 190),
  ('live_percussion', '퍼커션', 'music', '공연에 퍼커션 연주로 참여합니다.', true, 200),
  ('foh_engineering', 'FOH 음향', 'music', '객석 음향의 밸런스와 현장 오퍼레이팅을 담당합니다.', true, 210),
  ('monitor_engineering', '모니터 음향', 'music', '출연자의 무대 모니터 환경과 사운드 체크를 담당합니다.', true, 220),
  ('lighting', '조명', 'visual', '공연 조명 디자인과 현장 오퍼레이팅을 담당합니다.', true, 230),
  ('vj_video', 'VJ / 영상', 'video', '공연 영상 콘텐츠와 현장 송출을 설계하고 운영합니다.', true, 240),
  ('photography', '사진', 'visual', '리허설과 공연 현장을 사진으로 기록합니다.', true, 250),
  ('promotion_social', '홍보 / SNS', 'editorial', '공연 홍보 콘텐츠와 소셜 채널 운영을 담당합니다.', true, 260),
  ('event_operations', '현장 운영', 'other', '입장, 관객 안내와 공연 당일 운영을 함께합니다.', true, 270)
on conflict (code) do nothing;

create table if not exists public.release_role_type_project_scopes (
  role_type_code text not null references public.release_role_types (code)
    on update cascade on delete cascade,
  project_slug text not null references public.project_page_settings (project_slug)
    on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_type_code, project_slug)
);

create index if not exists release_role_type_project_scopes_project_idx
  on public.release_role_type_project_scopes (project_slug, role_type_code);

alter table public.release_role_type_project_scopes enable row level security;

revoke all on table public.release_role_type_project_scopes
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.release_role_type_project_scopes
  to service_role;

insert into public.release_role_type_project_scopes (
  role_type_code,
  project_slug
)
select
  role_type.code,
  'wandurup-dudu'
from public.release_role_types as role_type
where role_type.code in (
  'show_direction',
  'music_director',
  'stage_management',
  'live_guitar',
  'live_bass',
  'live_drums',
  'live_keyboard',
  'live_percussion',
  'foh_engineering',
  'monitor_engineering',
  'lighting',
  'vj_video',
  'photography',
  'promotion_social',
  'event_operations'
)
on conflict (role_type_code, project_slug) do nothing;

create or replace function public.enforce_release_role_type_project_scope()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_project_slug text;
begin
  select release.project_slug
  into v_project_slug
  from public.music_releases as release
  where release.id = new.release_id;

  -- Let the release_roles foreign key report a missing parent consistently.
  if not found then
    return new;
  end if;

  if exists (
    select 1
    from public.release_role_type_project_scopes as scope
    where scope.role_type_code = new.role_type_code
  ) and not exists (
    select 1
    from public.release_role_type_project_scopes as scope
    where scope.role_type_code = new.role_type_code
      and scope.project_slug = v_project_slug
  ) then
    raise exception 'release role type is not available for project %', v_project_slug
      using errcode = '23514',
            constraint = 'release_roles_role_type_project_scope_check';
  end if;

  return new;
end;
$$;

drop trigger if exists release_roles_enforce_role_type_project_scope
  on public.release_roles;
create trigger release_roles_enforce_role_type_project_scope
before insert or update of release_id, role_type_code on public.release_roles
for each row execute function public.enforce_release_role_type_project_scope();

revoke all on function public.enforce_release_role_type_project_scope()
  from public, anon, authenticated;
grant execute on function public.enforce_release_role_type_project_scope()
  to service_role;

insert into public.music_releases (
  project_slug,
  release_number,
  title,
  artist_name,
  release_date,
  state,
  youtube_video_id,
  cover_image_url,
  summary,
  is_published
)
values (
  'wandurup-dudu',
  1,
  '완두룹두두',
  '스트레인지 팩토리 친구들',
  null,
  'upcoming',
  null,
  null,
  null,
  true
)
on conflict (project_slug, release_number) do nothing;

with desired_roles (
  role_type_code,
  capacity,
  brief,
  sort_order
) as (
  values
    ('planning'::text, 3::smallint, '공연의 구성과 일정, 실행 흐름을 함께 설계합니다.'::text, 10),
    ('show_direction'::text, 2::smallint, '무대의 장면 구성과 공연 흐름을 설계하고 연출합니다.'::text, 20),
    ('music_director'::text, 2::smallint, '셋리스트와 음악적 연결, 리허설 방향을 조율합니다.'::text, 30),
    ('stage_management'::text, 3::smallint, '리허설과 본 공연의 무대 전환 및 큐를 관리합니다.'::text, 40),
    ('vocal'::text, 6::smallint, '공연에 보컬로 참여합니다.'::text, 50),
    ('live_guitar'::text, 3::smallint, '공연에 기타 연주로 참여합니다.'::text, 60),
    ('live_bass'::text, 2::smallint, '공연에 베이스 연주로 참여합니다.'::text, 70),
    ('live_drums'::text, 2::smallint, '공연에 드럼 연주로 참여합니다.'::text, 80),
    ('live_keyboard'::text, 3::smallint, '공연에 키보드 연주로 참여합니다.'::text, 90),
    ('live_percussion'::text, 3::smallint, '공연에 퍼커션 연주로 참여합니다.'::text, 100),
    ('foh_engineering'::text, 2::smallint, '객석 음향의 밸런스와 현장 오퍼레이팅을 담당합니다.'::text, 110),
    ('monitor_engineering'::text, 2::smallint, '출연자의 무대 모니터 환경과 사운드 체크를 담당합니다.'::text, 120),
    ('lighting'::text, 3::smallint, '공연 조명 디자인과 현장 오퍼레이팅을 담당합니다.'::text, 130),
    ('vj_video'::text, 2::smallint, '공연 영상 콘텐츠와 현장 송출을 설계하고 운영합니다.'::text, 140),
    ('photography'::text, 4::smallint, '리허설과 공연 현장을 사진으로 기록합니다.'::text, 150),
    ('artwork'::text, 3::smallint, '포스터와 공연의 핵심 비주얼을 제작합니다.'::text, 160),
    ('promotion_social'::text, 4::smallint, '공연 홍보 콘텐츠와 소셜 채널 운영을 담당합니다.'::text, 170),
    ('event_operations'::text, 10::smallint, '입장, 관객 안내와 공연 당일 운영을 함께합니다.'::text, 180)
)
insert into public.release_roles (
  release_id,
  role_type_code,
  state,
  is_public,
  brief,
  requirements,
  capacity,
  application_deadline,
  sort_order
)
select
  release.id,
  desired_role.role_type_code,
  case
    when settings.lifecycle = 'active'
      and settings.is_public
      and release.state = 'upcoming'
      and release.is_published
      and role_type.is_active then 'open'
    else 'closed'
  end,
  true,
  desired_role.brief,
  null,
  desired_role.capacity,
  null,
  desired_role.sort_order
from public.music_releases as release
join public.project_page_settings as settings
  on settings.project_slug = release.project_slug
cross join desired_roles as desired_role
join public.release_role_types as role_type
  on role_type.code = desired_role.role_type_code
where release.project_slug = 'wandurup-dudu'
  and release.release_number = 1
on conflict (release_id, role_type_code) do nothing;

notify pgrst, 'reload schema';
