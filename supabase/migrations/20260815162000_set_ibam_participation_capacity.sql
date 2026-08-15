-- Set the initial participation target to five people for every 이밤의 도수 role except composition.
-- Existing paused/closed roles stay paused/closed; a role auto-filled at the old one-person target reopens when safe.
do $$
declare
  v_release_id uuid;
  v_can_reopen boolean;
  v_target_count integer;
  v_updated_count integer;
begin
  select
    release.id,
    release.state = 'upcoming'
      and release.is_published
      and settings.lifecycle = 'active'
      and settings.is_public
  into v_release_id, v_can_reopen
  from public.music_releases as release
  join public.project_page_settings as settings
    on settings.project_slug = release.project_slug
  where release.project_slug = 'ibyeol-ui-dosu'
    and release.release_number = 1;

  if not found then
    raise exception '이밤의 도수 release 01 is missing' using errcode = '55000';
  end if;

  perform 1
  from public.release_roles as role
  where role.release_id = v_release_id
    and role.role_type_code in (
      'lyrics',
      'arrangement',
      'planning',
      'a_and_r',
      'artwork',
      'video',
      'vocal',
      'mixing',
      'mastering'
    )
  for update;

  select count(*)
  into v_target_count
  from public.release_roles as role
  where role.release_id = v_release_id
    and role.role_type_code in (
      'lyrics',
      'arrangement',
      'planning',
      'a_and_r',
      'artwork',
      'video',
      'vocal',
      'mixing',
      'mastering'
    );

  if v_target_count <> 9 then
    raise exception 'expected 9 non-composition roles, found %', v_target_count using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.release_roles as role
    where role.release_id = v_release_id
      and role.role_type_code in (
        'lyrics',
        'arrangement',
        'planning',
        'a_and_r',
        'artwork',
        'video',
        'vocal',
        'mixing',
        'mastering'
      )
      and (
        select count(*)
        from public.release_credits as credit
        where credit.release_role_id = role.id
      ) > 5
  ) then
    raise exception 'a target role already has more than 5 confirmed credits' using errcode = '55000';
  end if;

  update public.release_roles as role
  set capacity = 5
  where role.release_id = v_release_id
    and role.role_type_code in (
      'lyrics',
      'arrangement',
      'planning',
      'a_and_r',
      'artwork',
      'video',
      'vocal',
      'mixing',
      'mastering'
    );

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 9 then
    raise exception 'expected to update 9 target roles, updated %', v_updated_count using errcode = '55000';
  end if;

  if v_can_reopen then
    update public.release_roles as role
    set state = 'open'
    where role.release_id = v_release_id
      and role.role_type_code in (
        'lyrics',
        'arrangement',
        'planning',
        'a_and_r',
        'artwork',
        'video',
        'vocal',
        'mixing',
        'mastering'
      )
      and role.state = 'filled'
      and role.is_public
      and (role.application_deadline is null or role.application_deadline > now())
      and exists (
        select 1
        from public.release_role_types as role_type
        where role_type.code = role.role_type_code
          and role_type.is_active
      )
      and (
        select count(*)
        from public.release_credits as credit
        where credit.release_role_id = role.id
      ) < role.capacity;
  end if;

  if exists (
    select 1
    from public.release_roles as role
    where role.release_id = v_release_id
      and role.role_type_code in (
        'lyrics',
        'arrangement',
        'planning',
        'a_and_r',
        'artwork',
        'video',
        'vocal',
        'mixing',
        'mastering'
      )
      and role.capacity <> 5
  ) then
    raise exception 'target role capacity update did not converge to 5' using errcode = '55000';
  end if;
end;
$$;

-- Keep `filled` capacity-derived when an administrator raises a target. The
-- project form submits the current state together with the new capacity, so a
-- formerly full role arrives here as `filled` even though the larger target now
-- has vacancies.
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
  v_project_available boolean := false;
  v_role_type_is_active boolean := false;
  v_effective_state text;
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

  if p_state in ('open', 'filled') then
    select settings.*
    into v_project_settings
    from public.project_page_settings as settings
    where settings.project_slug = v_release.project_slug
    for share;

    v_project_available := found
      and v_project_settings.lifecycle = 'active'
      and v_project_settings.is_public;
  end if;

  if p_state = 'open' then
    if not v_project_available
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

  v_effective_state := p_state;

  if p_state = 'filled' and v_credit_count < p_capacity then
    -- The only partial `filled` state accepted here is the form's unchanged
    -- state while increasing a role that was full at its previous target.
    if v_role.state <> 'filled' or p_capacity <= v_role.capacity then
      return 'invalid_state';
    end if;

    select role_type.is_active
    into v_role_type_is_active
    from public.release_role_types as role_type
    where role_type.code = v_role.role_type_code;

    if not v_project_available
      or v_release.state <> 'upcoming'
      or not v_release.is_published
      or not p_is_public
      or not coalesce(v_role_type_is_active, false)
      or (p_application_deadline is not null and p_application_deadline <= now()) then
      return 'invalid_state';
    end if;

    v_effective_state := 'open';
  end if;

  if v_effective_state = 'open' then
    if p_application_deadline is not null and p_application_deadline <= now() then
      return 'deadline_expired';
    end if;

    if v_credit_count >= p_capacity then
      return 'capacity_reached';
    end if;
  end if;

  update public.release_roles
  set state = v_effective_state,
      is_public = p_is_public,
      brief = case when p_brief is null then null else btrim(p_brief) end,
      requirements = case when p_requirements is null then null else btrim(p_requirements) end,
      application_deadline = p_application_deadline,
      capacity = p_capacity
  where id = p_role_id;

  return 'updated';
end;
$$;

-- Removing an accepted credit should only undo the automatic `filled` state.
-- Explicit open/paused/closed choices remain intact.
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
  v_release_id uuid;
  v_release public.music_releases%rowtype;
  v_project_settings public.project_page_settings%rowtype;
  v_credit_display_name text;
  v_credit_is_ranch_member boolean;
  v_other_credit_count bigint;
  v_project_available boolean := false;
  v_role_type_is_active boolean := false;
  v_can_reopen boolean := false;
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
    -- Follow the release -> project settings -> role lock order used by the
    -- configuration/submission RPCs before a possible transition to `open`.
    select role.release_id
    into v_release_id
    from public.release_roles as role
    where role.id = v_application.release_role_id;

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

    select settings.*
    into v_project_settings
    from public.project_page_settings as settings
    where settings.project_slug = v_release.project_slug
    for share;

    v_project_available := found
      and v_project_settings.lifecycle = 'active'
      and v_project_settings.is_public;

    select role.*
    into v_role
    from public.release_roles as role
    where role.id = v_application.release_role_id
    for update;

    if not found then
      return 'not_found';
    end if;

    select role_type.is_active
    into v_role_type_is_active
    from public.release_role_types as role_type
    where role_type.code = v_role.role_type_code;
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

    v_can_reopen := v_role.state = 'filled'
      and v_other_credit_count < v_role.capacity
      and v_project_available
      and v_release.state = 'upcoming'
      and v_release.is_published
      and v_role.is_public
      and (v_role.application_deadline is null or v_role.application_deadline > now())
      and coalesce(v_role_type_is_active, false);

    update public.release_roles
    set state = case
          when v_role.state in ('open', 'paused', 'closed') then v_role.state
          when v_other_credit_count >= capacity then 'filled'
          when v_can_reopen then 'open'
          else 'paused'
        end
    where id = v_application.release_role_id;
  end if;

  return 'updated';
end;
$$;

revoke all on function public.update_release_role_configuration(
  uuid, text, boolean, text, text, timestamptz, smallint
) from public, anon, authenticated;
revoke all on function public.review_release_participation_application(
  uuid, text, text, text, boolean, smallint
) from public, anon, authenticated;

grant execute on function public.update_release_role_configuration(
  uuid, text, boolean, text, text, timestamptz, smallint
) to service_role;
grant execute on function public.review_release_participation_application(
  uuid, text, text, text, boolean, smallint
) to service_role;
