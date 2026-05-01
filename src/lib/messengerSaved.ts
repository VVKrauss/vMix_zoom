import type { DirectMessage } from './messenger'
import { appendDirectMessage, ensureSelfDirectConversation, previewTextForDirectMessageTail } from './messenger'

export type SaveToSelfSource =
  | { kind: 'direct'; conversationId: string; title: string; messageId: string }
  | { kind: 'group'; conversationId: string; title: string; messageId: string }
  | { kind: 'channel_post'; conversationId: string; title: string; postMessageId: string }
  | { kind: 'channel_comment'; conversationId: string; title: string; postId: string; commentMessageId: string }

export async function saveMessageToSelfConversation(args: {
  message: DirectMessage
  source: SaveToSelfSource
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ensured = await ensureSelfDirectConversation()
  if (ensured.error || !ensured.data) return { ok: false, error: ensured.error ?? 'ensure_failed' }
  const savedCid = ensured.data.trim()
  if (!savedCid) return { ok: false, error: 'ensure_failed' }

  const body = previewTextForDirectMessageTail(args.message)
  const label = `Сохранено из: ${args.source.title.trim() || 'Чат'}`

  const nav =
    args.source.kind === 'direct'
      ? { kind: 'dm_message', conversationId: args.source.conversationId, messageId: args.source.messageId }
      : args.source.kind === 'group'
        ? { kind: 'group_message', conversationId: args.source.conversationId, messageId: args.source.messageId }
        : args.source.kind === 'channel_post'
          ? { kind: 'channel_post', conversationId: args.source.conversationId, postMessageId: args.source.postMessageId }
          : {
              kind: 'channel_comment',
              conversationId: args.source.conversationId,
              postId: args.source.postId,
              commentMessageId: args.source.commentMessageId,
            }

  const res = await appendDirectMessage(savedCid, body, {
    kind: 'text',
    meta: {
      forward_info: {
        label,
        nav,
      },
      snapshot: {
        kind: args.message.kind,
        body: args.message.body,
        created_at: args.message.createdAt,
        sender_user_id: args.message.senderUserId,
        sender_name_snapshot: args.message.senderNameSnapshot,
        meta: args.message.meta ?? null,
      },
    },
  })

  if (res.error) return { ok: false, error: res.error }
  return { ok: true }
}

