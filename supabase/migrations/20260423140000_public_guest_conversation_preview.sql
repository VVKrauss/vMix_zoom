-- Публичное превью открытой группы/канала по public_nick для гостей (anon) и авторизованных.

create or replace function public.get_public_conversation_guest_preview(
  p_public_nick text,
  p_message_limit int default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_nick text := lower(btrim(coalesce(p_public_nick, '')));
  v_lim int := greatest(1, least(coalesce(nullif(p_message_limit, 0), 40), 80));
  r record;
  v_msgs jsonb;
  v_count int;
begin
  if v_nick = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_nick');
  end if;

  select
    c.id,
    c.kind,
    c.title,
    c.public_nick,
    c.group_is_public,
    c.channel_is_public,
    c.avatar_path,
    c.avatar_thumb_path,
    c.channel_posting_mode,
    c.channel_comments_mode
  into r
  from public.chat_conversations c
  where lower(btrim(coalesce(c.public_nick, ''))) = v_nick
    and c.kind in ('group', 'channel')
    and c.closed_at is null
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if (r.kind = 'group' and r.group_is_public is distinct from true)
     or (r.kind = 'channel' and r.channel_is_public is distinct from true) then
    return jsonb_build_object('ok', false, 'error', 'not_public');
  end if;

  select count(*)::int into v_count
  from public.chat_conversation_members m
  where m.conversation_id = r.id;

  if r.kind = 'group' then
    select coalesce(
      (
        select jsonb_agg(to_jsonb(l) order by l.created_at asc, l.id asc)
        from (
          select m.*
          from public.chat_messages m
          where m.conversation_id = r.id
            and m.kind <> 'reaction'
          order by m.created_at desc, m.id desc
          limit v_lim
        ) l
      ),
      '[]'::jsonb
    ) into v_msgs;
  else
    select coalesce(
      (
        select jsonb_agg(to_jsonb(l) order by l.created_at asc, l.id asc)
        from (
          select m.*
          from public.chat_messages m
          where m.conversation_id = r.id
            and m.reply_to_message_id is null
            and m.kind in ('text', 'system', 'image')
          order by m.created_at desc, m.id desc
          limit v_lim
        ) l
      ),
      '[]'::jsonb
    ) into v_msgs;
  end if;

  return jsonb_build_object(
    'ok', true,
    'conversation_id', r.id,
    'kind', r.kind,
    'title', coalesce(
      nullif(btrim(coalesce(r.title, '')), ''),
      case when r.kind = 'channel' then 'Канал' else 'Группа' end
    ),
    'public_nick', r.public_nick,
    'member_count', coalesce(v_count, 0),
    'avatar_path', r.avatar_path,
    'avatar_thumb_path', r.avatar_thumb_path,
    'channel_posting_mode', r.channel_posting_mode,
    'channel_comments_mode', r.channel_comments_mode,
    'messages', coalesce(v_msgs, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_public_conversation_guest_preview(text, int) to anon;
grant execute on function public.get_public_conversation_guest_preview(text, int) to authenticated;
