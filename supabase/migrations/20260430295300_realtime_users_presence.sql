-- Realtime: обновления public.users (пульс / фон) → клиент подписан на строку собеседника и сразу обновляет «в сети».

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'users'
    ) then
      alter publication supabase_realtime add table public.users;
    end if;
  end if;
end;
$$;
