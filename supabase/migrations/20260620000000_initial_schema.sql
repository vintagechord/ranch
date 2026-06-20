create extension if not exists "pgcrypto";

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

create table if not exists public.piggy_bank (
  id integer primary key default 1 check (id = 1),
  created_at timestamptz not null default now(),
  balance_amount integer not null default 0 check (balance_amount >= 0),
  updated_at timestamptz not null default now()
);

insert into public.piggy_bank (id, balance_amount)
values (1, 0)
on conflict (id) do nothing;

alter table public.piggy_bank enable row level security;
