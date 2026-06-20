create extension if not exists "pgcrypto";

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

create table if not exists party_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  people_count integer not null default 1,
  depositor_name text not null,
  companions text,
  auction_item text,
  advance_team boolean not null default false,
  creative_project text,
  food_note text,
  memo text,
  privacy_agreed boolean not null default false,
  payment_status text not null default '미확인',
  application_status text not null default '대기'
);

alter table party_applications enable row level security;

alter table party_applications
  add column if not exists auction_item text;

alter table party_applications
  add column if not exists creative_project text;

alter table party_applications
  add column if not exists advance_team boolean not null default false;

create table if not exists piggy_bank (
  id integer primary key default 1 check (id = 1),
  created_at timestamptz not null default now(),
  balance_amount integer not null default 0 check (balance_amount >= 0),
  updated_at timestamptz not null default now()
);

insert into piggy_bank (id, balance_amount)
values (1, 0)
on conflict (id) do nothing;

alter table piggy_bank enable row level security;

create table if not exists open_chat_settings (
  id integer primary key default 1 check (id = 1),
  created_at timestamptz not null default now(),
  chat_url text,
  updated_at timestamptz not null default now()
);

insert into open_chat_settings (id, chat_url)
values (1, null)
on conflict (id) do nothing;

alter table open_chat_settings enable row level security;
