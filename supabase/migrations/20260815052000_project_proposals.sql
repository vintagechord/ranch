create table if not exists public.project_proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contact_name text not null check (char_length(btrim(contact_name)) between 1 and 80),
  phone text check (phone is null or char_length(btrim(phone)) between 7 and 40),
  email text not null check (char_length(btrim(email)) between 3 and 254),
  artist_name text not null check (char_length(btrim(artist_name)) between 1 and 100),
  project_title text not null check (char_length(btrim(project_title)) between 1 and 140),
  project_type text not null check (
    project_type in ('싱글', 'EP / 앨범', '라이브 / 공연', '영상 / 콘텐츠', '기타')
  ),
  current_stage text not null check (
    current_stage in ('아이디어 / 기획', '데모 제작', '녹음 / 제작', '믹싱 / 마스터링', '발매 준비')
  ),
  support_needed text[] not null check (
    cardinality(support_needed) between 1 and 6
    and support_needed <@ array[
      '기획',
      '프로듀싱 / 편곡',
      '레코딩',
      '믹싱 / 마스터링',
      '콘텐츠 제작',
      '발매 / 유통'
    ]::text[]
  ),
  desired_schedule text check (
    desired_schedule is null or char_length(btrim(desired_schedule)) between 1 and 120
  ),
  budget_range text check (
    budget_range is null
    or budget_range in ('협의 필요', '100만원 미만', '100–300만원', '300–500만원', '500만원 이상')
  ),
  reference_url text check (
    reference_url is null
    or (char_length(reference_url) <= 1000 and reference_url ~ '^https://')
  ),
  details text not null check (char_length(btrim(details)) between 20 and 3000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'contacted', 'closed')),
  privacy_agreed boolean not null check (privacy_agreed),
  consented_at timestamptz not null default now(),
  privacy_notice_version text not null,
  idempotency_key uuid not null unique,
  request_fingerprint text not null check (char_length(request_fingerprint) = 64)
);

create index if not exists project_proposals_status_created_at_idx
  on public.project_proposals (status, created_at desc);

create index if not exists project_proposals_request_fingerprint_created_at_idx
  on public.project_proposals (request_fingerprint, created_at desc);

alter table public.project_proposals enable row level security;

revoke all on table public.project_proposals from anon, authenticated;
grant select, insert, update, delete on table public.project_proposals to service_role;
