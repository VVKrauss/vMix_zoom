-- Realtime: обновление бейджа непрочитанных в личных чатах без перезагрузки страницы
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
    ) then
      alter publication supabase_realtime add table public.chat_messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_conversation_members'
    ) then
      alter publication supabase_realtime add table public.chat_conversation_members;
    end if;
  end if;
end $$;
