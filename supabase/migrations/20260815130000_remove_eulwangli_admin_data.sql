-- The Eulwangli intake is closed and its retained application records are no longer needed.
drop table if exists public.ranch_applications restrict;

notify pgrst, 'reload schema';
