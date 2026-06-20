alter table public.ranch_applications enable row level security;

grant usage on schema public to anon;
grant insert on table public.ranch_applications to anon;

drop policy if exists "Allow public ranch application inserts" on public.ranch_applications;

create policy "Allow public ranch application inserts"
  on public.ranch_applications
  for insert
  to anon
  with check (
    length(btrim(name)) > 0
    and phone is not null
    and length(btrim(phone)) > 0
  );
