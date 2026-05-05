-- Автовступление в канал новостей проекта (@red_news) при регистрации.
-- Триггер on_auth_user_created вызывает handle_new_auth_user — дополняем функцию.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_channel_id uuid;
begin
  insert into public.users (id, email, display_name, is_email_verified, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      'User'
    ),
    coalesce(new.email_confirmed_at is not null, false),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do nothing;

  select c.id
    into v_channel_id
    from public.chat_conversations c
    where c.kind = 'channel'
      and c.closed_at is null
      and lower(btrim(coalesce(c.public_nick, ''))) = 'red_news'
    limit 1;

  if v_channel_id is not null then
    insert into public.chat_conversation_members (conversation_id, user_id, role)
    values (v_channel_id, new.id, 'member')
    on conflict (conversation_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'После insert в auth.users: строка public.users + членство в канале с public_nick red_news (если есть).';

-- Существующие пользователи без членства в канале новостей (идемпотентно)
insert into public.chat_conversation_members (conversation_id, user_id, role)
select c.id, u.id, 'member'
from public.users u
cross join lateral (
  select c2.id
  from public.chat_conversations c2
  where c2.kind = 'channel'
    and c2.closed_at is null
    and lower(btrim(coalesce(c2.public_nick, ''))) = 'red_news'
  limit 1
) c
where not exists (
  select 1
  from public.chat_conversation_members m
  where m.conversation_id = c.id
    and m.user_id = u.id
)
on conflict (conversation_id, user_id) do nothing;
