import type { ReactNode } from 'react'
import { useCallback, useRef, useState } from 'react'
import type { DirectMessage, DmOutgoingReceiptLevel } from '../../lib/messenger'
import { isDmSoftDeletedStub } from '../../lib/messenger'
import { DmOutgoingReceiptGlyph } from './DmOutgoingReceiptGlyph'
import { DoubleTapHeartSurface } from './DoubleTapHeartSurface'
import { MessengerBubbleBody, type MessengerImageLightboxOpen } from '../MessengerBubbleBody'
import { MessengerReplyMiniThumb } from '../MessengerReplyMiniThumb'
import { messengerPeerDisplayTitle } from '../../lib/messengerDashboardUtils'

export type ThreadReplyPreview =
  | { snippet: string; kind: 'text'; quotedAvatarUrl: string | null; quotedName?: string }
  | { snippet: string; kind: 'image'; thumbPath?: string; quotedAvatarUrl: string | null; quotedName?: string }

const SWIPE_REPLY_THRESHOLD_PX = 52
const SWIPE_REPLY_DECIDE_PX = 26
const SWIPE_REPLY_MAX_SHIFT_PX = 80

export type ThreadMessageBubbleProps = {
  message: DirectMessage
  isOwn: boolean
  /** Личный диалог: не показывать имена/аватары в шапке бабла и в цитате (ни у собеседника, ни у себя). */
  dmMutePeerLabels?: boolean
  /** ЛС: статус исходящего (контур / половина / полный круг). */
  dmOutgoingReceipt?: DmOutgoingReceiptLevel | null
  reactions: DirectMessage[]
  formatDt: (iso: string) => string
  replyPreview: ThreadReplyPreview | null
  /** Если цитируемое сообщение есть в ленте — прокрутка к нему по клику. */
  replyScrollTargetId: string | null
  onReplyQuoteNavigate?: (messageId: string) => void
  bindMessageAnchor: (messageId: string, el: HTMLElement | null) => void
  currentUserId: string | null
  onReactionChipTap?: (targetMessageId: string, emoji: string) => void
  /** Мобилка: свайп пузыря влево — ответить на сообщение. */
  swipeReplyEnabled?: boolean
  onSwipeReply?: (message: DirectMessage) => void
  menuOpen: boolean
  onMenuButtonClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  onBubbleContextMenu: (e: React.MouseEvent<HTMLElement>) => void
  onOpenImageLightbox?: (ctx: MessengerImageLightboxOpen) => void
  /** Кастомный рендер тела (например, markdown в канале). */
  renderBody?: (message: DirectMessage) => ReactNode
  onMentionSlug?: (slug: string) => void
  onInlineImageLayout?: () => void
  onReplyThumbLayout?: () => void
  /** Двойной тап по телу сообщения: только добавить лайк (без снятия). */
  quickReactEnabled?: boolean
  isMobileMessenger?: boolean
  onQuickHeart?: () => void
  /** Лёгкая анимация появления (только для новых входящих). */
  enterAnim?: boolean
  /** Группа/канал: локальные имена отправителей для текущего пользователя. */
  peerAliasByUserId?: Record<string, string>
}

export function ThreadMessageBubble({
  message,
  isOwn,
  dmMutePeerLabels,
  dmOutgoingReceipt = null,
  reactions,
  formatDt,
  replyPreview,
  replyScrollTargetId,
  onReplyQuoteNavigate,
  bindMessageAnchor,
  currentUserId,
  onReactionChipTap,
  swipeReplyEnabled,
  onSwipeReply,
  menuOpen,
  onMenuButtonClick,
  onBubbleContextMenu,
  onOpenImageLightbox,
  renderBody,
  onMentionSlug,
  onInlineImageLayout,
  onReplyThumbLayout,
  quickReactEnabled,
  isMobileMessenger,
  onQuickHeart,
  enterAnim = false,
  peerAliasByUserId,
}: ThreadMessageBubbleProps) {
  const [swipeTx, setSwipeTx] = useState(0)
  const swipeRef = useRef<{
    pointerId: number | null
    x0: number
    y0: number
    active: boolean
    decided: boolean
    cancelled: boolean
    captured: boolean
  }>({
    pointerId: null,
    x0: 0,
    y0: 0,
    active: false,
    decided: false,
    cancelled: false,
    captured: false,
  })

  const reactionCounts = new Map<string, number>()
  for (const r of reactions) {
    const key = r.body.trim() || r.body
    reactionCounts.set(key, (reactionCounts.get(key) ?? 0) + 1)
  }

  const forwardInfoLabel =
    typeof message.meta?.forward_info?.label === 'string' ? message.meta?.forward_info?.label.trim() : ''
  const showForwardInfoLine = Boolean(forwardInfoLabel && message.meta?.forward_info?.hidden !== true)

  const replyNavOk = Boolean(replyScrollTargetId && onReplyQuoteNavigate)

  const canSwipeReply =
    Boolean(swipeReplyEnabled && onSwipeReply) &&
    (message.kind === 'text' || message.kind === 'image' || message.kind === 'audio') &&
    !message.id.startsWith('local-')

  const endSwipeGesture = useCallback(
    (e: React.PointerEvent<HTMLElement>, el: HTMLElement) => {
      const s = swipeRef.current
      if (!s.active || e.pointerId !== s.pointerId) return
      const dx = e.clientX - s.x0
      const dy = e.clientY - s.y0
      s.active = false
      if (s.captured) {
        try {
          el.releasePointerCapture(e.pointerId)
        } catch {
          /* already released */
        }
      }
      swipeRef.current = {
        pointerId: null,
        x0: 0,
        y0: 0,
        active: false,
        decided: false,
        cancelled: false,
        captured: false,
      }
      setSwipeTx(0)
      const horizontalIntent =
        Math.abs(dx) > Math.abs(dy) &&
        dx <= -SWIPE_REPLY_THRESHOLD_PX &&
        Math.abs(dx) >= SWIPE_REPLY_THRESHOLD_PX
      if (!s.cancelled && horizontalIntent) {
        onSwipeReply?.(message)
      }
    },
    [message, onSwipeReply],
  )

  const quotePreview: ThreadReplyPreview | null = replyPreview

  const showPeerInReplyQuote = !dmMutePeerLabels

  const replyQuoteInner =
    quotePreview ? (
      <span className="dashboard-messenger__reply-quote-inner">
        {showPeerInReplyQuote ? (
          quotePreview.quotedAvatarUrl ? (
            <img
              src={quotePreview.quotedAvatarUrl}
              alt=""
              className="dashboard-messenger__reply-quote-avatar"
              draggable={false}
            />
          ) : (
            <span className="dashboard-messenger__reply-quote-avatar dashboard-messenger__reply-quote-avatar--fallback" aria-hidden>
              {(quotePreview.quotedName ?? '?').trim().slice(0, 1).toUpperCase() || '?'}
            </span>
          )
        ) : null}
        {quotePreview.kind === 'image' && quotePreview.thumbPath ? (
          <MessengerReplyMiniThumb thumbPath={quotePreview.thumbPath} onThumbLayout={onReplyThumbLayout} />
        ) : null}
        <span className="dashboard-messenger__reply-quote-snippet">{quotePreview.snippet}</span>
      </span>
    ) : null

  const replyQuoteAria =
    dmMutePeerLabels || !quotePreview?.quotedName?.trim()
      ? 'К цитируемому сообщению'
      : `К цитируемому сообщению: ${quotePreview.quotedName.trim()}`

  const showAuthorInMeta = !dmMutePeerLabels

  if (isDmSoftDeletedStub(message)) {
    const whoRaw =
      typeof message.senderNameSnapshot === 'string' && message.senderNameSnapshot.trim()
        ? message.senderNameSnapshot.trim()
        : 'Кто-то'
    const who = peerAliasByUserId
      ? messengerPeerDisplayTitle(message.senderUserId, whoRaw, peerAliasByUserId, currentUserId).trim() || 'Кто-то'
      : whoRaw
    return (
      <div
        ref={(el) => {
          bindMessageAnchor(message.id, el)
        }}
        className="dashboard-messenger__dm-deleted-plain"
        aria-label={`${who} удалил(а) сообщение`}
      >
        {who} удалил(а) сообщение
      </div>
    )
  }

  return (
    <article
      ref={(el) => {
        bindMessageAnchor(message.id, el)
      }}
      className={`dashboard-messenger__message${isOwn ? ' dashboard-messenger__message--own' : ''}${
        canSwipeReply ? ' dashboard-messenger__message--swipe-reply' : ''
      }${message.kind === 'image' ? ' dashboard-messenger__message--image' : ''}${enterAnim ? ' dashboard-messenger__message--enter' : ''}`}
      style={
        swipeTx !== 0
          ? { transform: `translateX(${swipeTx}px)`, transition: 'none' }
          : { transform: undefined, transition: 'transform 0.18s ease-out' }
      }
      onPointerDown={(e) => {
        if (!canSwipeReply || e.button !== 0) return
        const t = e.target as HTMLElement
        if (
          t.closest(
            'button, a, .messenger-message-img-trigger, .dashboard-messenger__reaction-chip, .messenger-message-link',
          )
        ) {
          return
        }
        swipeRef.current = {
          pointerId: e.pointerId,
          x0: e.clientX,
          y0: e.clientY,
          active: true,
          decided: false,
          cancelled: false,
          captured: false,
        }
      }}
      onPointerMove={(e) => {
        const s = swipeRef.current
        if (!canSwipeReply || !s.active || e.pointerId !== s.pointerId) return
        const dx = e.clientX - s.x0
        const dy = e.clientY - s.y0
        if (!s.decided && (Math.abs(dx) > SWIPE_REPLY_DECIDE_PX || Math.abs(dy) > SWIPE_REPLY_DECIDE_PX)) {
          s.decided = true
          /* Вертикаль (скролл ленты) или без явного смещения влево — не ответ */
          if (Math.abs(dy) >= Math.abs(dx) || dx > -SWIPE_REPLY_DECIDE_PX) {
            s.cancelled = true
            setSwipeTx(0)
            return
          }
          s.captured = true
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }
        if (s.cancelled || !s.decided) return
        const tx = Math.max(-SWIPE_REPLY_MAX_SHIFT_PX, Math.min(0, dx))
        setSwipeTx(tx)
      }}
      onPointerUp={(e) => endSwipeGesture(e, e.currentTarget)}
      onPointerCancel={(e) => endSwipeGesture(e, e.currentTarget)}
      onContextMenu={onBubbleContextMenu}
    >
      <div className="dashboard-messenger__message-meta">
        <div className="dashboard-messenger__message-meta-main">
          {showAuthorInMeta ? (
            <span className="dashboard-messenger__message-author">
              {peerAliasByUserId
                ? messengerPeerDisplayTitle(
                    message.senderUserId,
                    typeof message.senderNameSnapshot === 'string' ? message.senderNameSnapshot : '',
                    peerAliasByUserId,
                    currentUserId,
                  )
                : message.senderNameSnapshot}
            </span>
          ) : null}
          {message.editedAt ? <span className="dashboard-messenger__edited">изм.</span> : null}
        </div>
      </div>
      {quotePreview ? (
        replyNavOk ? (
          <button
            type="button"
            className="dashboard-messenger__reply-quote dashboard-messenger__reply-quote--action"
            aria-label={replyQuoteAria}
            onClick={() => onReplyQuoteNavigate?.(replyScrollTargetId!)}
          >
            {replyQuoteInner}
          </button>
        ) : (
          <div className="dashboard-messenger__reply-quote" role="note">
            {replyQuoteInner}
          </div>
        )
      ) : null}
      {showForwardInfoLine ? (
        <div className="dashboard-messenger__forward-line" role="note">
          ↪ Переслано из {forwardInfoLabel}
        </div>
      ) : null}
      <div className="dashboard-messenger__message-bottom-row">
        <DoubleTapHeartSurface
          enabled={Boolean(quickReactEnabled && onQuickHeart)}
          isMobileViewport={Boolean(isMobileMessenger)}
          onHeart={() => onQuickHeart?.()}
          className="dashboard-messenger__message-body"
        >
          {renderBody ? (
            renderBody(message)
          ) : (
            <MessengerBubbleBody
              message={message}
              onOpenImageLightbox={onOpenImageLightbox}
              onInlineImageLayout={onInlineImageLayout}
              onMentionSlug={onMentionSlug}
            />
          )}
        </DoubleTapHeartSurface>
        <button
          type="button"
          className={`dashboard-messenger__msg-more dashboard-messenger__msg-more--inline${
            menuOpen ? ' dashboard-messenger__msg-more--open' : ''
          }`}
          aria-label="Действия с сообщением"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          title={formatDt(message.createdAt)}
          onClick={onMenuButtonClick}
        >
          ⋮
        </button>
      </div>
      {reactionCounts.size > 0 ? (
        <div
          className="dashboard-messenger__message-reactions"
          aria-label="Реакции"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {[...reactionCounts.entries()].map(([emoji, count]) => {
            const mine = Boolean(
              currentUserId &&
                reactions.some(
                  (r) => r.senderUserId === currentUserId && (r.body.trim() || r.body) === emoji,
                ),
            )
            return (
              <span
                key={emoji}
                className={`dashboard-messenger__reaction-chip${mine ? ' dashboard-messenger__reaction-chip--mine' : ''}`}
                role={mine ? 'button' : undefined}
                tabIndex={mine ? 0 : undefined}
                onClick={
                  mine
                    ? (e) => {
                        e.stopPropagation()
                        onReactionChipTap?.(message.id, emoji)
                      }
                    : undefined
                }
                onKeyDown={
                  mine
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          onReactionChipTap?.(message.id, emoji)
                        }
                      }
                    : undefined
                }
              >
                <span className="dashboard-messenger__reaction-emoji">{emoji}</span>
                {count > 1 ? <span className="dashboard-messenger__reaction-count">{count}</span> : null}
              </span>
            )
          })}
        </div>
      ) : null}
      {isOwn && dmOutgoingReceipt ? (
        <span
          className={`dashboard-messenger__dm-receipt dashboard-messenger__dm-receipt--${dmOutgoingReceipt} dashboard-messenger__dm-receipt--outside`}
          aria-label={
            dmOutgoingReceipt === 'pending'
              ? 'Отправка'
              : dmOutgoingReceipt === 'read'
                ? 'Прочитано'
                : dmOutgoingReceipt === 'delivered'
                  ? 'Доставлено'
                  : 'Отправлено'
          }
        >
          <DmOutgoingReceiptGlyph level={dmOutgoingReceipt} messageId={message.id} />
        </span>
      ) : null}
    </article>
  )
}

// (moved to src/components/messenger/DmOutgoingReceiptGlyph.tsx)
