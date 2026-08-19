-- Add optional, versioned project-entry passwords without exposing password material publicly.
alter table public.project_page_settings
  add column if not exists access_password_hash text,
  add column if not exists access_version integer not null default 0;

alter table public.project_page_settings
  drop constraint if exists project_page_settings_access_password_hash_check;
alter table public.project_page_settings
  add constraint project_page_settings_access_password_hash_check
  check (
    access_password_hash is null
    or access_password_hash ~ '^scrypt[$]v1[$]32768[$]8[$]1[$][A-Za-z0-9_-]{22}[$][A-Za-z0-9_-]{43}$'
  );

alter table public.project_page_settings
  drop constraint if exists project_page_settings_access_version_check;
alter table public.project_page_settings
  add constraint project_page_settings_access_version_check
  check (access_version between 0 and 2147483647);

-- Use distinct salts even when projects start with the same entry password.
update public.project_page_settings
set access_password_hash = case project_slug
      when 'ibyeol-ui-dosu'
        then 'scrypt$v1$32768$8$1$Xma93orEItT3_9QesYrDJw$-ihsudVAjBgxqt1CE8J8lMpzGz-PiUoFiBNyfzm7IRE'
      when 'wandurup-dudu'
        then 'scrypt$v1$32768$8$1$1gvPRK4zg4POzXecTRxfqg$ZpE0ssbow-hVedfXG3okQ_LGaHIPScFMmt4Y_GdtetA'
      else access_password_hash
    end,
    access_version = access_version + 1
where project_slug in ('ibyeol-ui-dosu', 'wandurup-dudu')
  and access_password_hash is null
  and access_version = 0;

create or replace function public.admin_update_project_access_password(
  p_project_slug text,
  p_expected_updated_at timestamptz,
  p_password_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_current public.project_page_settings%rowtype;
  v_updated_at timestamptz;
  v_access_version integer;
begin
  if p_project_slug is null
    or p_project_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or char_length(p_project_slug) > 120
    or p_expected_updated_at is null
    or (
      p_password_hash is not null
      and p_password_hash !~ '^scrypt[$]v1[$]32768[$]8[$]1[$][A-Za-z0-9_-]{22}[$][A-Za-z0-9_-]{43}$'
    ) then
    return jsonb_build_object(
      'status', 'invalid_input',
      'project_slug', p_project_slug,
      'updated_at', null,
      'access_version', null
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
      'updated_at', null,
      'access_version', null
    );
  end if;

  if v_current.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object(
      'status', 'conflict',
      'project_slug', v_current.project_slug,
      'updated_at', v_current.updated_at,
      'access_version', v_current.access_version
    );
  end if;

  update public.project_page_settings
  set access_password_hash = p_password_hash,
      access_version = access_version + 1
  where project_slug = p_project_slug
  returning updated_at, access_version
  into v_updated_at, v_access_version;

  return jsonb_build_object(
    'status', 'updated',
    'project_slug', p_project_slug,
    'updated_at', v_updated_at,
    'access_version', v_access_version
  );
end;
$$;

revoke all on function public.admin_update_project_access_password(
  text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.admin_update_project_access_password(
  text, timestamptz, text
) to service_role;

notify pgrst, 'reload schema';
