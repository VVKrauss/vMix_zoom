-- Заполнить reply_preview для уже существующих ответов/цитат (до введения колонки).

update public.chat_messages c
set reply_preview = public.reply_preview_json_from_message_row(
  p.kind,
  p.body,
  p.meta,
  p.sender_name_snapshot,
  p.sender_user_id
)
from public.chat_messages p
where c.reply_preview is null
  and coalesce(c.quote_to_message_id, c.reply_to_message_id) is not null
  and p.id = coalesce(c.quote_to_message_id, c.reply_to_message_id)
  and p.conversation_id = c.conversation_id
  and p.kind in ('text', 'system', 'image', 'audio');
