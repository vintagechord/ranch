alter table public.project_proposals
  add column if not exists retention_until timestamptz;

update public.project_proposals
set retention_until = consented_at + interval '1 year'
where retention_until is null;

alter table public.project_proposals
  alter column retention_until set default (now() + interval '1 year'),
  alter column retention_until set not null;

alter table public.project_proposals
  drop constraint if exists project_proposals_retention_window_check;

alter table public.project_proposals
  add constraint project_proposals_retention_window_check
  check (
    retention_until > consented_at
    and retention_until <= consented_at + interval '1 year'
  );

alter table public.project_proposals
  add column if not exists payload_hash text;

update public.project_proposals
set payload_hash = encode(extensions.digest(idempotency_key::text, 'sha256'), 'hex')
where payload_hash is null;

alter table public.project_proposals
  alter column payload_hash set not null;

alter table public.project_proposals
  drop constraint if exists project_proposals_payload_hash_check;

alter table public.project_proposals
  add constraint project_proposals_payload_hash_check
  check (payload_hash ~ '^[0-9a-f]{64}$');

drop index if exists public.project_proposals_request_fingerprint_created_at_idx;

alter table public.project_proposals
  drop column if exists request_fingerprint;

create index if not exists project_proposals_retention_until_idx
  on public.project_proposals (retention_until);

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

notify pgrst, 'reload schema';

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

revoke all on table public.ranch_applications from public, anon, authenticated;
grant select on table public.ranch_applications to service_role;
drop policy if exists "Allow public ranch application inserts" on public.ranch_applications;

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
