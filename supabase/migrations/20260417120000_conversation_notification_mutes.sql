-- Per-conversation notifications mute (for web-push + in-app).
-- Stores user preference: muted/unmuted for a conversation.

create table if not exists public.chat_conversation_notification_mutes (
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  muted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create index if not exists chat_conversation_notification_mutes_conversation_idx
  on public.chat_conversation_notification_mutes (conversation_id);

alter table public.chat_conversation_notification_mutes enable row level security;

grant select, insert, update, delete on public.chat_conversation_notification_mutes to authenticated;
grant all on public.chat_conversation_notification_mutes to service_role;

drop policy if exists chat_conv_notif_mutes_select_own on public.chat_conversation_notification_mutes;
create policy chat_conv_notif_mutes_select_own
on public.chat_conversation_notification_mutes
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists chat_conv_notif_mutes_upsert_own on public.chat_conversation_notification_mutes;
create policy chat_conv_notif_mutes_upsert_own
on public.chat_conversation_notification_mutes
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists chat_conv_notif_mutes_update_own on public.chat_conversation_notification_mutes;
create policy chat_conv_notif_mutes_update_own
on public.chat_conversation_notification_mutes
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists chat_conv_notif_mutes_delete_own on public.chat_conversation_notification_mutes;
create policy chat_conv_notif_mutes_delete_own
on public.chat_conversation_notification_mutes
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.set_conversation_notifications_muted(
  p_conversation_id uuid,
  p_muted boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_cid uuid := p_conversation_id;
  v_muted boolean := coalesce(p_muted, true);
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if v_cid is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  -- Only members can change their settings for a conversation.
  if not exists (
    select 1
    from public.chat_conversation_members m
    where m.conversation_id = v_cid
      and m.user_id = v_me
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  insert into public.chat_conversation_notification_mutes (user_id, conversation_id, muted, updated_at)
  values (v_me, v_cid, v_muted, now())
  on conflict (user_id, conversation_id)
  do update set muted = excluded.muted, updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true, 'muted', v_muted);
end;
$$;

grant execute on function public.set_conversation_notifications_muted(uuid, boolean) to authenticated;

create or replace function public.get_my_conversation_notification_mutes(
  p_conversation_ids uuid[]
)
returns table (
  conversation_id uuid,
  muted boolean
)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select m.conversation_id, m.muted
  from public.chat_conversation_notification_mutes m
  where m.user_id = auth.uid()
    and m.conversation_id = any (p_conversation_ids);
$$;

grant execute on function public.get_my_conversation_notification_mutes(uuid[]) to authenticated;

