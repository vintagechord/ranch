create extension if not exists "pgcrypto";
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists party_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  people_count integer not null default 1,
  depositor_name text not null,
  companions text,
  auction_item text,
  advance_team boolean not null default false,
  creative_project text,
  food_note text,
  memo text,
  privacy_agreed boolean not null default false,
  payment_status text not null default '미확인',
  application_status text not null default '대기'
);

alter table party_applications enable row level security;

alter table party_applications
  add column if not exists auction_item text;

alter table party_applications
  add column if not exists creative_project text;

alter table party_applications
  add column if not exists advance_team boolean not null default false;

create table if not exists public.piggy_bank (
  id integer primary key default 1 check (id = 1),
  created_at timestamptz not null default now(),
  balance_amount integer not null default 0 check (balance_amount >= 0),
  updated_at timestamptz not null default now()
);

insert into public.piggy_bank (id, balance_amount)
values (1, 0)
on conflict (id) do nothing;

alter table public.piggy_bank enable row level security;

create table if not exists public.open_chat_settings (
  id integer primary key default 1 check (id = 1),
  created_at timestamptz not null default now(),
  chat_url text,
  updated_at timestamptz not null default now()
);

insert into public.open_chat_settings (id, chat_url)
values (1, null)
on conflict (id) do nothing;

alter table public.open_chat_settings enable row level security;

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
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  retention_until timestamptz not null default (now() + interval '1 year'),
  constraint project_proposals_retention_window_check check (
    retention_until > consented_at
    and retention_until <= consented_at + interval '1 year'
  )
);

create index if not exists project_proposals_status_created_at_idx
  on public.project_proposals (status, created_at desc);

create index if not exists project_proposals_retention_until_idx
  on public.project_proposals (retention_until);

alter table public.project_proposals enable row level security;

revoke all on table public.project_proposals from anon, authenticated;
grant select, insert, update, delete on table public.project_proposals to service_role;

create table if not exists public.request_rate_limits (
  scope text not null check (char_length(scope) between 1 and 64),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count > 0),
  expires_at timestamptz not null,
  primary key (scope, request_fingerprint)
);

create index if not exists request_rate_limits_expires_at_idx
  on public.request_rate_limits (expires_at);

alter table public.request_rate_limits enable row level security;

revoke all on table public.request_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.request_rate_limits to service_role;

create or replace function public.consume_request_rate_limit(
  p_scope text,
  p_request_fingerprint text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_attempt_count integer;
begin
  if char_length(p_scope) not between 1 and 64
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_max_attempts not between 1 and 100
    or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;

  insert into public.request_rate_limits as limits (
    scope,
    request_fingerprint,
    window_started_at,
    attempt_count,
    expires_at
  )
  values (
    p_scope,
    p_request_fingerprint,
    now(),
    1,
    now() + make_interval(secs => p_window_seconds)
  )
  on conflict (scope, request_fingerprint) do update
  set window_started_at = case
        when limits.expires_at <= now() then now()
        else limits.window_started_at
      end,
      attempt_count = case
        when limits.expires_at <= now() then 1
        else least(limits.attempt_count + 1, p_max_attempts + 1)
      end,
      expires_at = case
        when limits.expires_at <= now() then now() + make_interval(secs => p_window_seconds)
        else limits.expires_at
      end
  returning attempt_count into v_attempt_count;

  return v_attempt_count <= p_max_attempts;
end;
$$;

create or replace function public.clear_request_rate_limit(
  p_scope text,
  p_request_fingerprint text
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  delete from public.request_rate_limits
  where scope = p_scope
    and request_fingerprint = p_request_fingerprint;
$$;

create or replace function public.submit_project_proposal(
  p_contact_name text,
  p_phone text,
  p_email text,
  p_artist_name text,
  p_project_title text,
  p_project_type text,
  p_current_stage text,
  p_support_needed text[],
  p_desired_schedule text,
  p_budget_range text,
  p_reference_url text,
  p_details text,
  p_privacy_notice_version text,
  p_idempotency_key uuid,
  p_payload_hash text,
  p_request_fingerprint text
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing_payload_hash text;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid proposal hashes' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('project-proposal:' || p_idempotency_key::text, 0)
  );

  delete from public.project_proposals
  where retention_until <= now();

  select proposal.payload_hash
  into v_existing_payload_hash
  from public.project_proposals as proposal
  where proposal.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_payload_hash = p_payload_hash then
      return 'duplicate';
    end if;

    return 'conflict';
  end if;

  if not public.consume_request_rate_limit(
    'project-proposal',
    p_request_fingerprint,
    3,
    900
  ) then
    return 'rate_limited';
  end if;

  insert into public.project_proposals (
    contact_name,
    phone,
    email,
    artist_name,
    project_title,
    project_type,
    current_stage,
    support_needed,
    desired_schedule,
    budget_range,
    reference_url,
    details,
    privacy_agreed,
    privacy_notice_version,
    idempotency_key,
    payload_hash
  )
  values (
    p_contact_name,
    p_phone,
    p_email,
    p_artist_name,
    p_project_title,
    p_project_type,
    p_current_stage,
    p_support_needed,
    p_desired_schedule,
    p_budget_range,
    p_reference_url,
    p_details,
    true,
    p_privacy_notice_version,
    p_idempotency_key,
    p_payload_hash
  );

  return 'inserted';
end;
$$;

create or replace function public.purge_expired_project_proposals()
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_deleted_count bigint;
begin
  delete from public.project_proposals
  where retention_until <= now();

  get diagnostics v_deleted_count = row_count;

  delete from public.request_rate_limits
  where expires_at <= now();

  return v_deleted_count;
end;
$$;

revoke all on function public.consume_request_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.clear_request_rate_limit(text, text)
  from public, anon, authenticated;
revoke all on function public.submit_project_proposal(
  text, text, text, text, text, text, text, text[], text, text, text, text, text, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.purge_expired_project_proposals()
  from public, anon, authenticated;

grant execute on function public.consume_request_rate_limit(text, text, integer, integer)
  to service_role;
grant execute on function public.clear_request_rate_limit(text, text)
  to service_role;
grant execute on function public.submit_project_proposal(
  text, text, text, text, text, text, text, text[], text, text, text, text, text, uuid, text, text
) to service_role;
grant execute on function public.purge_expired_project_proposals()
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    for v_job_id in
      select jobid
      from cron.job
      where jobname = 'purge-project-proposals-every-15-minutes'
    loop
      perform cron.unschedule(v_job_id);
    end loop;

    perform cron.schedule(
      'purge-project-proposals-every-15-minutes',
      '*/15 * * * *',
      'select public.purge_expired_project_proposals()'
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';

create table if not exists public.release_role_types (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  label_ko text not null check (char_length(btrim(label_ko)) between 1 and 80),
  category text not null check (category in ('visual', 'editorial', 'video', 'music', 'other')),
  description text check (
    description is null or char_length(btrim(description)) between 1 and 500
  ),
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.music_releases (
  id uuid primary key default gen_random_uuid(),
  project_slug text not null check (
    project_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(project_slug) <= 120
  ),
  release_number smallint not null check (release_number between 1 and 999),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  artist_name text not null check (char_length(btrim(artist_name)) between 1 and 200),
  release_date date,
  state text not null default 'draft' check (
    state in ('draft', 'upcoming', 'released', 'archived')
  ),
  youtube_video_id text check (
    youtube_video_id is null or youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
  ),
  cover_image_url text check (
    cover_image_url is null
    or (char_length(cover_image_url) <= 1000 and cover_image_url ~ '^https://')
  ),
  summary text check (summary is null or char_length(btrim(summary)) between 1 and 1000),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_slug, release_number)
);

create table if not exists public.release_roles (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.music_releases(id) on delete cascade,
  role_type_code text not null references public.release_role_types(code)
    on update cascade on delete restrict,
  state text not null default 'closed' check (
    state in ('open', 'paused', 'filled', 'closed')
  ),
  is_public boolean not null default true,
  brief text check (brief is null or char_length(btrim(brief)) between 1 and 1000),
  requirements text check (
    requirements is null or char_length(btrim(requirements)) between 1 and 2000
  ),
  capacity smallint not null default 1 check (capacity between 1 and 100),
  application_deadline timestamptz,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (release_id, role_type_code)
);

create table if not exists public.release_participation_applications (
  id uuid primary key default gen_random_uuid(),
  release_role_id uuid not null references public.release_roles(id) on delete restrict,
  applicant_name text not null check (
    char_length(btrim(applicant_name)) between 1 and 80
  ),
  credit_name text not null check (char_length(btrim(credit_name)) between 1 and 80),
  email text not null check (char_length(btrim(email)) between 3 and 254),
  phone text check (phone is null or char_length(btrim(phone)) between 7 and 40),
  profile_url text check (
    profile_url is null
    or (char_length(profile_url) <= 1000 and profile_url ~ '^https://')
  ),
  portfolio_url text check (
    portfolio_url is null
    or (char_length(portfolio_url) <= 1000 and portfolio_url ~ '^https://')
  ),
  availability text not null check (
    char_length(btrim(availability)) between 1 and 500
  ),
  message text not null check (char_length(btrim(message)) between 10 and 3000),
  status text not null default 'new' check (
    status in ('new', 'reviewing', 'contacted', 'shortlisted', 'accepted', 'declined', 'withdrawn')
  ),
  admin_note text check (
    admin_note is null or char_length(btrim(admin_note)) between 1 and 4000
  ),
  status_changed_at timestamptz not null default now(),
  privacy_agreed boolean not null check (privacy_agreed),
  consented_at timestamptz not null default now(),
  privacy_notice_version text not null check (
    char_length(btrim(privacy_notice_version)) between 1 and 80
  ),
  credit_publication_agreed boolean not null check (credit_publication_agreed),
  credit_publication_consented_at timestamptz not null default now(),
  credit_publication_notice_version text not null check (
    char_length(btrim(credit_publication_notice_version)) between 1 and 80
  ),
  idempotency_key uuid not null unique,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  retention_until timestamptz not null default (now() + interval '1 year'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint release_participation_applications_retention_window_check check (
    retention_until > consented_at
    and retention_until <= consented_at + interval '1 year'
  )
);

create table if not exists public.release_credits (
  id uuid primary key default gen_random_uuid(),
  release_role_id uuid not null references public.release_roles(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  is_ranch_member boolean not null default false,
  participant_slot smallint check (participant_slot is null or participant_slot between 1 and 16),
  source_application_id uuid unique references public.release_participation_applications(id)
    on delete set null,
  publication_basis text not null default 'direct_assignment' check (
    publication_basis in ('direct_assignment', 'applicant_consent')
  ),
  publication_agreed boolean,
  publication_consented_at timestamptz,
  publication_notice_version text check (
    publication_notice_version is null
    or char_length(btrim(publication_notice_version)) between 1 and 80
  ),
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint release_credits_member_slot_consistency_check check (
    participant_slot is null or is_ranch_member
  ),
  constraint release_credits_publication_proof_check check (
    (
      publication_basis = 'direct_assignment'
      and publication_agreed is null
      and publication_consented_at is null
      and publication_notice_version is null
    )
    or (
      publication_basis = 'applicant_consent'
      and publication_agreed is true
      and publication_consented_at is not null
      and publication_notice_version is not null
    )
  )
);

create table if not exists public.release_application_status_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.release_participation_applications(id)
    on delete cascade,
  from_status text check (
    from_status is null
    or from_status in ('new', 'reviewing', 'contacted', 'shortlisted', 'accepted', 'declined', 'withdrawn')
  ),
  to_status text not null check (
    to_status in ('new', 'reviewing', 'contacted', 'shortlisted', 'accepted', 'declined', 'withdrawn')
  ),
  note text check (note is null or char_length(btrim(note)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists music_releases_public_project_idx
  on public.music_releases (project_slug, is_published, release_number);

create index if not exists release_roles_release_public_state_idx
  on public.release_roles (release_id, is_public, state, sort_order);

create index if not exists release_credits_role_sort_idx
  on public.release_credits (release_role_id, sort_order, created_at);

create index if not exists release_participation_applications_status_created_idx
  on public.release_participation_applications (status, created_at desc);

create index if not exists release_participation_applications_role_status_created_idx
  on public.release_participation_applications (release_role_id, status, created_at desc);

create index if not exists release_participation_applications_retention_idx
  on public.release_participation_applications (retention_until);

create index if not exists release_application_status_events_application_created_idx
  on public.release_application_status_events (application_id, created_at, id);

create or replace function public.touch_release_lead_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists release_role_types_touch_updated_at on public.release_role_types;
create trigger release_role_types_touch_updated_at
before update on public.release_role_types
for each row execute function public.touch_release_lead_updated_at();

drop trigger if exists music_releases_touch_updated_at on public.music_releases;
create trigger music_releases_touch_updated_at
before update on public.music_releases
for each row execute function public.touch_release_lead_updated_at();

drop trigger if exists release_roles_touch_updated_at on public.release_roles;
create trigger release_roles_touch_updated_at
before update on public.release_roles
for each row execute function public.touch_release_lead_updated_at();

drop trigger if exists release_credits_touch_updated_at on public.release_credits;
create trigger release_credits_touch_updated_at
before update on public.release_credits
for each row execute function public.touch_release_lead_updated_at();

drop trigger if exists release_participation_applications_touch_updated_at
  on public.release_participation_applications;
create trigger release_participation_applications_touch_updated_at
before update on public.release_participation_applications
for each row execute function public.touch_release_lead_updated_at();

insert into public.release_role_types (
  code,
  label_ko,
  category,
  description,
  sort_order
)
values
  ('artwork', '아트워크', 'visual', '커버와 발매 비주얼 작업', 10),
  ('liner_notes', 'Liner Notes', 'editorial', '음원과 참여자를 소개하는 글 작업', 20),
  ('music_video', '뮤직비디오', 'video', '뮤직비디오 기획과 제작', 30),
  ('composition', '작곡', 'music', '멜로디와 곡 구조 작업', 40),
  ('lyrics', '작사', 'music', '가사 작업', 50),
  ('arrangement', '편곡', 'music', '악기 구성과 사운드 편곡', 60),
  ('vocal', '가창', 'music', '보컬 퍼포먼스와 녹음', 70)
on conflict (code) do nothing;

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
values
  (
    'vintagechord-post-production',
    1,
    'huh',
    '개미친구 (gamichingoo), ELYU, VAN KIDEN',
    null,
    'released',
    'rW3Nln-nYQ8',
    'https://i.ytimg.com/vi/rW3Nln-nYQ8/hqdefault.jpg',
    'Prod. Mild Beats',
    true
  ),
  (
    'vintagechord-post-production',
    2,
    'RELEASE 02',
    '빈티지코드',
    date '2026-08-20',
    'upcoming',
    null,
    null,
    null,
    true
  ),
  (
    'vintagechord-post-production',
    3,
    'RELEASE 03',
    '빈티지코드',
    date '2026-09-30',
    'upcoming',
    null,
    null,
    null,
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
  sort_order
)
select
  release.id,
  seeded_role.role_type_code,
  seeded_role.state,
  true,
  seeded_role.brief,
  1,
  seeded_role.sort_order
from public.music_releases as release
cross join (
  values
    ('artwork'::text, 'filled'::text, null::text, 10),
    ('liner_notes'::text, 'filled'::text, null::text, 20),
    ('music_video'::text, 'open'::text, '뮤직비디오 제작에 함께할 참여자를 찾습니다.'::text, 30)
) as seeded_role(role_type_code, state, brief, sort_order)
where release.project_slug = 'vintagechord-post-production'
  and release.release_number in (2, 3)
on conflict (release_id, role_type_code) do nothing;

insert into public.release_credits (
  release_role_id,
  display_name,
  is_ranch_member,
  sort_order
)
select
  role.id,
  seeded_credit.display_name,
  true,
  10
from (
  values
    (2::smallint, 'artwork'::text, 'SunizShine'::text),
    (2::smallint, 'liner_notes'::text, 'Jiwon'::text),
    (3::smallint, 'artwork'::text, 'Sosohan9'::text),
    (3::smallint, 'liner_notes'::text, 'SunizShine'::text)
) as seeded_credit(release_number, role_type_code, display_name)
join public.music_releases as release
  on release.project_slug = 'vintagechord-post-production'
  and release.release_number = seeded_credit.release_number
join public.release_roles as role
  on role.release_id = release.id
  and role.role_type_code = seeded_credit.role_type_code
where not exists (
  select 1
  from public.release_credits as existing_credit
  where existing_credit.release_role_id = role.id
    and lower(btrim(existing_credit.display_name)) = lower(btrim(seeded_credit.display_name))
);

alter table public.release_role_types enable row level security;
alter table public.music_releases enable row level security;
alter table public.release_roles enable row level security;
alter table public.release_credits enable row level security;
alter table public.release_participation_applications enable row level security;
alter table public.release_application_status_events enable row level security;

revoke all on table public.release_role_types from public, anon, authenticated;
revoke all on table public.music_releases from public, anon, authenticated;
revoke all on table public.release_roles from public, anon, authenticated;
revoke all on table public.release_credits from public, anon, authenticated;
revoke all on table public.release_participation_applications from public, anon, authenticated;
revoke all on table public.release_application_status_events from public, anon, authenticated;
revoke all on sequence public.release_application_status_events_id_seq
  from public, anon, authenticated;

grant select, insert, update, delete on table public.release_role_types to service_role;
grant select, insert, update, delete on table public.music_releases to service_role;
grant select, insert, update, delete on table public.release_roles to service_role;
grant select, insert, update, delete on table public.release_credits to service_role;
grant select, insert, update, delete
  on table public.release_participation_applications to service_role;
grant select, insert, update, delete
  on table public.release_application_status_events to service_role;
grant usage, select on sequence public.release_application_status_events_id_seq to service_role;

create or replace function public.submit_release_participation_application(
  p_release_role_id uuid,
  p_applicant_name text,
  p_credit_name text,
  p_email text,
  p_phone text,
  p_profile_url text,
  p_portfolio_url text,
  p_availability text,
  p_message text,
  p_privacy_notice_version text,
  p_credit_publication_notice_version text,
  p_idempotency_key uuid,
  p_payload_hash text,
  p_request_fingerprint text,
  p_email_fingerprint text
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing_payload_hash text;
  v_application_id uuid;
  v_role public.release_roles%rowtype;
  v_credit_count bigint;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_email_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid release application hashes' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('release-participation:' || p_idempotency_key::text, 0)
  );

  delete from public.release_participation_applications
  where retention_until <= now();

  select application.payload_hash
  into v_existing_payload_hash
  from public.release_participation_applications as application
  where application.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_payload_hash = p_payload_hash then
      return 'duplicate';
    end if;

    return 'conflict';
  end if;

  if not public.consume_request_rate_limit(
    'release-participation',
    p_request_fingerprint,
    3,
    900
  ) then
    return 'rate_limited';
  end if;

  select role.*
  into v_role
  from public.release_roles as role
  join public.music_releases as release on release.id = role.release_id
  join public.release_role_types as role_type on role_type.code = role.role_type_code
  where role.id = p_release_role_id
    and role.state = 'open'
    and role.is_public
    and (role.application_deadline is null or role.application_deadline > now())
    and release.is_published
    and release.state in ('upcoming', 'released')
    and role_type.is_active
  for update of role;

  if not found then
    return 'unavailable';
  end if;

  select count(*)
  into v_credit_count
  from public.release_credits as credit
  where credit.release_role_id = p_release_role_id;

  if v_credit_count >= v_role.capacity then
    return 'unavailable';
  end if;

  if not public.consume_request_rate_limit(
    'release-participation-email:' || p_release_role_id::text,
    p_email_fingerprint,
    2,
    86400
  ) then
    return 'email_rate_limited';
  end if;

  insert into public.release_participation_applications (
    release_role_id,
    applicant_name,
    credit_name,
    email,
    phone,
    profile_url,
    portfolio_url,
    availability,
    message,
    privacy_agreed,
    privacy_notice_version,
    credit_publication_agreed,
    credit_publication_consented_at,
    credit_publication_notice_version,
    idempotency_key,
    payload_hash
  )
  values (
    p_release_role_id,
    p_applicant_name,
    p_credit_name,
    p_email,
    p_phone,
    p_profile_url,
    p_portfolio_url,
    p_availability,
    p_message,
    true,
    p_privacy_notice_version,
    true,
    now(),
    p_credit_publication_notice_version,
    p_idempotency_key,
    p_payload_hash
  )
  returning id into v_application_id;

  insert into public.release_application_status_events (
    application_id,
    from_status,
    to_status
  )
  values (v_application_id, null, 'new');

  return 'inserted';
end;
$$;

create or replace function public.set_release_role_state(
  p_role_id uuid,
  p_state text
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_role public.release_roles%rowtype;
  v_credit_count bigint;
begin
  if p_state not in ('open', 'paused', 'closed') then
    return 'invalid_state';
  end if;

  select role.*
  into v_role
  from public.release_roles as role
  where role.id = p_role_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if p_state = 'open' then
    select count(*)
    into v_credit_count
    from public.release_credits as credit
    where credit.release_role_id = p_role_id;

    if v_credit_count >= v_role.capacity then
      return 'capacity_reached';
    end if;
  end if;

  update public.release_roles
  set state = p_state
  where id = p_role_id;

  return 'updated';
end;
$$;

create or replace function public.review_release_participation_application(
  p_application_id uuid,
  p_status text,
  p_admin_note text default null,
  p_credit_display_name text default null,
  p_credit_is_ranch_member boolean default false,
  p_credit_participant_slot smallint default null
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_application public.release_participation_applications%rowtype;
  v_role public.release_roles%rowtype;
  v_credit_display_name text;
  v_credit_is_ranch_member boolean;
  v_other_credit_count bigint;
begin
  if p_status not in (
    'new',
    'reviewing',
    'contacted',
    'shortlisted',
    'accepted',
    'declined',
    'withdrawn'
  ) then
    return 'invalid_status';
  end if;

  select application.*
  into v_application
  from public.release_participation_applications as application
  where application.id = p_application_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_application.retention_until <= now() then
    delete from public.release_participation_applications
    where id = p_application_id;
    return 'expired';
  end if;

  if p_admin_note is not null and char_length(btrim(p_admin_note)) > 4000 then
    return 'invalid_status';
  end if;

  if p_status = 'accepted' then
    select role.*
    into v_role
    from public.release_roles as role
    where role.id = v_application.release_role_id
    for update;

    if not found then
      return 'not_found';
    end if;

    v_credit_display_name := coalesce(
      nullif(btrim(p_credit_display_name), ''),
      v_application.credit_name
    );
    v_credit_is_ranch_member := p_credit_is_ranch_member
      or p_credit_participant_slot is not null;

    if char_length(v_credit_display_name) not between 1 and 80
      or (
        p_credit_participant_slot is not null
        and p_credit_participant_slot not between 1 and 16
    ) then
      return 'invalid_status';
    end if;

    select count(*)
    into v_other_credit_count
    from public.release_credits as credit
    where credit.release_role_id = v_application.release_role_id
      and credit.source_application_id is distinct from p_application_id;

    if v_other_credit_count >= v_role.capacity then
      return 'capacity_reached';
    end if;
  elsif v_application.status = 'accepted' then
    select role.*
    into v_role
    from public.release_roles as role
    where role.id = v_application.release_role_id
    for update;

    if not found then
      return 'not_found';
    end if;
  end if;

  update public.release_participation_applications
  set status = p_status,
      admin_note = case
        when p_admin_note is null then admin_note
        else nullif(btrim(p_admin_note), '')
      end,
      status_changed_at = case
        when status is distinct from p_status then now()
        else status_changed_at
      end
  where id = p_application_id;

  if v_application.status is distinct from p_status or p_admin_note is not null then
    insert into public.release_application_status_events (
      application_id,
      from_status,
      to_status,
      note
    )
    values (
      p_application_id,
      v_application.status,
      p_status,
      nullif(btrim(p_admin_note), '')
    );
  end if;

  if p_status = 'accepted' then
    insert into public.release_credits (
      release_role_id,
      display_name,
      is_ranch_member,
      participant_slot,
      source_application_id,
      publication_basis,
      publication_agreed,
      publication_consented_at,
      publication_notice_version,
      sort_order
    )
    values (
      v_application.release_role_id,
      v_credit_display_name,
      v_credit_is_ranch_member,
      p_credit_participant_slot,
      p_application_id,
      'applicant_consent',
      v_application.credit_publication_agreed,
      v_application.credit_publication_consented_at,
      v_application.credit_publication_notice_version,
      100
    )
    on conflict (source_application_id) do update
    set display_name = excluded.display_name,
        is_ranch_member = excluded.is_ranch_member,
        participant_slot = excluded.participant_slot,
        publication_basis = excluded.publication_basis,
        publication_agreed = excluded.publication_agreed,
        publication_consented_at = excluded.publication_consented_at,
        publication_notice_version = excluded.publication_notice_version;

    update public.release_roles
    set state = case
          when v_other_credit_count + 1 >= capacity then 'filled'
          else state
        end
    where id = v_application.release_role_id;
  elsif v_application.status = 'accepted' then
    delete from public.release_credits
    where source_application_id = p_application_id;

    select count(*)
    into v_other_credit_count
    from public.release_credits as credit
    where credit.release_role_id = v_application.release_role_id;

    update public.release_roles
    set state = case
          when v_other_credit_count >= capacity then 'filled'
          else 'paused'
        end
    where id = v_application.release_role_id;
  end if;

  return 'updated';
end;
$$;

create or replace function public.purge_expired_release_participation_applications()
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_deleted_count bigint;
begin
  delete from public.release_participation_applications
  where retention_until <= now();

  get diagnostics v_deleted_count = row_count;

  delete from public.request_rate_limits
  where expires_at <= now();

  return v_deleted_count;
end;
$$;

revoke all on function public.touch_release_lead_updated_at()
  from public, anon, authenticated;
revoke all on function public.submit_release_participation_application(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text
) from public, anon, authenticated;
revoke all on function public.set_release_role_state(uuid, text)
  from public, anon, authenticated;
revoke all on function public.review_release_participation_application(
  uuid, text, text, text, boolean, smallint
) from public, anon, authenticated;
revoke all on function public.purge_expired_release_participation_applications()
  from public, anon, authenticated;

grant execute on function public.touch_release_lead_updated_at()
  to service_role;
grant execute on function public.submit_release_participation_application(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text
) to service_role;
grant execute on function public.set_release_role_state(uuid, text)
  to service_role;
grant execute on function public.review_release_participation_application(
  uuid, text, text, text, boolean, smallint
) to service_role;
grant execute on function public.purge_expired_release_participation_applications()
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    for v_job_id in
      select jobid
      from cron.job
      where jobname = 'purge-release-participation-every-15-minutes'
    loop
      perform cron.unschedule(v_job_id);
    end loop;

    perform cron.schedule(
      'purge-release-participation-every-15-minutes',
      '*/15 * * * *',
      'select public.purge_expired_release_participation_applications()'
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- Expand the shared participation lead system to the SunizShine project.
insert into public.release_role_types (
  code,
  label_ko,
  category,
  description,
  is_active,
  sort_order
)
values
  ('planning', '기획', 'other', '프로젝트 방향과 실행 계획 수립', true, 80),
  ('a_and_r', 'A&R', 'other', '아티스트와 레퍼토리 방향 조율', true, 90),
  ('video', '영상', 'video', '프로젝트 영상 기획과 제작', true, 100),
  ('mixing', '믹스', 'music', '멀티트랙 밸런스와 공간감 조정', true, 110),
  ('mastering', '마스터링', 'music', '최종 음원 규격과 음질 완성', true, 120)
on conflict (code) do nothing;

update public.release_role_types
set label_ko = '보컬'
where code = 'vocal'
  and label_ko = '가창'
  and category = 'music'
  and description = '보컬 퍼포먼스와 녹음'
  and sort_order = 70;

update public.release_roles as role
set state = 'closed'
from public.music_releases as release
where role.release_id = release.id
  and release.project_slug = 'vintagechord-post-production'
  and release.release_number in (2, 3)
  and role.role_type_code = 'music_video'
  and role.state in ('open', 'paused');

with inserted_release as (
  insert into public.music_releases (
    project_slug,
    release_number,
    title,
    artist_name,
    release_date,
    state,
    is_published
  )
  values (
    'ibyeol-ui-dosu',
    1,
    '이별의 도수',
    'SunizShine',
    null,
    'upcoming',
    true
  )
  on conflict (project_slug, release_number) do nothing
  returning id
), inserted_roles as (
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
    desired_role.state,
    true,
    null,
    null,
    1,
    null,
    desired_role.sort_order
  from inserted_release as release
  cross join (
    values
      ('composition'::text, 'filled'::text, 10),
      ('lyrics'::text, 'open'::text, 20),
      ('arrangement'::text, 'open'::text, 30),
      ('planning'::text, 'open'::text, 40),
      ('a_and_r'::text, 'open'::text, 50),
      ('artwork'::text, 'open'::text, 60),
      ('video'::text, 'open'::text, 70),
      ('vocal'::text, 'open'::text, 80),
      ('mixing'::text, 'open'::text, 90),
      ('mastering'::text, 'open'::text, 100)
  ) as desired_role(role_type_code, state, sort_order)
  returning id, role_type_code
)
insert into public.release_credits (
  release_role_id,
  display_name,
  is_ranch_member,
  publication_basis,
  sort_order
)
select
  role.id,
  'SunizShine',
  true,
  'direct_assignment',
  10
from inserted_roles as role
where role.role_type_code = 'composition';

create or replace function public.update_music_release_item(
  p_release_id uuid,
  p_title text,
  p_artist_name text,
  p_release_date date,
  p_state text,
  p_youtube_video_id text,
  p_summary text,
  p_is_published boolean
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_release public.music_releases%rowtype;
  v_old_auto_cover text;
  v_new_cover text;
begin
  if p_state not in ('draft', 'upcoming', 'released', 'archived') then
    return 'invalid_state';
  end if;

  if p_title is null
    or char_length(btrim(p_title)) not between 1 and 160
    or p_artist_name is null
    or char_length(btrim(p_artist_name)) not between 1 and 200
    or (p_youtube_video_id is not null and p_youtube_video_id !~ '^[A-Za-z0-9_-]{11}$')
    or (p_summary is not null and char_length(btrim(p_summary)) not between 1 and 1000)
    or p_is_published is null then
    return 'invalid_input';
  end if;

  select release.*
  into v_release
  from public.music_releases as release
  where release.id = p_release_id
  for update;

  if not found then
    return 'not_found';
  end if;

  v_old_auto_cover := case
    when v_release.youtube_video_id is null then null
    else 'https://i.ytimg.com/vi/' || v_release.youtube_video_id || '/hqdefault.jpg'
  end;
  v_new_cover := v_release.cover_image_url;

  if v_release.cover_image_url is null or v_release.cover_image_url = v_old_auto_cover then
    v_new_cover := case
      when p_youtube_video_id is null then null
      else 'https://i.ytimg.com/vi/' || p_youtube_video_id || '/hqdefault.jpg'
    end;
  end if;

  update public.music_releases
  set title = btrim(p_title),
      artist_name = btrim(p_artist_name),
      release_date = p_release_date,
      state = p_state,
      youtube_video_id = p_youtube_video_id,
      cover_image_url = v_new_cover,
      summary = case when p_summary is null then null else btrim(p_summary) end,
      is_published = p_is_published
  where id = p_release_id;

  if p_state in ('released', 'archived') then
    update public.release_roles
    set state = 'closed'
    where release_id = p_release_id
      and state in ('open', 'paused');
  end if;

  return 'updated';
end;
$$;

create or replace function public.update_release_role_configuration(
  p_role_id uuid,
  p_state text,
  p_is_public boolean,
  p_brief text,
  p_requirements text,
  p_application_deadline timestamptz,
  p_capacity smallint
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_release_id uuid;
  v_release public.music_releases%rowtype;
  v_role public.release_roles%rowtype;
  v_credit_count bigint;
begin
  if p_state not in ('open', 'paused', 'filled', 'closed') then
    return 'invalid_state';
  end if;

  if p_is_public is null
    or p_capacity is null
    or p_capacity not between 1 and 100
    or (p_brief is not null and char_length(btrim(p_brief)) not between 1 and 1000)
    or (p_requirements is not null and char_length(btrim(p_requirements)) not between 1 and 2000) then
    return 'invalid_input';
  end if;

  select role.release_id
  into v_release_id
  from public.release_roles as role
  where role.id = p_role_id;

  if not found then
    return 'not_found';
  end if;

  select release.*
  into v_release
  from public.music_releases as release
  where release.id = v_release_id
  for update;

  if not found then
    return 'not_found';
  end if;

  select role.*
  into v_role
  from public.release_roles as role
  where role.id = p_role_id
  for update;

  if not found then
    return 'not_found';
  end if;

  select count(*)
  into v_credit_count
  from public.release_credits as credit
  where credit.release_role_id = p_role_id;

  if p_capacity < v_credit_count then
    return 'capacity_below_credits';
  end if;

  if p_state = 'filled' and v_credit_count = 0 then
    return 'invalid_state';
  end if;

  if p_state = 'open' then
    if v_release.state <> 'upcoming' or not v_release.is_published then
      return 'release_unavailable';
    end if;

    if p_application_deadline is not null and p_application_deadline <= now() then
      return 'deadline_expired';
    end if;

    if v_credit_count >= p_capacity then
      return 'capacity_reached';
    end if;
  end if;

  update public.release_roles
  set state = p_state,
      is_public = p_is_public,
      brief = case when p_brief is null then null else btrim(p_brief) end,
      requirements = case when p_requirements is null then null else btrim(p_requirements) end,
      application_deadline = p_application_deadline,
      capacity = p_capacity
  where id = p_role_id;

  return 'updated';
end;
$$;

create or replace function public.submit_release_participation_application(
  p_release_role_id uuid,
  p_applicant_name text,
  p_credit_name text,
  p_email text,
  p_phone text,
  p_profile_url text,
  p_portfolio_url text,
  p_availability text,
  p_message text,
  p_privacy_notice_version text,
  p_credit_publication_notice_version text,
  p_idempotency_key uuid,
  p_payload_hash text,
  p_request_fingerprint text,
  p_email_fingerprint text
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing_payload_hash text;
  v_application_id uuid;
  v_release_id uuid;
  v_release public.music_releases%rowtype;
  v_role public.release_roles%rowtype;
  v_credit_count bigint;
begin
  if p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_email_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid release application hashes' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('release-participation:' || p_idempotency_key::text, 0)
  );

  delete from public.release_participation_applications
  where retention_until <= now();

  select application.payload_hash
  into v_existing_payload_hash
  from public.release_participation_applications as application
  where application.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_payload_hash = p_payload_hash then
      return 'duplicate';
    end if;

    return 'conflict';
  end if;

  if not public.consume_request_rate_limit(
    'release-participation',
    p_request_fingerprint,
    3,
    900
  ) then
    return 'rate_limited';
  end if;

  select role.release_id
  into v_release_id
  from public.release_roles as role
  where role.id = p_release_role_id;

  if not found then
    return 'unavailable';
  end if;

  select release.*
  into v_release
  from public.music_releases as release
  where release.id = v_release_id
  for update;

  if not found or not v_release.is_published or v_release.state <> 'upcoming' then
    return 'unavailable';
  end if;

  select role.*
  into v_role
  from public.release_roles as role
  join public.release_role_types as role_type on role_type.code = role.role_type_code
  where role.id = p_release_role_id
    and role.state = 'open'
    and role.is_public
    and (role.application_deadline is null or role.application_deadline > now())
    and role_type.is_active
  for update of role;

  if not found then
    return 'unavailable';
  end if;

  select count(*)
  into v_credit_count
  from public.release_credits as credit
  where credit.release_role_id = p_release_role_id;

  if v_credit_count >= v_role.capacity then
    return 'unavailable';
  end if;

  if not public.consume_request_rate_limit(
    'release-participation-email:' || p_release_role_id::text,
    p_email_fingerprint,
    2,
    86400
  ) then
    return 'email_rate_limited';
  end if;

  insert into public.release_participation_applications (
    release_role_id,
    applicant_name,
    credit_name,
    email,
    phone,
    profile_url,
    portfolio_url,
    availability,
    message,
    privacy_agreed,
    privacy_notice_version,
    credit_publication_agreed,
    credit_publication_consented_at,
    credit_publication_notice_version,
    idempotency_key,
    payload_hash
  )
  values (
    p_release_role_id,
    p_applicant_name,
    p_credit_name,
    p_email,
    p_phone,
    p_profile_url,
    p_portfolio_url,
    p_availability,
    p_message,
    true,
    p_privacy_notice_version,
    true,
    now(),
    p_credit_publication_notice_version,
    p_idempotency_key,
    p_payload_hash
  )
  returning id into v_application_id;

  insert into public.release_application_status_events (
    application_id,
    from_status,
    to_status
  )
  values (v_application_id, null, 'new');

  return 'inserted';
end;
$$;

revoke all on function public.update_music_release_item(
  uuid, text, text, date, text, text, text, boolean
) from public, anon, authenticated;
revoke all on function public.update_release_role_configuration(
  uuid, text, boolean, text, text, timestamptz, smallint
) from public, anon, authenticated;
revoke all on function public.submit_release_participation_application(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text
) from public, anon, authenticated;

grant execute on function public.update_music_release_item(
  uuid, text, text, date, text, text, text, boolean
) to service_role;
grant execute on function public.update_release_role_configuration(
  uuid, text, boolean, text, text, timestamptz, smallint
) to service_role;
grant execute on function public.submit_release_participation_application(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text
) to service_role;

notify pgrst, 'reload schema';
