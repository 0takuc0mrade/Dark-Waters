-- Dark Waters in-game chat schema (Supabase)

create table if not exists public.chat_messages (
  id bigserial primary key,
  game_id bigint not null,
  sender text not null,
  message text not null check (char_length(message) between 1 and 280),
  client_msg_id text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists chat_messages_game_client_msg_uidx
  on public.chat_messages (game_id, client_msg_id);

create index if not exists chat_messages_game_created_idx
  on public.chat_messages (game_id, created_at desc);

create table if not exists public.chat_nonces (
  id bigserial primary key,
  game_id bigint not null,
  address text not null,
  nonce text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists chat_nonces_game_address_nonce_uidx
  on public.chat_nonces (game_id, address, nonce);

create index if not exists chat_nonces_lookup_idx
  on public.chat_nonces (game_id, address, used, expires_at desc);

create index if not exists chat_nonces_expiry_idx
  on public.chat_nonces (expires_at);

alter table public.chat_messages enable row level security;
alter table public.chat_nonces enable row level security;

-- MVP policy: allow read for realtime subscriptions from anon/authenticated clients.
-- Writes still go through Next.js API using service role.
drop policy if exists chat_messages_read_policy on public.chat_messages;
create policy chat_messages_read_policy
on public.chat_messages
for select
to anon, authenticated
using (true);

-- Keep nonce table backend-only.

-- Realtime stream for inserted messages.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end
$$;
