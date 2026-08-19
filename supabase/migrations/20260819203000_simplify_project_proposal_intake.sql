-- Preserve legacy values until their retention window expires, while stopping new collection.
alter table public.project_proposals
  alter column email drop not null,
  alter column artist_name drop not null;

alter table public.project_proposals
  drop constraint if exists project_proposals_project_type_check;

alter table public.project_proposals
  add constraint project_proposals_project_type_check
  check (
    project_type in (
      '싱글',
      'EP / 앨범',
      '컴필레이션 / 협업 음원',
      '리믹스 / 리이슈',
      '라이브 / 공연',
      '파티 / 페스티벌',
      '영상 / 콘텐츠',
      '방송 / 팟캐스트',
      '전시 / 팝업',
      '브랜드 / 캠페인',
      '워크숍 / 커뮤니티',
      '기타'
    )
  );

alter table public.project_proposals
  drop constraint if exists project_proposals_v2_contact_check;

alter table public.project_proposals
  add constraint project_proposals_v2_contact_check
  check (
    privacy_notice_version <> '2026-08-19-v2'
    or phone is not null
  );

notify pgrst, 'reload schema';
