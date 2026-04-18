-- Исправление: политика select_peers с EXISTS по chat_conversation_members давала
-- «infinite recursion detected in policy for relation chat_conversation_members».

drop policy if exists chat_conversation_members_select_peers on public.chat_conversation_members;

create or replace function public.user_is_member_of_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.chat_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = auth.uid()
  );
$$;

comment on function public.user_is_member_of_conversation(uuid) is
  'Проверка членства без рекурсии RLS (для политики select_peers).';

grant execute on function public.user_is_member_of_conversation(uuid) to authenticated;

create policy chat_conversation_members_select_peers
on public.chat_conversation_members
for select
to authenticated
using (public.user_is_member_of_conversation(conversation_id));
