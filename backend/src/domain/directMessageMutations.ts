import type { Pool } from 'pg'
import { assertConversationMember } from './conversationAuthz.js'

function clampBody(s: string, max = 4000): string {
  const t = String(s ?? '').slice(0, max)
  return t
}

function buildPreview(kind: string, body: string, meta: any): string {
  if (kind === 'image') return 'Изображение'
  if (kind === 'audio') return 'Голосовое'
  const raw = String(body ?? '').trim()
  return raw.length > 280 ? raw.slice(0, 280) : raw
}

async function refreshConversationPreview(pool: Pool, conversationId: string): Promise<void> {
  const last = await pool.query<{ created_at: string; preview: string }>(
    `
    select
      m.created_at,
      left(coalesce(m.body, ''), 280) as preview
    from public.chat_messages m
    where m.conversation_id = $1
      and m.kind in ('text','system','image','audio')
    order by m.created_at desc, m.id desc
    limit 1
    `,
    [conversationId],
  )
  const lastAt = last.rows[0]?.created_at ?? null
  const lastPreview = last.rows[0]?.preview ?? null
  await pool.query(
    `update public.chat_conversations
        set last_message_at = $2,
            last_message_preview = $3
      where id = $1`,
    [conversationId, lastAt, lastPreview],
  )
}

export async function markDirectConversationRead(pool: Pool, userId: string, conversationId: string): Promise<unknown> {
  const cid = conversationId.trim()
  await assertConversationMember(pool, cid, userId)
  const r = await pool.query(
    `update public.chat_conversation_members set last_read_at = now() where conversation_id = $1 and user_id = $2`,
    [cid, userId],
  )
  return { ok: true, updated: r.rowCount }
}

export async function appendDirectMessage(
  pool: Pool,
  args: {
    userId: string
    conversationId: string
    body: string
    kind: 'text' | 'system' | 'image' | 'audio' | 'reaction'
    meta: any
    replyToMessageId?: string | null
    quoteToMessageId?: string | null
  },
): Promise<unknown> {
  const cid = args.conversationId.trim()
  await assertConversationMember(pool, cid, args.userId)

  const kind = args.kind
  const body = clampBody(args.body)
  const meta = args.meta ?? {}
  const replyTo = (args.replyToMessageId ?? '').trim() || null
  const quoteTo = (args.quoteToMessageId ?? '').trim() || null

  if (kind === 'image') {
    const path = String(meta?.image?.path ?? '').trim() || (Array.isArray(meta?.images) ? String(meta.images?.[0]?.path ?? '').trim() : '')
    if (!path) throw Object.assign(new Error('image_path_required'), { statusCode: 400 })
  } else if (kind === 'audio') {
    const path = String(meta?.audio?.path ?? '').trim()
    if (!path) throw Object.assign(new Error('audio_path_required'), { statusCode: 400 })
  } else if (kind === 'text' || kind === 'system') {
    if (!String(body ?? '').trim()) throw Object.assign(new Error('message_body_required'), { statusCode: 400 })
  } else {
    throw Object.assign(new Error('bad_kind'), { statusCode: 400 })
  }

  const checkTarget = async (id: string, code: string) => {
    const r = await pool.query(
      `select 1 from public.chat_messages where id = $1 and conversation_id = $2 and kind in ('text','system','image','audio') limit 1`,
      [id, cid],
    )
    if (!r.rowCount) throw Object.assign(new Error(code), { statusCode: 400 })
  }
  if (replyTo) await checkTarget(replyTo, 'reply_target_invalid')
  if (quoteTo) await checkTarget(quoteTo, 'quote_target_invalid')

  const createdAt = new Date().toISOString()
  const inserted = await pool.query<{ id: string }>(
    `
      insert into public.chat_messages (
        conversation_id,
        sender_user_id,
        sender_name_snapshot,
        kind,
        body,
        meta,
        created_at,
        reply_to_message_id,
        quote_to_message_id
      )
      values ($1,$2,'Вы',$3,$4,$5,$6,$7,$8)
      returning id
    `,
    [cid, args.userId, kind, body, meta, createdAt, replyTo, quoteTo],
  )
  const messageId = inserted.rows[0]?.id
  if (!messageId) throw new Error('insert_failed')

  const preview = buildPreview(kind, body, meta)
  await pool.query(
    `update public.chat_conversations
        set last_message_at = $2,
            last_message_preview = $3,
            message_count = coalesce(message_count,0) + 1
      where id = $1`,
    [cid, createdAt, preview],
  )

  return { ok: true, message_id: messageId, created_at: createdAt }
}

export async function toggleDirectMessageReaction(
  pool: Pool,
  args: { userId: string; conversationId: string; targetMessageId: string; emoji: string },
): Promise<unknown> {
  const cid = args.conversationId.trim()
  const mid = args.targetMessageId.trim()
  const emoji = String(args.emoji ?? '').trim().slice(0, 32)
  if (!emoji) throw Object.assign(new Error('invalid_reaction_emoji'), { statusCode: 400 })
  await assertConversationMember(pool, cid, args.userId)

  const target = await pool.query(
    `select 1 from public.chat_messages where id = $1 and conversation_id = $2 and kind in ('text','system','image','audio') limit 1`,
    [mid, cid],
  )
  if (!target.rowCount) throw Object.assign(new Error('target_not_found'), { statusCode: 404 })

  const existing = await pool.query<{ id: string }>(
    `select id from public.chat_messages
      where conversation_id = $1
        and sender_user_id = $2
        and kind = 'reaction'
        and body = $3
        and coalesce(meta ->> 'react_to','') = $4
      limit 1`,
    [cid, args.userId, emoji, mid],
  )
  if (existing.rows[0]?.id) {
    await pool.query(`delete from public.chat_messages where id = $1`, [existing.rows[0].id])
    await refreshConversationPreview(pool, cid)
    return { ok: true, action: 'removed', message_id: existing.rows[0].id, created_at: null }
  }

  const createdAt = new Date().toISOString()
  const inserted = await pool.query<{ id: string }>(
    `insert into public.chat_messages (conversation_id, sender_user_id, sender_name_snapshot, kind, body, meta, created_at)
     values ($1,$2,'Вы','reaction',$3,$4,$5)
     returning id`,
    [cid, args.userId, emoji, { react_to: mid }, createdAt],
  )
  const id = inserted.rows[0]?.id
  if (!id) throw new Error('insert_failed')
  // reaction should not override sidebar preview; keep preview based on latest non-reaction
  await refreshConversationPreview(pool, cid)
  return { ok: true, action: 'added', message_id: id, created_at: createdAt }
}

export async function editDirectMessage(
  pool: Pool,
  args: { userId: string; conversationId: string; messageId: string; newBody: string },
): Promise<unknown> {
  const cid = args.conversationId.trim()
  const mid = args.messageId.trim()
  const body = clampBody(args.newBody)
  if (!body.trim()) throw Object.assign(new Error('message_body_required'), { statusCode: 400 })
  await assertConversationMember(pool, cid, args.userId)

  const r = await pool.query(
    `update public.chat_messages
        set body = $4,
            edited_at = now()
      where id = $1
        and conversation_id = $2
        and sender_user_id = $3
        and kind in ('text','system')
    `,
    [mid, cid, args.userId, body],
  )
  if (!r.rowCount) throw Object.assign(new Error('not_editable'), { statusCode: 403 })
  await refreshConversationPreview(pool, cid)
  return { ok: true }
}

export async function deleteDirectMessage(
  pool: Pool,
  args: { userId: string; conversationId: string; messageId: string },
): Promise<unknown> {
  const cid = args.conversationId.trim()
  const mid = args.messageId.trim()
  await assertConversationMember(pool, cid, args.userId)

  const r = await pool.query(
    `delete from public.chat_messages
      where id = $1
        and conversation_id = $2
        and sender_user_id = $3`,
    [mid, cid, args.userId],
  )
  if (!r.rowCount) throw Object.assign(new Error('not_deletable'), { statusCode: 403 })

  await pool.query(
    `update public.chat_conversations set message_count = greatest(0, coalesce(message_count,0) - 1) where id = $1`,
    [cid],
  )
  await refreshConversationPreview(pool, cid)
  return { ok: true }
}

