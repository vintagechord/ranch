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
