import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { BrandLogoLoader } from '../BrandLogoLoader'
import { ChevronLeftIcon, FiRrIcon } from '../icons'
import { mapDirectMessageFromRow, type DirectMessage } from '../../lib/messenger'
import { buildMessengerUrl } from '../../lib/messengerDashboardUtils'
import { resolveMediaUrlsForStoragePaths } from '../../lib/mediaCache'
import { messengerStoragePathToThumbPath } from '../../lib/messenger'
import { collectStoragePathsFromDraft, parsePostDraftFromMeta } from '../../lib/postEditor/draftUtils'
import type { PostDraftV1 } from '../../lib/postEditor/types'
import { PostDraftReadView, PostPublicationLine } from '../postEditor/PostDraftReadView'
import { supabase } from '../../lib/supabase'

function extractStoragePathsFromMarkdown(md: string): string[] {
  const out: string[] = []
  const re = /\bms:\/\/([^\s)]+)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md))) {
    const p = (m[1] ?? '').trim()
    if (p) {
      out.push(p)
      const thumb = messengerStoragePathToThumbPath(p)
      if (thumb) out.push(thumb)
    }
  }
  return out
}

export function MessengerFeedPostPane(props: {
  conversationId: string
  messageId: string
  channelTitle: string
  isMobileMessenger: boolean
  navigate: NavigateFunction
  /** Кнопка «назад» ведёт в ленту подписок */
  backToSubscribedFeed: boolean
}) {
  const { conversationId, messageId, channelTitle, isMobileMessenger, navigate, backToSubscribedFeed } = props
  const [message, setMessage] = useState<DirectMessage | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [signedUrlByPath, setSignedUrlByPath] = useState<Record<string, string>>({})
  const signedUrlByPathRef = useRef(signedUrlByPath)
  signedUrlByPathRef.current = signedUrlByPath

  const cid = conversationId.trim()
  const mid = messageId.trim()

  useEffect(() => {
    if (!cid || !mid) {
      setLoadError('Некорректная ссылка')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void (async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(
          'id, sender_user_id, sender_name_snapshot, kind, body, meta, created_at, edited_at, reply_to_message_id, quote_to_message_id, reply_preview',
        )
        .eq('conversation_id', cid)
        .eq('id', mid)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        setLoadError(error.message)
        setMessage(null)
        setLoading(false)
        return
      }
      if (!data || typeof data !== 'object') {
        setLoadError('Сообщение не найдено')
        setMessage(null)
        setLoading(false)
        return
      }
      setMessage(mapDirectMessageFromRow(data as Record<string, unknown>))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [cid, mid])

  const draft: PostDraftV1 | null = useMemo(
    () => (message ? parsePostDraftFromMeta(message.meta ?? null) : null),
    [message],
  )

  useEffect(() => {
    if (!message) return
    const paths = new Set<string>()
    if (draft) {
      for (const sp of collectStoragePathsFromDraft(draft)) paths.add(sp)
    }
    for (const sp of extractStoragePathsFromMarkdown(message.body ?? '')) paths.add(sp)
    const prevMap = signedUrlByPathRef.current
    const missing = [...paths].filter((p) => !prevMap[p])
    if (missing.length === 0) return
    let active = true
    void (async () => {
      const patch = await resolveMediaUrlsForStoragePaths(missing, { expiresSec: 3600, concurrency: 8 })
      if (!active || Object.keys(patch).length === 0) return
      setSignedUrlByPath((prev) => {
        const next = { ...prev }
        for (const [k, v] of Object.entries(patch)) {
          if (!next[k]) next[k] = v
        }
        return next
      })
    })()
    return () => {
      active = false
    }
  }, [message, draft])

  const onBack = useCallback(() => {
    if (backToSubscribedFeed) {
      navigate(buildMessengerUrl(undefined, undefined, undefined, { feed: 'subscribed' }), { replace: false })
      return
    }
    if (cid) {
      navigate(buildMessengerUrl(cid), { replace: false })
    } else {
      navigate('/dashboard/messenger', { replace: false })
    }
  }, [backToSubscribedFeed, navigate, cid])

  return (
    <div className="dashboard-messenger__thread-body messenger-feed-post-read">
      <div className="dashboard-messenger__thread-head">
        {isMobileMessenger ? (
          <header className="dashboard-messenger__list-head dashboard-messenger__list-head--thread">
            <div className="dashboard-messenger__thread-head-back-wrap">
              <button
                type="button"
                className="dashboard-messenger__list-head-btn"
                aria-label="Назад"
                title="Назад"
                onClick={onBack}
              >
                <ChevronLeftIcon />
              </button>
            </div>
            <div className="dashboard-messenger__thread-head-center dashboard-messenger__thread-head-center--thread-block">
              <div className="dashboard-messenger__thread-head-center-meta">Канал</div>
              <div className="dashboard-messenger__thread-head-center-title">{channelTitle}</div>
            </div>
            <div className="dashboard-messenger__list-head-actions" aria-hidden="true" />
          </header>
        ) : (
          <div className="dashboard-messenger__thread-head dashboard-messenger__thread-head--feed-post-read">
            <button type="button" className="messenger-feed-post-read__back-desktop" onClick={onBack}>
              <FiRrIcon name="angle-small-left" aria-hidden />
              <span>Назад</span>
            </button>
            <div className="messenger-feed-post-read__head-text">
              <div className="dashboard-messenger__thread-head-center-meta">Канал</div>
              <div className="dashboard-messenger__thread-head-center-title">{channelTitle}</div>
            </div>
          </div>
        )}
      </div>

      <div className="messenger-feed-post-read__scroll app-scroll">
        {loading ? (
          <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…">
            <BrandLogoLoader size={56} />
          </div>
        ) : loadError ? (
          <p className="dashboard-chats-empty" role="alert">
            {loadError}
          </p>
        ) : !message ? (
          <p className="dashboard-chats-empty">Пост недоступен.</p>
        ) : draft ? (
          <article className="messenger-feed-post-read__article">
            <PostDraftReadView
              className="post-draft-read--channel-feed"
              draft={draft}
              urlByStoragePath={signedUrlByPath}
              publishedAt={message.createdAt}
              editedAt={message.editedAt}
            />
          </article>
        ) : (
          <article className="messenger-feed-post-read__article">
            <PostPublicationLine publishedAt={message.createdAt} editedAt={message.editedAt} />
            <div className="messenger-feed-post-read__plain-body">{message.body || '—'}</div>
          </article>
        )}
      </div>
    </div>
  )
}
