-- Harden chat access and support rate-limiting queries.

-- Remove public read policy. Chat reads must go through authenticated API routes.
drop policy if exists chat_messages_read_policy on public.chat_messages;

-- Indexes used by API-side throttling and sync pagination.
create index if not exists chat_messages_rate_sender_idx
  on public.chat_messages (game_id, sender, created_at desc);

create index if not exists chat_nonces_rate_address_idx
  on public.chat_nonces (game_id, address, created_at desc);

-- Realtime channel is not used in hardened mode; remove table from publication if present.
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime drop table public.chat_messages;
  end if;
end
$$;
