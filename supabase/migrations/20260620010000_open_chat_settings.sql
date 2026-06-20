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
