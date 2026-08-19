-- Materialize the admin-created fourth PPP release for reproducible fresh environments.
insert into public.music_releases (
  project_slug,
  release_number,
  title,
  artist_name,
  release_date,
  state,
  summary,
  is_published
)
values (
  'vintagechord-post-production',
  4,
  '제목 미정',
  '빈티지코드',
  date '2026-10-30',
  'upcoming',
  'Jinbo의 비트와 2명의 래퍼와 같이 제작한 음원으로 10월 오피셜 발매 예정인 음원입니다. 아트워크와 앨범 소개글 참여를 원한다면 참여신청을 해주세요.',
  true
)
on conflict (project_slug, release_number) do nothing;

insert into public.release_roles (
  release_id,
  role_type_code,
  state,
  is_public,
  brief,
  capacity,
  application_deadline,
  sort_order
)
select
  release.id,
  seeded_role.role_type_code,
  'open',
  true,
  seeded_role.brief,
  1,
  timestamptz '2026-10-02 00:00:00+09',
  seeded_role.sort_order
from public.music_releases as release
cross join (
  values
    ('artwork'::text, '앨범 아트워크 작업'::text, 10),
    ('liner_notes'::text, '앨범 소개글 작성'::text, 20)
) as seeded_role(role_type_code, brief, sort_order)
where release.project_slug = 'vintagechord-post-production'
  and release.release_number = 4
on conflict (release_id, role_type_code) do nothing;

-- release_date is the official release date, while application_deadline is an exclusive cutoff.
update public.music_releases
set release_date = date '2026-08-06'
where project_slug = 'vintagechord-post-production'
  and release_number = 1;

update public.release_roles as role
set application_deadline = case release.release_number
  when 2 then timestamptz '2026-07-18 00:00:00+09'
  when 3 then timestamptz '2026-07-18 00:00:00+09'
  when 4 then timestamptz '2026-10-02 00:00:00+09'
end
from public.music_releases as release
where role.release_id = release.id
  and release.project_slug = 'vintagechord-post-production'
  and release.release_number in (2, 3, 4);

update public.music_releases
set summary = 'Jinbo의 비트와 2명의 래퍼와 같이 제작한 음원으로 10월 오피셜 발매 예정인 음원입니다. 아트워크와 앨범 소개글 참여를 원한다면 참여신청을 해주세요.'
where project_slug = 'vintagechord-post-production'
  and release_number = 4
  and summary in (
    'Prod.Jinbo',
    'Jinbo의 비트와 2명의 래퍼와 같이 제작한 음원으로 10월 오피셜 발매 예정인 음원입니다. 아트워크와 앨범 소개글 참여를 원한다면 함께해요.'
  );
