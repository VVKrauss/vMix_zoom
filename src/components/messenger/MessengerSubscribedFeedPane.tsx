import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { useToast } from '../../context/ToastContext'
import { BrandLogoLoader } from '../BrandLogoLoader'
import { ChevronLeftIcon, FiRrIcon } from '../icons'
import {
  listChannelCommentCounts,
  listChannelReactionsForTargets,
  toggleChannelMessageReaction,
} from '../../lib/channels'
import { getMessengerImageSignedUrl } from '../../lib/messenger'
import { buildMessengerUrl, QUICK_REACTION_EMOJI } from '../../lib/messengerDashboardUtils'
import { listSubscribedChannelFeedPage, type SubscribedFeedRow } from '../../lib/messengerSubscribedFeed'
import {
  FEED_CARD_EXPAND_MAX,
  feedCardExpandedPlainSnippet,
  feedCardTeaserText,
  parsePostDraftFromMeta,
} from '../../lib/postEditor/draftUtils'

export type SubscribedFeedCardStats = {
  heartCount: number
  comments: number
  myHeart: boolean
}

export function MessengerSubscribedFeedPane(props: {
  isMobileMessenger: boolean
  navigate: NavigateFunction
  userId?: string | null
}) {
  const { isMobileMessenger, navigate, userId } = props
  const toast = useToast()
  const [rows, setRows] = useState<SubscribedFeedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<{ createdAt: string; id: string } | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const loadFirst = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await listSubscribedChannelFeedPage({ limit: 24 })
    if (res.error) {
      setError(res.error)
      setRows([])
      setHasMore(false)
      setLoading(false)
      return
    }
    const list = res.data ?? []
    setRows(list)
    const tail = list[list.length - 1]
    setCursor(tail ? { createdAt: tail.message.createdAt, id: tail.message.id } : null)
    setHasMore(res.hasMoreOlder)
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadFirst()
  }, [loadFirst])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading || !cursor) return
    setLoadingMore(true)
    const res = await listSubscribedChannelFeedPage({
      limit: 24,
      before: cursor,
    })
    setLoadingMore(false)
    if (res.error) {
      setError(res.error)
      return
    }
    const next = res.data ?? []
    if (next.length === 0) {
      setHasMore(false)
      return
    }
    setRows((prev) => {
      const seen = new Set(prev.map((r) => r.message.id))
      const merged = [...prev]
      for (const r of next) {
        if (!seen.has(r.message.id)) {
          seen.add(r.message.id)
          merged.push(r)
        }
      }
      return merged
    })
    const tail = next[next.length - 1]
    if (tail) setCursor({ createdAt: tail.message.createdAt, id: tail.message.id })
    setHasMore(res.hasMoreOlder)
  }, [cursor, hasMore, loading, loadingMore])

  useEffect(() => {
    const root = scrollRef.current
    const el = sentinelRef.current
    if (!root || !el) return
    const io = new IntersectionObserver(
      (ents) => {
        if (ents[0]?.isIntersecting) void loadMore()
      },
      { root, rootMargin: '240px', threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore])

  const openPost = (r: SubscribedFeedRow) => {
    navigate(
      buildMessengerUrl(r.conversationId, undefined, undefined, {
        messageId: r.message.id,
        postReader: true,
        feed: 'subscribed',
      }),
    )
  }

  /** Как кнопка комментариев в ленте канала: открыть канал с экраном комментариев к посту (`?post=` без `msg`). */
  const openChannelComments = (r: SubscribedFeedRow) => {
    navigate(
      buildMessengerUrl(r.conversationId, undefined, undefined, {
        parentMessageId: r.message.id,
        feed: 'subscribed',
      }),
    )
  }

  const rowsStatsKey = useMemo(
    () => rows.map((r) => `${r.conversationId}:${r.message.id}`).join('|'),
    [rows],
  )
  const [statsByKey, setStatsByKey] = useState<Record<string, SubscribedFeedCardStats>>({})
  const reactionOpInFlightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (rows.length === 0) {
      setStatsByKey({})
      return
    }
    const uid = userId?.trim() ?? ''
    let cancelled = false
    void (async () => {
      const byConvo = new Map<string, SubscribedFeedRow[]>()
      for (const r of rows) {
        const arr = byConvo.get(r.conversationId) ?? []
        arr.push(r)
        byConvo.set(r.conversationId, arr)
      }
      const next: Record<string, SubscribedFeedCardStats> = {}
      for (const [convId, list] of byConvo) {
        const ids = list.map((x) => x.message.id)
        const [cc, rr] = await Promise.all([
          listChannelCommentCounts(convId, ids),
          listChannelReactionsForTargets(convId, ids),
        ])
        if (cancelled) return
        if (cc.error || rr.error || !cc.data || rr.data == null) {
          for (const r of list) {
            next[`${r.conversationId}-${r.message.id}`] = { heartCount: 0, comments: 0, myHeart: false }
          }
          continue
        }
        const commentMap = cc.data
        const reactions = rr.data
        for (const row of list) {
          const postId = row.message.id.trim()
          let heartCount = 0
          let myHeart = false
          for (const m of reactions) {
            if (m.kind !== 'reaction') continue
            const tid = m.meta?.react_to?.trim()
            if (!tid || tid !== postId) continue
            if ((m.body ?? '').trim() !== QUICK_REACTION_EMOJI) continue
            heartCount += 1
            if (uid && m.senderUserId === uid) myHeart = true
          }
          const key = `${row.conversationId}-${postId}`
          next[key] = {
            heartCount,
            comments: commentMap[postId] ?? 0,
            myHeart,
          }
        }
      }
      if (!cancelled) setStatsByKey(next)
    })()
    return () => {
      cancelled = true
    }
  }, [rowsStatsKey, userId])

  const toggleHeartForPost = useCallback(
    async (row: SubscribedFeedRow) => {
      const uid = userId?.trim()
      if (!uid) return
      const cid = row.conversationId.trim()
      const postId = row.message.id.trim()
      if (!cid || !postId) return
      const sk = `${cid}-${postId}`
      const opKey = `${cid}::${postId}::${QUICK_REACTION_EMOJI}`
      if (reactionOpInFlightRef.current.has(opKey)) return
      reactionOpInFlightRef.current.add(opKey)
      try {
        const res = await toggleChannelMessageReaction(cid, postId, QUICK_REACTION_EMOJI)
        if (res.error) {
          toast.push({ tone: 'error', message: res.error, ms: 2600 })
          return
        }
        const payload = res.data
        if (!payload) return
        setStatsByKey((prev) => {
          const cur = prev[sk] ?? { heartCount: 0, comments: 0, myHeart: false }
          if (payload.action === 'removed') {
            return {
              ...prev,
              [sk]: {
                ...cur,
                heartCount: Math.max(0, cur.heartCount - 1),
                myHeart: false,
              },
            }
          }
          return {
            ...prev,
            [sk]: {
              ...cur,
              heartCount: cur.heartCount + 1,
              myHeart: true,
            },
          }
        })
      } finally {
        reactionOpInFlightRef.current.delete(opKey)
      }
    },
    [toast, userId],
  )

  return (
    <div className="dashboard-messenger__thread-body messenger-subscribed-feed">
      <div className="dashboard-messenger__thread-head">
        {isMobileMessenger ? (
          <header className="dashboard-messenger__list-head dashboard-messenger__list-head--thread">
            <div className="dashboard-messenger__thread-head-back-wrap">
              <button
                type="button"
                className="dashboard-messenger__list-head-btn"
                aria-label="К списку чатов"
                title="К списку чатов"
                onClick={() => navigate('/dashboard/messenger?view=list', { replace: true })}
              >
                <ChevronLeftIcon />
              </button>
            </div>
            <div className="dashboard-messenger__thread-head-center dashboard-messenger__thread-head-center--thread-block">
              <div className="dashboard-messenger__thread-head-center-meta">Подписки</div>
              <div className="dashboard-messenger__thread-head-center-title">Лента</div>
            </div>
            <div className="dashboard-messenger__list-head-actions" aria-hidden="true" />
          </header>
        ) : (
          <div className="dashboard-messenger__thread-head-center" style={{ padding: 16 }}>
            <div className="dashboard-messenger__thread-head-center-meta">Подписки</div>
            <div className="dashboard-messenger__thread-head-center-title">Лента каналов</div>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="messenger-subscribed-feed__scroll">
        {loading ? (
          <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…">
            <BrandLogoLoader size={56} />
          </div>
        ) : error ? (
          <p className="dashboard-chats-empty" role="alert">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="dashboard-chats-empty">Пока нет постов с включённой лентой.</p>
        ) : (
          <div className="messenger-subscribed-feed__grid">
            {rows.map((r) => {
              const sk = `${r.conversationId}-${r.message.id}`
              return (
                <FeedPostCard
                  key={sk}
                  row={r}
                  stats={statsByKey[sk]}
                  userId={userId}
                  onToggleHeart={() => void toggleHeartForPost(r)}
                  onOpenChannelComments={() => openChannelComments(r)}
                  onOpen={() => openPost(r)}
                />
              )
            })}
            {hasMore ? <div ref={sentinelRef} className="messenger-subscribed-feed__sentinel" aria-hidden /> : null}
            {loadingMore ? (
              <div className="messenger-subscribed-feed__more-loader" aria-live="polite">
                <BrandLogoLoader size={36} />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function FeedPostCard(props: {
  row: SubscribedFeedRow
  stats: SubscribedFeedCardStats | undefined
  userId?: string | null
  onToggleHeart: () => void
  onOpenChannelComments: () => void
  onOpen: () => void
}) {
  const { row, stats, userId, onToggleHeart, onOpenChannelComments, onOpen } = props
  const draft = parsePostDraftFromMeta(row.message.meta ?? null)
  const title = (draft?.title ?? row.message.body ?? '').trim() || 'Пост'
  const coverRaw = draft?.coverImage?.trim() ?? ''
  const coverPath = coverRaw.startsWith('ms://') ? coverRaw.slice('ms://'.length) : ''
  const [coverSrc, setCoverSrc] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const teaserText = useMemo(() => {
    if (draft) return feedCardTeaserText(draft)
    const b = (row.message.body ?? '').trim().replace(/\s+/g, ' ')
    return b.length > 200 ? `${b.slice(0, 200)}…` : b
  }, [draft, row.message.body])

  const expandedBlock = useMemo(() => {
    if (draft) return feedCardExpandedPlainSnippet(draft)
    const b = (row.message.body ?? '').trim()
    if (b.length <= FEED_CARD_EXPAND_MAX) return { text: b, needsOpenPost: false }
    return { text: `${b.slice(0, FEED_CARD_EXPAND_MAX).trimEnd()}…`, needsOpenPost: true }
  }, [draft, row.message.body])

  useEffect(() => {
    if (!coverPath) {
      setCoverSrc(null)
      return
    }
    let cancelled = false
    void (async () => {
      const signed = await getMessengerImageSignedUrl(coverPath, 3600)
      if (!cancelled && signed.url) setCoverSrc(signed.url)
    })()
    return () => {
      cancelled = true
    }
  }, [coverPath])

  const showTeaser = Boolean(teaserText.trim())

  return (
    <div
      role="button"
      tabIndex={0}
      className="messenger-subscribed-feed__card"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="messenger-subscribed-feed__card-cover-wrap">
        {coverSrc ? (
          <img className="messenger-subscribed-feed__card-cover" src={coverSrc} alt="" />
        ) : (
          <div className="messenger-subscribed-feed__card-cover messenger-subscribed-feed__card-cover--placeholder">
            <FiRrIcon name="grid" />
          </div>
        )}
      </div>
      <div className="messenger-subscribed-feed__card-body">
        <div className="messenger-subscribed-feed__card-channel">{row.channelTitle}</div>
        <div className="messenger-subscribed-feed__card-title">{title}</div>
        <div className="messenger-subscribed-feed__card-stats">
          <button
            type="button"
            className={`messenger-subscribed-feed__card-heart-btn${
              stats?.myHeart ? ' messenger-subscribed-feed__card-heart-btn--mine' : ''
            }`}
            title={stats?.myHeart ? 'Убрать лайк' : 'Лайк'}
            aria-label={stats?.myHeart ? 'Убрать лайк' : 'Лайк'}
            aria-pressed={Boolean(stats?.myHeart)}
            disabled={!userId?.trim()}
            onClick={(e) => {
              e.stopPropagation()
              onToggleHeart()
            }}
          >
            <span className="dashboard-messenger__reaction-emoji" aria-hidden>
              {QUICK_REACTION_EMOJI}
            </span>
            <span className="messenger-subscribed-feed__card-heart-count">{stats?.heartCount ?? '…'}</span>
          </button>
          <button
            type="button"
            className="messenger-subscribed-feed__card-comments-btn"
            title="Комментарии"
            aria-label={`Комментарии, ${typeof stats?.comments === 'number' ? stats.comments : '…'}`}
            onClick={(e) => {
              e.stopPropagation()
              onOpenChannelComments()
            }}
          >
            <FiRrIcon name="messages" />
            <span className="messenger-subscribed-feed__card-comments-count">{stats?.comments ?? '…'}</span>
          </button>
        </div>
        {showTeaser ? (
          <div className="messenger-subscribed-feed__card-teaser-block">
            {expanded ? (
              <div className="messenger-subscribed-feed__card-snippet-expanded">
                <p className="messenger-subscribed-feed__card-snippet-text">{expandedBlock.text}</p>
                {expandedBlock.needsOpenPost ? (
                  <button
                    type="button"
                    className="messenger-subscribed-feed__card-more-chevron"
                    title="Открыть пост"
                    aria-label="Открыть полный пост"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpen()
                    }}
                  >
                    <FiRrIcon name="angle-small-right" aria-hidden />
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="messenger-subscribed-feed__card-teaser">{teaserText}</p>
            )}
            <button
              type="button"
              className="messenger-subscribed-feed__card-expand-chevron"
              title={expanded ? 'Свернуть' : 'Развернуть'}
              aria-label={expanded ? 'Свернуть' : 'Развернуть'}
              aria-expanded={expanded}
              onClick={(e) => {
                e.stopPropagation()
                setExpanded((v) => !v)
              }}
            >
              <FiRrIcon name={expanded ? 'angle-small-up' : 'angle-small-down'} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
