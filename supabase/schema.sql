create extension if not exists "pgcrypto";
create extension if not exists pg_cron with schema pg_catalog;

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

-- Allocate PPP release numbers atomically while keeping creation requests idempotent.
create or replace function public.admin_create_next_ppp_release(
  p_creation_id uuid,
  p_expected_release_number integer,
  p_title text,
  p_artist_name text,
  p_release_date date,
  p_youtube_video_id text,
  p_summary text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_project_slug constant text := 'vintagechord-post-production';
  v_existing public.music_releases%rowtype;
  v_created public.music_releases%rowtype;
  v_next_release_number integer;
  v_title text;
  v_artist_name text;
  v_summary text;
begin
  perform pg_advisory_xact_lock(20260815, 152000);

  if p_creation_id is null
    or p_expected_release_number is null
    or p_expected_release_number not between 1 and 1000
    or p_title is null
    or char_length(btrim(p_title)) not between 1 and 160
    or p_artist_name is null
    or char_length(btrim(p_artist_name)) not between 1 and 200
    or (p_youtube_video_id is not null and p_youtube_video_id !~ '^[A-Za-z0-9_-]{11}$')
    or (p_summary is not null and char_length(btrim(p_summary)) not between 1 and 1000) then
    return jsonb_build_object(
      'status', 'invalid_input',
      'release_id', null,
      'release_number', null
    );
  end if;

  v_title := btrim(p_title);
  v_artist_name := btrim(p_artist_name);
  v_summary := case when p_summary is null then null else btrim(p_summary) end;

  select release.*
  into v_existing
  from public.music_releases as release
  where release.id = p_creation_id;

  if found then
    if v_existing.project_slug = v_project_slug
      and v_existing.release_number = p_expected_release_number
      and v_existing.title = v_title
      and v_existing.artist_name = v_artist_name
      and v_existing.release_date is not distinct from p_release_date
      and v_existing.youtube_video_id is not distinct from p_youtube_video_id
      and v_existing.summary is not distinct from v_summary
      and v_existing.state = 'draft'
      and not v_existing.is_published then
      return jsonb_build_object(
        'status', 'duplicate',
        'release_id', v_existing.id,
        'release_number', v_existing.release_number
      );
    end if;

    return jsonb_build_object(
      'status', 'conflict',
      'release_id', v_existing.id,
      'release_number', v_existing.release_number
    );
  end if;

  select coalesce(max(release.release_number), 0) + 1
  into v_next_release_number
  from public.music_releases as release
  where release.project_slug = v_project_slug;

  if p_expected_release_number <> v_next_release_number then
    return jsonb_build_object(
      'status', 'stale',
      'release_id', null,
      'release_number', v_next_release_number
    );
  end if;

  if v_next_release_number > 999 then
    return jsonb_build_object(
      'status', 'number_exhausted',
      'release_id', null,
      'release_number', null
    );
  end if;

  insert into public.music_releases (
    id,
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
    p_creation_id,
    v_project_slug,
    v_next_release_number,
    v_title,
    v_artist_name,
    p_release_date,
    'draft',
    p_youtube_video_id,
    case
      when p_youtube_video_id is null then null
      else 'https://i.ytimg.com/vi/' || p_youtube_video_id || '/hqdefault.jpg'
    end,
    v_summary,
    false
  )
  returning * into v_created;

  return jsonb_build_object(
    'status', 'created',
    'release_id', v_created.id,
    'release_number', v_created.release_number
  );
exception
  when unique_violation then
    select release.*
    into v_existing
    from public.music_releases as release
    where release.id = p_creation_id
      or (
        release.project_slug = v_project_slug
        and release.release_number = v_next_release_number
      )
    order by (release.id = p_creation_id) desc
    limit 1;

    if found then
      return jsonb_build_object(
        'status', 'conflict',
        'release_id', v_existing.id,
        'release_number', v_existing.release_number
      );
    end if;

    return jsonb_build_object(
      'status', 'conflict',
      'release_id', null,
      'release_number', null
    );
end;
$$;

revoke all on function public.admin_create_next_ppp_release(
  uuid, integer, text, text, date, text, text
) from public, anon, authenticated;
grant execute on function public.admin_create_next_ppp_release(
  uuid, integer, text, text, date, text, text
) to service_role;

notify pgrst, 'reload schema';

-- Make project visibility/lifecycle and the next meeting administrator-managed.
create table if not exists public.project_page_settings (
  project_slug text primary key check (
    project_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(project_slug) <= 120
  ),
  lifecycle text not null default 'active' check (
    lifecycle in ('active', 'completed', 'archived')
  ),
  is_public boolean not null default true,
  constraint project_page_settings_public_lifecycle_check check (
    lifecycle = 'active' or not is_public
  ),
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_page_settings_public_order_idx
  on public.project_page_settings (is_public, lifecycle, sort_order, project_slug);

insert into public.project_page_settings (
  project_slug,
  lifecycle,
  is_public,
  sort_order
)
values
  ('ibyeol-ui-dosu', 'active', true, 10),
  ('vintagechord-post-production', 'active', true, 20)
on conflict (project_slug) do nothing;

drop trigger if exists project_page_settings_touch_updated_at
  on public.project_page_settings;
create trigger project_page_settings_touch_updated_at
before update on public.project_page_settings
for each row execute function public.touch_release_lead_updated_at();

alter table public.project_page_settings enable row level security;

revoke all on table public.project_page_settings
  from public, anon, authenticated;
grant select, insert, update, delete on table public.project_page_settings
  to service_role;

create table if not exists public.site_settings (
  id smallint primary key default 1 check (id = 1),
  next_meeting_at timestamptz not null,
  venue text not null check (char_length(btrim(venue)) between 1 and 120),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.site_settings (
  id,
  next_meeting_at,
  venue,
  is_visible
)
values (
  1,
  timestamptz '2026-09-12 17:00:00+09',
  '시그마프라자',
  true
)
on conflict (id) do nothing;

drop trigger if exists site_settings_touch_updated_at
  on public.site_settings;
create trigger site_settings_touch_updated_at
before update on public.site_settings
for each row execute function public.touch_release_lead_updated_at();

alter table public.site_settings enable row level security;

revoke all on table public.site_settings
  from public, anon, authenticated;
grant select, insert, update, delete on table public.site_settings
  to service_role;

create or replace function public.admin_update_project_page_settings(
  p_project_slug text,
  p_expected_updated_at timestamptz,
  p_lifecycle text,
  p_is_public boolean,
  p_sort_order integer
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_current public.project_page_settings%rowtype;
  v_updated_at timestamptz;
begin
  if p_project_slug is null
    or p_project_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or char_length(p_project_slug) > 120
    or p_expected_updated_at is null
    or p_lifecycle is null
    or p_lifecycle not in ('active', 'completed', 'archived')
    or p_is_public is null
    or (p_lifecycle <> 'active' and p_is_public)
    or p_sort_order is null
    or p_sort_order not between 0 and 10000 then
    return jsonb_build_object(
      'status', 'invalid_input',
      'project_slug', p_project_slug,
      'updated_at', null
    );
  end if;

  select settings.*
  into v_current
  from public.project_page_settings as settings
  where settings.project_slug = p_project_slug
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'not_found',
      'project_slug', p_project_slug,
      'updated_at', null
    );
  end if;

  if v_current.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object(
      'status', 'conflict',
      'project_slug', v_current.project_slug,
      'updated_at', v_current.updated_at
    );
  end if;

  update public.project_page_settings
  set lifecycle = p_lifecycle,
      is_public = p_is_public,
      sort_order = p_sort_order
  where project_slug = p_project_slug
  returning updated_at into v_updated_at;

  -- Closing a project is terminal for its currently open recruitment. Existing
  -- applications and credits remain untouched and can still be reviewed.
  if p_lifecycle <> 'active' or not p_is_public then
    update public.release_roles as role
    set state = 'closed'
    from public.music_releases as release
    where role.release_id = release.id
      and release.project_slug = p_project_slug
      and role.state in ('open', 'paused');
  end if;

  return jsonb_build_object(
    'status', 'updated',
    'project_slug', p_project_slug,
    'updated_at', v_updated_at
  );
end;
$$;

create or replace function public.admin_update_next_meeting_setting(
  p_expected_updated_at timestamptz,
  p_next_meeting_at timestamptz,
  p_venue text,
  p_is_visible boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_current public.site_settings%rowtype;
  v_updated_at timestamptz;
begin
  if p_expected_updated_at is null
    or p_next_meeting_at is null
    or p_venue is null
    or char_length(btrim(p_venue)) not between 1 and 120
    or p_is_visible is null then
    return jsonb_build_object(
      'status', 'invalid_input',
      'updated_at', null
    );
  end if;

  select settings.*
  into v_current
  from public.site_settings as settings
  where settings.id = 1
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'not_found',
      'updated_at', null
    );
  end if;

  if v_current.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object(
      'status', 'conflict',
      'updated_at', v_current.updated_at
    );
  end if;

  update public.site_settings
  set next_meeting_at = p_next_meeting_at,
      venue = btrim(p_venue),
      is_visible = p_is_visible
  where id = 1
  returning updated_at into v_updated_at;

  return jsonb_build_object(
    'status', 'updated',
    'updated_at', v_updated_at
  );
end;
$$;

-- A role may be opened only while its parent project is public and active.
create or replace function public.enforce_open_release_role_project_visibility()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_project_is_available boolean;
begin
  if new.state <> 'open' then
    return new;
  end if;

  select settings.lifecycle = 'active' and settings.is_public
  into v_project_is_available
  from public.music_releases as release
  join public.project_page_settings as settings
    on settings.project_slug = release.project_slug
  where release.id = new.release_id
  for share of settings;

  if not coalesce(v_project_is_available, false) then
    raise exception 'release project is not public and active'
      using errcode = '23514',
            constraint = 'release_roles_open_project_visibility_check';
  end if;

  return new;
end;
$$;

drop trigger if exists release_roles_enforce_open_project_visibility
  on public.release_roles;
create trigger release_roles_enforce_open_project_visibility
before insert or update of release_id, state on public.release_roles
for each row execute function public.enforce_open_release_role_project_visibility();

create or replace function public.set_release_role_state(
  p_role_id uuid,
  p_state text
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_release public.music_releases%rowtype;
  v_project_settings public.project_page_settings%rowtype;
  v_role public.release_roles%rowtype;
  v_credit_count bigint;
begin
  if p_state not in ('open', 'paused', 'closed') then
    return 'invalid_state';
  end if;

  select release.*
  into v_release
  from public.music_releases as release
  join public.release_roles as role on role.release_id = release.id
  where role.id = p_role_id
  for update of release;

  if not found then
    return 'not_found';
  end if;

  if p_state = 'open' then
    select settings.*
    into v_project_settings
    from public.project_page_settings as settings
    where settings.project_slug = v_release.project_slug
    for share;

    if not found
      or v_project_settings.lifecycle <> 'active'
      or not v_project_settings.is_public
      or v_release.state <> 'upcoming'
      or not v_release.is_published then
      return 'release_unavailable';
    end if;
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
set search_path = pg_catalog, public
as $$
declare
  v_release_id uuid;
  v_release public.music_releases%rowtype;
  v_project_settings public.project_page_settings%rowtype;
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

  if p_state = 'open' then
    select settings.*
    into v_project_settings
    from public.project_page_settings as settings
    where settings.project_slug = v_release.project_slug
    for share;

    if not found
      or v_project_settings.lifecycle <> 'active'
      or not v_project_settings.is_public
      or v_release.state <> 'upcoming'
      or not v_release.is_published then
      return 'release_unavailable';
    end if;
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
set search_path = pg_catalog, public
as $$
declare
  v_existing_payload_hash text;
  v_application_id uuid;
  v_release_id uuid;
  v_release public.music_releases%rowtype;
  v_project_settings public.project_page_settings%rowtype;
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

  select settings.*
  into v_project_settings
  from public.project_page_settings as settings
  where settings.project_slug = v_release.project_slug
  for share;

  if not found
    or v_project_settings.lifecycle <> 'active'
    or not v_project_settings.is_public then
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

revoke all on function public.admin_update_project_page_settings(
  text, timestamptz, text, boolean, integer
) from public, anon, authenticated;
revoke all on function public.admin_update_next_meeting_setting(
  timestamptz, timestamptz, text, boolean
) from public, anon, authenticated;
revoke all on function public.enforce_open_release_role_project_visibility()
  from public, anon, authenticated;
revoke all on function public.set_release_role_state(uuid, text)
  from public, anon, authenticated;
revoke all on function public.update_release_role_configuration(
  uuid, text, boolean, text, text, timestamptz, smallint
) from public, anon, authenticated;
revoke all on function public.submit_release_participation_application(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text
) from public, anon, authenticated;

grant execute on function public.admin_update_project_page_settings(
  text, timestamptz, text, boolean, integer
) to service_role;
grant execute on function public.admin_update_next_meeting_setting(
  timestamptz, timestamptz, text, boolean
) to service_role;
grant execute on function public.enforce_open_release_role_project_visibility()
  to service_role;
grant execute on function public.set_release_role_state(uuid, text)
  to service_role;
grant execute on function public.update_release_role_configuration(
  uuid, text, boolean, text, text, timestamptz, smallint
) to service_role;
grant execute on function public.submit_release_participation_application(
  uuid, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text
) to service_role;

notify pgrst, 'reload schema';

-- Remove the completed Eulwangli intake table without deleting unexpected data.
do $$
declare
  v_legacy_row_count bigint;
begin
  if to_regclass('public.party_applications') is not null then
    execute 'lock table public.party_applications in access exclusive mode';
    execute 'select count(*) from public.party_applications'
      into v_legacy_row_count;

    if v_legacy_row_count <> 0 then
      raise exception 'party_applications still contains % row(s)', v_legacy_row_count
        using errcode = '55000';
    end if;
  end if;
end;
$$;

drop table if exists public.party_applications restrict;

-- Keep an immutable service-only record of lifecycle/visibility transitions and
-- the recruitment roles that were closed by each transition.
create table if not exists public.project_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  project_slug text not null references public.project_page_settings (project_slug)
    on update cascade on delete restrict,
  from_lifecycle text not null check (
    from_lifecycle in ('active', 'completed', 'archived')
  ),
  to_lifecycle text not null check (
    to_lifecycle in ('active', 'completed', 'archived')
  ),
  from_is_public boolean not null,
  to_is_public boolean not null,
  from_sort_order integer not null check (from_sort_order between 0 and 10000),
  to_sort_order integer not null check (to_sort_order between 0 and 10000),
  closed_role_snapshots jsonb not null default '[]'::jsonb check (
    jsonb_typeof(closed_role_snapshots) = 'array'
  ),
  created_at timestamptz not null default now(),
  constraint project_lifecycle_events_meaningful_change_check check (
    from_lifecycle <> to_lifecycle
    or from_is_public <> to_is_public
    or jsonb_array_length(closed_role_snapshots) > 0
  )
);

create index if not exists project_lifecycle_events_project_created_idx
  on public.project_lifecycle_events (project_slug, created_at desc, id);

alter table public.project_lifecycle_events enable row level security;

revoke all on table public.project_lifecycle_events
  from public, anon, authenticated, service_role;
grant select, insert on table public.project_lifecycle_events
  to service_role;

create or replace function public.admin_update_project_page_settings(
  p_project_slug text,
  p_expected_updated_at timestamptz,
  p_lifecycle text,
  p_is_public boolean,
  p_sort_order integer
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_current public.project_page_settings%rowtype;
  v_updated_at timestamptz;
  v_closed_role_snapshots jsonb := '[]'::jsonb;
  v_state_changed boolean;
begin
  if p_project_slug is null
    or p_project_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or char_length(p_project_slug) > 120
    or p_expected_updated_at is null
    or p_lifecycle is null
    or p_lifecycle not in ('active', 'completed', 'archived')
    or p_is_public is null
    or (p_lifecycle <> 'active' and p_is_public)
    or p_sort_order is null
    or p_sort_order not between 0 and 10000 then
    return jsonb_build_object(
      'status', 'invalid_input',
      'project_slug', p_project_slug,
      'updated_at', null
    );
  end if;

  select settings.*
  into v_current
  from public.project_page_settings as settings
  where settings.project_slug = p_project_slug
  for update;

  if not found then
    return jsonb_build_object(
      'status', 'not_found',
      'project_slug', p_project_slug,
      'updated_at', null
    );
  end if;

  if v_current.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object(
      'status', 'conflict',
      'project_slug', v_current.project_slug,
      'updated_at', v_current.updated_at
    );
  end if;

  v_state_changed := v_current.lifecycle is distinct from p_lifecycle
    or v_current.is_public is distinct from p_is_public;

  update public.project_page_settings
  set lifecycle = p_lifecycle,
      is_public = p_is_public,
      sort_order = p_sort_order
  where project_slug = p_project_slug
  returning updated_at into v_updated_at;

  if p_lifecycle <> 'active' or not p_is_public then
    with roles_to_close as materialized (
      select
        role.id as role_id,
        role.release_id,
        role.role_type_code,
        role.state as previous_state
      from public.release_roles as role
      join public.music_releases as release on release.id = role.release_id
      where release.project_slug = p_project_slug
        and role.state in ('open', 'paused')
      order by role.id
      for update of role
    ),
    closed_roles as (
      update public.release_roles as role
      set state = 'closed'
      from roles_to_close as snapshot
      where role.id = snapshot.role_id
      returning
        role.id as role_id,
        jsonb_build_object(
          'role_id', role.id,
          'release_id', role.release_id,
          'role_type_code', role.role_type_code,
          'previous_state', snapshot.previous_state
        ) as role_snapshot
    )
    select coalesce(
      jsonb_agg(closed.role_snapshot order by closed.role_id),
      '[]'::jsonb
    )
    into v_closed_role_snapshots
    from closed_roles as closed;
  end if;

  if v_state_changed or jsonb_array_length(v_closed_role_snapshots) > 0 then
    insert into public.project_lifecycle_events (
      project_slug,
      from_lifecycle,
      to_lifecycle,
      from_is_public,
      to_is_public,
      from_sort_order,
      to_sort_order,
      closed_role_snapshots
    )
    values (
      p_project_slug,
      v_current.lifecycle,
      p_lifecycle,
      v_current.is_public,
      p_is_public,
      v_current.sort_order,
      p_sort_order,
      v_closed_role_snapshots
    );
  end if;

  return jsonb_build_object(
    'status', 'updated',
    'project_slug', p_project_slug,
    'updated_at', v_updated_at
  );
end;
$$;

revoke all on function public.admin_update_project_page_settings(
  text, timestamptz, text, boolean, integer
) from public, anon, authenticated;
grant execute on function public.admin_update_project_page_settings(
  text, timestamptz, text, boolean, integer
) to service_role;

notify pgrst, 'reload schema';

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
