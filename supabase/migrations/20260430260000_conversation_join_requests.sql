-- Conversation join requests + subscription access.

alter table public.chat_conversations
  add column if not exists required_subscription_plan text null;

comment on column public.chat_conversations.required_subscription_plan is 'Required subscription plan title for join request or access to this group/channel';

create table if not exists public.chat_conversation_join_requests (
  request_id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint chat_conversation_join_requests_unique_request unique (conversation_id, user_id)
);

create index if not exists chat_conversation_join_requests_conversation_idx
  on public.chat_conversation_join_requests (conversation_id);

create or replace function public.has_pending_conversation_join_request(
  p_conversation_id uuid
)
returns boolean
language sql
security definer
set search_path to 'public', 'auth'
as $$
  select exists (
    select 1
    from public.chat_conversation_join_requests r
    where r.conversation_id = p_conversation_id
      and r.user_id = auth.uid()
  );
$$;

grant execute on function public.has_pending_conversation_join_request(uuid) to authenticated;

create or replace function public.request_conversation_join(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_required_plan text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_conversation_id is null then
    return jsonb_build_object('ok', false, 'error', 'conversation_required');
  end if;

  if exists (
    select 1
    from public.chat_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = v_me
  ) then
    return jsonb_build_object('ok', true, 'already_member', true);
  end if;

  select c.required_subscription_plan
  into v_required_plan
  from public.chat_conversations c
  where c.id = p_conversation_id
    and c.closed_at is null
    and c.kind in ('group', 'channel')
  limit 1;

  if v_required_plan is not null then
    if not exists (
      select 1
      from public.account_subscriptions s
      join public.subscription_plans p on p.id = s.subscription_plan_id
      where s.user_id = v_me
        and s.status = 'active'
        and p.title = v_required_plan
    ) then
      return jsonb_build_object('ok', false, 'error', 'subscription_required', 'required_plan', v_required_plan);
    end if;
  end if;

  insert into public.chat_conversation_join_requests (conversation_id, user_id)
  values (p_conversation_id, v_me)
  on conflict (conversation_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'requested', true);
end;
$$;

grant execute on function public.request_conversation_join(uuid) to authenticated;

create or replace function public.list_conversation_join_requests(
  p_conversation_id uuid
)
returns table (
  request_id uuid,
  user_id uuid,
  display_name text,
  created_at timestamptz
)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  select r.request_id,
         r.user_id,
         coalesce(u.display_name, 'Пользователь')::text,
         r.created_at
  from public.chat_conversation_join_requests r
  join public.chat_conversations c on c.id = r.conversation_id
  join public.users u on u.id = r.user_id
  where r.conversation_id = p_conversation_id
    and (
      public.is_group_admin(p_conversation_id, auth.uid())
      or public.is_channel_admin(p_conversation_id, auth.uid())
    )
  order by r.created_at asc;
$$;

grant execute on function public.list_conversation_join_requests(uuid) to authenticated;

create or replace function public.approve_conversation_join_request(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_request record;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_request_id is null then
    return jsonb_build_object('ok', false, 'error', 'request_required');
  end if;

  select r.conversation_id, r.user_id
  into v_request
  from public.chat_conversation_join_requests r
  where r.request_id = p_request_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not (
      public.is_group_admin(v_request.conversation_id, v_me)
      or public.is_channel_admin(v_request.conversation_id, v_me)
    ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  insert into public.chat_conversation_members (conversation_id, user_id, role)
  values (v_request.conversation_id, v_request.user_id, 'member')
  on conflict (conversation_id, user_id) do nothing;

  delete from public.chat_conversation_join_requests
  where request_id = p_request_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.approve_conversation_join_request(uuid) to authenticated;

create or replace function public.deny_conversation_join_request(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_me uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'auth_required');
  end if;
  if p_request_id is null then
    return jsonb_build_object('ok', false, 'error', 'request_required');
  end if;

  select conversation_id into v_conversation_id
  from public.chat_conversation_join_requests
  where request_id = p_request_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not (
      public.is_group_admin(v_conversation_id, v_me)
      or public.is_channel_admin(v_conversation_id, v_me)
    ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  delete from public.chat_conversation_join_requests
  where request_id = p_request_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.deny_conversation_join_request(uuid) to authenticated;
