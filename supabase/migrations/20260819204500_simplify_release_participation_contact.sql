-- Keep legacy application details until retention expiry while collecting one contact method only.
alter table public.release_participation_applications
  alter column email drop not null,
  alter column availability drop not null;

alter table public.release_participation_applications
  drop constraint if exists release_participation_applications_v2_contact_check;

alter table public.release_participation_applications
  add constraint release_participation_applications_v2_contact_check
  check (
    privacy_notice_version <> '2026-08-19-release-participation-v2'
    or (
      num_nonnulls(email, phone) = 1
      and availability is null
    )
  );

notify pgrst, 'reload schema';
