-- Участник видит строки других участников той же беседы (нужно для last_read_at собеседника в ЛС — галочки «прочитано»).
create policy chat_conversation_members_select_peers
on public.chat_conversation_members
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_conversation_members m
    where m.conversation_id = chat_conversation_members.conversation_id
      and m.user_id = auth.uid()
  )
);
