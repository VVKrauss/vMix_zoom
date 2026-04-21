import type { DirectMessage } from './messenger'
import { previewTextForDirectMessageTail } from './messenger'
import { truncateMessengerReplySnippet } from './messengerUi'
import { messengerPeerDisplayTitle } from './messengerDashboardUtils'

export type QuotePreview =
  | { snippet: string; kind: 'text'; quotedAvatarUrl: string | null; quotedName?: string }
  | { snippet: string; kind: 'image'; thumbPath?: string; quotedAvatarUrl: string | null; quotedName?: string }

export function buildQuotePreview({
  quotedMessageId,
  messageById,
  resolveQuotedAvatarUrl,
  viewerUserId,
  peerAliasByUserId,
}: {
  /** Id цитируемого сообщения (уже “нормализованный”: для channel comments это quote_to, для DM/group — quote_to ?? reply_to). */
  quotedMessageId: string | null
  messageById: (id: string) => DirectMessage | undefined
  resolveQuotedAvatarUrl: (senderUserId: string | null) => string | null
  /** Для групп/канала: подставить локальное имя автора цитаты. */
  viewerUserId?: string | null
  peerAliasByUserId?: Record<string, string> | null
}): { preview: QuotePreview | null; scrollTargetId: string | null } {
  const rid = quotedMessageId?.trim() || null
  if (!rid) return { preview: null, scrollTargetId: null }

  const src = messageById(rid)
  if (!src) {
    return {
      preview: {
        quotedAvatarUrl: null,
        quotedName: undefined,
        snippet: 'Нет в загруженной истории',
        kind: 'text',
      },
      scrollTargetId: null,
    }
  }

  const quotedAvatarUrl = resolveQuotedAvatarUrl(src.senderUserId ?? null)
  const quotedName = peerAliasByUserId
    ? messengerPeerDisplayTitle(
        src.senderUserId,
        typeof src.senderNameSnapshot === 'string' ? src.senderNameSnapshot : '',
        peerAliasByUserId,
        viewerUserId ?? null,
      ).trim() || undefined
    : src.senderNameSnapshot?.trim() || undefined

  if (src.kind === 'image') {
    const thumbPath = src.meta?.image?.thumbPath?.trim() || src.meta?.image?.path?.trim() || ''
    return {
      preview: {
        quotedAvatarUrl,
        quotedName,
        snippet: truncateMessengerReplySnippet(previewTextForDirectMessageTail(src)),
        kind: 'image',
        ...(thumbPath ? { thumbPath } : {}),
      },
      scrollTargetId: rid,
    }
  }

  if (src.kind === 'audio') {
    return {
      preview: {
        quotedAvatarUrl,
        quotedName,
        snippet: truncateMessengerReplySnippet(previewTextForDirectMessageTail(src)),
        kind: 'text',
      },
      scrollTargetId: rid,
    }
  }

  return {
    preview: {
      quotedAvatarUrl,
      quotedName,
      snippet: truncateMessengerReplySnippet(src.body) || '…',
      kind: 'text',
    },
    scrollTargetId: rid,
  }
}

