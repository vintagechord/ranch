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
