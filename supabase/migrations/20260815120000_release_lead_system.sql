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
