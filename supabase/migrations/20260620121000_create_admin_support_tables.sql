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

create table if not exists public.open_chat_settings (
  id integer primary key default 1 check (id = 1),
  created_at timestamptz not null default now(),
  chat_url text,
  updated_at timestamptz not null default now()
);

insert into public.open_chat_settings (id, chat_url)
values (1, null)
on conflict (id) do nothing;

alter table public.open_chat_settings enable row level security;
