create table if not exists ranch_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  instagram text,
  attendees integer,
  message text,
  created_at timestamptz default now()
);

alter table ranch_applications enable row level security;

drop policy if exists "Allow public ranch application inserts" on ranch_applications;

create policy "Allow public ranch application inserts"
  on ranch_applications
  for insert
  to anon
  with check (
    length(btrim(name)) > 0
    and phone is not null
    and length(btrim(phone)) > 0
  );

grant insert on table ranch_applications to anon;
