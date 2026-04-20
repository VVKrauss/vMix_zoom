import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { joinPublicChannel } from '../lib/channels'
import { joinPublicGroupChat } from '../lib/groups'
import {
  fetchPublicConversationGuestPreview,
  type PublicGuestPreviewMessage,
  type PublicGuestPreviewOk,
} from '../lib/publicConversationGuest'
import { getMessengerImageSignedUrl } from '../lib/messenger'
import { GuestAuthPanel } from './GuestAuthPanel'

function formatGuestMessageLine(m: PublicGuestPreviewMessage): string {
  if (m.kind === 'image') return '📷 Фото'
  if (m.kind === 'audio') return '🎤 Голосовое'
  if (m.kind === 'system') return m.body.trim().slice(0, 400)
  return m.body.trim().slice(0, 420)
}

function formatGuestTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return ''
  }
}

export function PublicGroupChannelPage() {
  const { publicNick: rawNick = '' } = useParams<{ publicNick: string }>()
  const publicNick = useMemo(() => rawNick.trim(), [rawNick])
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PublicGuestPreviewOk | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [guestExpandSignal, setGuestExpandSignal] = useState(0)
  const [guestPanelExpanded, setGuestPanelExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setPreview(null)
    setAvatarUrl(null)
    void (async () => {
      const res = await fetchPublicConversationGuestPreview(publicNick, 40)
      if (cancelled) return
      if (!res.ok) {
        if (res.error === 'not_found') setError('Чат не найден или ссылка устарела.')
        else if (res.error === 'not_public') setError('Этот чат не публичный — превью недоступно.')
        else if (res.error === 'invalid_nick') setError('Некорректная ссылка.')
        else setError(res.message ?? 'Не удалось загрузить превью.')
        setLoading(false)
        return
      }
      setPreview(res.data)
      const thumb = res.data.avatarThumbPath ?? res.data.avatarPath
      if (thumb) {
        const signed = await getMessengerImageSignedUrl(thumb, 3600)
        if (!cancelled && signed.url) setAvatarUrl(signed.url)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [publicNick])

  const showGuestPanel = Boolean(preview && !authLoading && !user)

  const openInMessenger = useCallback(async () => {
    if (!preview || busy) return
    if (!user?.id) {
      setGuestExpandSignal((n) => n + 1)
      return
    }
    setBusy(true)
    try {
      const err =
        preview.kind === 'group'
          ? (await joinPublicGroupChat(preview.conversationId)).error
          : (await joinPublicChannel(preview.conversationId)).error
      if (err) {
        toast.push({ tone: 'error', title: 'Не удалось', message: err, ms: 4200 })
        return
      }
      navigate(`/dashboard/messenger?chat=${encodeURIComponent(preview.conversationId)}`)
    } finally {
      setBusy(false)
    }
  }, [preview, busy, user?.id, navigate, toast])

  const kindLabel = preview?.kind === 'channel' ? 'Канал' : 'Группа'

  return (
    <div
      className={`join-screen join-screen--themed${showGuestPanel ? ' join-screen--public-guest' : ''}${
        showGuestPanel && guestPanelExpanded ? ' join-screen--public-guest-expanded' : ''
      }`}
    >
      <div className="join-card public-guest-chat-card">
        <Link to="/" className="join-logo-btn" aria-label="Главная">
          <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
        </Link>

        {loading ? <div className="auth-loading" aria-label="Загрузка..." /> : null}
        {!loading && error ? <p className="join-error">{error}</p> : null}

        {!loading && !error && preview ? (
          <div className="public-guest-chat">
            <div className="public-guest-chat__head">
              <div
                className="public-guest-chat__avatar"
                style={{
                  border: '1px solid var(--border)',
                  background: 'color-mix(in srgb, var(--text) 8%, transparent)',
                }}
                aria-hidden
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span>{preview.title.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div className="public-guest-chat__titles">
                <div className="public-guest-chat__kind">{kindLabel}</div>
                <h1 className="public-guest-chat__title">{preview.title}</h1>
                {preview.publicNick ? (
                  <div className="public-guest-chat__nick">@{preview.publicNick}</div>
                ) : null}
                <div className="public-guest-chat__meta">
                  Участников: {preview.memberCount}
                  {preview.kind === 'channel' && preview.channelPostingMode ? (
                    <span className="public-guest-chat__meta-dot">
                      · Посты: {preview.channelPostingMode === 'everyone' ? 'все' : 'только админы'}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <p className="public-guest-chat__hint">
              {user
                ? 'Вы вошли — можно вступить в чат и писать в приложении.'
                : 'Просмотр фрагмента переписки. Чтобы писать и читать всё — зарегистрируйтесь или войдите.'}{' '}
              Поделиться: скопируйте адрес этой страницы.
            </p>

            <div className="public-guest-chat__actions">
              <button type="button" className="join-btn join-btn--block" disabled={busy} onClick={() => void openInMessenger()}>
                {busy ? 'Подождите…' : user ? 'Вступить и открыть в мессенджере' : 'Вступить (нужен аккаунт)'}
              </button>
            </div>

            <div className="public-guest-chat__feed" role="region" aria-label="Последние сообщения">
              <div className="public-guest-chat__feed-title">Последние сообщения</div>
              {preview.messages.length === 0 ? (
                <p className="public-guest-chat__empty">Пока нет сообщений для превью.</p>
              ) : (
                <ul className="public-guest-chat__list">
                  {preview.messages.map((m) => (
                    <li key={m.id} className="public-guest-chat__msg">
                      <div className="public-guest-chat__msg-head">
                        <span className="public-guest-chat__msg-author">{m.sender_name_snapshot}</span>
                        <span className="public-guest-chat__msg-time">{formatGuestTime(m.created_at)}</span>
                      </div>
                      <div
                        className={`public-guest-chat__msg-body${m.kind === 'system' ? ' public-guest-chat__msg-body--system' : ''}`}
                      >
                        {formatGuestMessageLine(m)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {showGuestPanel ? (
        <GuestAuthPanel expandSignal={guestExpandSignal} onExpandedChange={setGuestPanelExpanded} />
      ) : null}
    </div>
  )
}
