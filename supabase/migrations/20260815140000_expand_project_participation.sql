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
