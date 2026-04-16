import type { DirectMessage } from './messenger'
import type { MessengerForwardMeta } from './messenger'
import { resolveQuotedAvatarForDm } from './messengerUi'
import { truncateMessengerReplySnippet } from './messengerUi'

export type ForwardQuotedStrip = {
  snippet: string
  kind: 'text' | 'image'
  quotedAvatarUrl: string | null
  quotedName?: string
  thumbPath?: string
}

export function forwardMetaToQuotedStrip(forward: MessengerForwardMeta | null | undefined): ForwardQuotedStrip | null {
  if (!forward || typeof forward.from !== 'string') return null
  if (forward.from !== 'direct' && forward.from !== 'group' && forward.from !== 'channel') return null
  const snippet = typeof forward.snippet === 'string' ? forward.snippet.trim() : ''
  const sk = forward.source_kind === 'image' ? 'image' : 'text'
  const thumbPath =
    typeof forward.image_thumb_path === 'string' && forward.image_thumb_path.trim()
      ? forward.image_thumb_path.trim()
      : undefined
  if (forward.from === 'direct') {
    const name = typeof forward.author_name === 'string' && forward.author_name.trim() ? forward.author_name.trim() : undefined
    const av =
      typeof forward.author_avatar_url === 'string' && forward.author_avatar_url.trim()
        ? forward.author_avatar_url.trim()
        : null
    return {
      snippet: snippet || (sk === 'image' ? 'Фото' : '…'),
      kind: sk,
      quotedAvatarUrl: av,
      quotedName: name,
      ...(thumbPath ? { thumbPath } : {}),
    }
  }
  const title =
    typeof forward.source_title === 'string' && forward.source_title.trim() ? forward.source_title.trim() : undefined
  const sav =
    typeof forward.source_avatar_url === 'string' && forward.source_avatar_url.trim()
      ? forward.source_avatar_url.trim()
      : null
  return {
    snippet: snippet || (sk === 'image' ? 'Фото' : '…'),
    kind: sk,
    quotedAvatarUrl: sav,
    quotedName: title,
    ...(thumbPath ? { thumbPath } : {}),
  }
}

export function buildForwardMetaFromDirectMessage(
  m: DirectMessage,
  opts: {
    currentUserId: string | undefined
    profileAvatar: string | null | undefined
    directConv: { otherUserId: string | null; avatarUrl: string | null } | null
  },
): { forward: MessengerForwardMeta; sendBody: string } {
  const sk: 'text' | 'image' = m.kind === 'image' ? 'image' : 'text'
  const thumb =
    m.kind === 'image'
      ? (m.meta?.image?.thumbPath?.trim() || m.meta?.image?.path?.trim() || null)
      : null
  const author_avatar_url = resolveQuotedAvatarForDm(
    m.senderUserId,
    opts.currentUserId,
    opts.profileAvatar,
    opts.directConv,
  )
  const body = (m.body ?? '').trim()
  const snippet =
    sk === 'image'
      ? truncateMessengerReplySnippet(body || 'Фото', 80)
      : truncateMessengerReplySnippet(body || '…', 80)
  const sendBody = sk === 'image' ? (body || 'Фото') : body || snippet || '…'
  return {
    forward: {
      from: 'direct',
      author_name: m.senderNameSnapshot?.trim() || undefined,
      author_avatar_url: author_avatar_url,
      snippet,
      source_kind: sk,
      ...(thumb ? { image_thumb_path: thumb } : {}),
    },
    sendBody,
  }
}

export function buildForwardMetaFromChannelOrGroup(
  m: DirectMessage,
  from: 'channel' | 'group',
  opts: { sourceTitle: string; sourceAvatarUrl: string | null },
): { forward: MessengerForwardMeta; sendBody: string } {
  const sk: 'text' | 'image' = m.kind === 'image' ? 'image' : 'text'
  const thumb =
    m.kind === 'image'
      ? (m.meta?.image?.thumbPath?.trim() || m.meta?.image?.path?.trim() || null)
      : null
  const body = (m.body ?? '').trim()
  const snippet =
    sk === 'image'
      ? truncateMessengerReplySnippet(body || 'Фото', 80)
      : truncateMessengerReplySnippet(body || '…', 80)
  const sendBody = sk === 'image' ? (body || 'Фото') : body || snippet || '…'
  return {
    forward: {
      from,
      source_title: opts.sourceTitle.trim() || (from === 'channel' ? 'Канал' : 'Группа'),
      source_avatar_url: opts.sourceAvatarUrl,
      snippet,
      source_kind: sk,
      ...(thumb ? { image_thumb_path: thumb } : {}),
    },
    sendBody,
  }
}
