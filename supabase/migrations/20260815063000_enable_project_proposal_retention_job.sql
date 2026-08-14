create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'purge-project-proposals-every-15-minutes',
  '*/15 * * * *',
  'select public.purge_expired_project_proposals()'
);
