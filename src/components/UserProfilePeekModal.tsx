import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ensureDirectConversationWithUser } from '../lib/messenger'
import { fetchPublicUserProfile, type PublicUserProfileRow } from '../lib/userPublicProfile'
import { getContactStatuses, setUserFavorite, type ContactStatus } from '../lib/socialGraph'
import type { UserPeekTarget } from '../types/userPeek'

function formatLastActive(iso: string | null): string {
  if (!iso) return 'Нет данных'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
}

export function UserProfilePeekModal({
  open,
  onClose,
  target,
}: {
  open: boolean
  onClose: () => void
  target: UserPeekTarget | null
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<PublicUserProfileRow | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<ContactStatus | null>(null)
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [chatBusy, setChatBusy] = useState(false)

  const uid = target?.userId?.trim() ?? ''
  const isSelf = Boolean(user?.id && uid && user.id === uid)

  useEffect(() => {
    if (!open || !uid) {
      setProfile(null)
      setLoadErr(null)
      setStatus(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setLoadErr(null)

    void (async () => {
      const other = Boolean(user?.id && uid && user.id !== uid)
      const [profRes, stRes] = await Promise.all([
        fetchPublicUserProfile(uid),
        other ? getContactStatuses([uid]) : Promise.resolve({ data: null, error: null }),
      ])
      if (cancelled) return
      setLoading(false)
      if (profRes.error) {
        setLoadErr(profRes.error)
        setProfile(null)
      } else {
        setLoadErr(null)
        setProfile(profRes.data)
      }
      if (stRes.data && stRes.data[uid]) {
        setStatus(stRes.data[uid]!)
      } else {
        setStatus(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, uid, user?.id])

  if (!open || !target) return null

  const displayName = profile?.displayName ?? (target.displayName?.trim() || 'Пользователь')
  const avatarUrl = profile?.avatarUrl ?? target.avatarUrl ?? null
  const slug = profile?.profileSlug
  const lastLine = formatLastActive(profile?.lastLoginAt ?? null)

  const initials = (displayName.trim().charAt(0) || '?').toUpperCase()

  const toggleFavorite = async () => {
    if (!uid || isSelf || favoriteBusy) return
    setFavoriteBusy(true)
    const next = !(status?.isFavorite ?? false)
    const res = await setUserFavorite(uid, next)
    setFavoriteBusy(false)
    if (res.data) setStatus(res.data)
  }

  const goChat = async () => {
    if (!uid || isSelf || chatBusy) return
    setChatBusy(true)
    const res = await ensureDirectConversationWithUser(uid, displayName)
    setChatBusy(false)
    if (res.data) {
      onClose()
      navigate(`/dashboard/messenger?chat=${encodeURIComponent(res.data)}`)
    }
  }

  return (
    <div className="confirm-dialog-root">
      <button type="button" className="confirm-dialog-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        className="confirm-dialog user-peek-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-peek-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="user-peek-title" className="confirm-dialog__title user-peek-modal__sr-only">
          Профиль
        </h2>
        <div className="user-peek-modal__avatar-wrap">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="user-peek-modal__avatar-img" />
          ) : (
            <span className="user-peek-modal__avatar-fallback">{initials}</span>
          )}
        </div>
        <p className="user-peek-modal__name">{displayName}</p>
        {slug ? <p className="user-peek-modal__slug">@{slug}</p> : null}
        <p className="user-peek-modal__active">Последняя активность: {lastLine}</p>
        {loadErr ? <p className="join-error user-peek-modal__err">{loadErr}</p> : null}
        {loading ? <p className="user-peek-modal__hint">Загрузка…</p> : null}

        <div className="user-peek-modal__actions">
          {!isSelf ? (
            <>
              <button
                type="button"
                className="dashboard-topbar__action"
                disabled={favoriteBusy}
                onClick={() => void toggleFavorite()}
              >
                {status?.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              </button>
              <button
                type="button"
                className="dashboard-topbar__action dashboard-topbar__action--primary"
                disabled={chatBusy}
                onClick={() => void goChat()}
              >
                Перейти в чат
              </button>
            </>
          ) : (
            <p className="user-peek-modal__hint">Это ваш профиль.</p>
          )}
          <button type="button" className="dashboard-topbar__action" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
