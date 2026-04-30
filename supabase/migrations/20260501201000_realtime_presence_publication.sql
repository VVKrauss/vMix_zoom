-- Enable Realtime for presence mirror table.
-- Required for `postgres_changes` subscriptions on `public.user_presence_public`.

alter publication supabase_realtime add table public.user_presence_public;

-- Messenger realtime also listens to membership/read changes.
alter publication supabase_realtime add table public.chat_conversation_members;

