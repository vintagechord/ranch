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
