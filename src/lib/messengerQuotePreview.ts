import type { DirectMessage, MessengerReplyPreviewStored } from './messenger'
import { previewTextForDirectMessageTail } from './messenger'
import { truncateMessengerReplySnippet } from './messengerUi'
import { messengerPeerDisplayTitle } from './messengerDashboardUtils'

export type QuotePreview =
  | { snippet: string; kind: 'text'; quotedAvatarUrl: string | null; quotedName?: string }
  | { snippet: string; kind: 'image'; thumbPath?: string; quotedAvatarUrl: string | null; quotedName?: string }

export function buildQuotePreview({
  quotedMessageId,
  quoteToMessageId,
  replyToMessageId,
  messageById,
  resolveQuotedAvatarUrl,
  viewerUserId,
  peerAliasByUserId,
  /** Денормализованное превью с сервера / optimistic — приоритетнее join по ленте. */
  replyPreviewStored,
}: {
  /**
   * Режим комментария канала: только quote_to (reply_to там — id поста, не сообщение для превью).
   */
  quotedMessageId?: string | null
  /**
   * ЛС / группа: оба поля из сообщения. Если quote_to «битый» (нет в загруженной ленте), а reply_to указывает
   * на сообщение в треде — показываем превью по reply_to (иначе ложное «Нет в загруженной истории»).
   */
  quoteToMessageId?: string | null
  replyToMessageId?: string | null
  messageById: (id: string) => DirectMessage | undefined
  resolveQuotedAvatarUrl: (senderUserId: string | null) => string | null
  /** Для групп/канала: подставить локальное имя автора цитаты. */
  viewerUserId?: string | null
  peerAliasByUserId?: Record<string, string> | null
  replyPreviewStored?: MessengerReplyPreviewStored | null
}): { preview: QuotePreview | null; scrollTargetId: string | null } {
  const dualMode =
    typeof quoteToMessageId !== 'undefined' || typeof replyToMessageId !== 'undefined'

  let rid: string | null = null
  if (dualMode) {
    const q = quoteToMessageId?.trim() || null
    const r = replyToMessageId?.trim() || null
    if (q && messageById(q)) rid = q
    else if (r && messageById(r)) rid = r
    else rid = q || r
  } else {
    rid = quotedMessageId?.trim() || null
  }

  if (!rid) return { preview: null, scrollTargetId: null }

  const stored = replyPreviewStored ?? null

  if (stored?.snippet) {
    const quotedAvatarUrl = resolveQuotedAvatarUrl(stored.senderUserId ?? null)
    const quotedName = peerAliasByUserId
      ? messengerPeerDisplayTitle(
          stored.senderUserId,
          stored.senderName,
          peerAliasByUserId,
          viewerUserId ?? null,
        ).trim() || undefined
      : stored.senderName.trim() || undefined

    if (stored.kind === 'image') {
      const thumbPath = stored.thumbPath?.trim() || ''
      return {
        preview: {
          quotedAvatarUrl,
          quotedName,
          snippet: truncateMessengerReplySnippet(stored.snippet),
          kind: 'image',
          ...(thumbPath ? { thumbPath } : {}),
        },
        scrollTargetId: rid,
      }
    }

    if (stored.kind === 'audio') {
      return {
        preview: {
          quotedAvatarUrl,
          quotedName,
          snippet: truncateMessengerReplySnippet(stored.snippet),
          kind: 'text',
        },
        scrollTargetId: rid,
      }
    }

    return {
      preview: {
        quotedAvatarUrl,
        quotedName,
        snippet: truncateMessengerReplySnippet(stored.snippet) || '…',
        kind: 'text',
      },
      scrollTargetId: rid,
    }
  }

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

