drop policy if exists chat_conversation_members_select_member
on public.chat_conversation_members;

drop policy if exists chat_conversations_select_member
on public.chat_conversations;

drop policy if exists chat_messages_select_member
on public.chat_messages;

create policy chat_conversation_members_select_member
on public.chat_conversation_members
for select
to authenticated
using (user_id = auth.uid());

create policy chat_conversations_select_member
on public.chat_conversations
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_conversation_members m
    where m.conversation_id = chat_conversations.id
      and m.user_id = auth.uid()
  )
);

create policy chat_messages_select_member
on public.chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.chat_conversation_members m
    where m.conversation_id = chat_messages.conversation_id
      and m.user_id = auth.uid()
  )
);
