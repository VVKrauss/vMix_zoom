import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../hooks/useProfile'
import { useToast } from '../context/ToastContext'
import { ensureDirectConversationWithUser, requestMessengerContactAliasRefresh } from '../lib/messenger'
import { getMyConversationNotificationMutes, setConversationNotificationsMuted } from '../lib/conversationNotifications'
import { fetchPublicUserProfile, type PublicUserProfileRow } from '../lib/userPublicProfile'
import { getContactStatuses, listMyContactAliases, setContactPin, setMyContactAlias, type ContactStatus } from '../lib/socialGraph'
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
  const { openProfileEdit } = useProfile()
  const navigate = useNavigate()
  const toast = useToast()
  const [profile, setProfile] = useState<PublicUserProfileRow | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<ContactStatus | null>(null)
  const [pinBusy, setPinBusy] = useState(false)
  const [chatBusy, setChatBusy] = useState(false)
  const [dmConversationId, setDmConversationId] = useState<string | null>(null)
  const [notifMuted, setNotifMuted] = useState(false)
  const [notifBusy, setNotifBusy] = useState(false)
  const [alias, setAlias] = useState<string | null>(null)
  const [aliasEditing, setAliasEditing] = useState(false)
  const [aliasDraft, setAliasDraft] = useState('')
  const [aliasBusy, setAliasBusy] = useState(false)

  const uid = target?.userId?.trim() ?? ''
  const isSelf = Boolean(user?.id && uid && user.id === uid)

  useEffect(() => {
    if (!open || !uid) {
      setProfile(null)
      setLoadErr(null)
      setStatus(null)
      setLoading(false)
      setDmConversationId(null)
      setNotifMuted(false)
      setNotifBusy(false)
      setAlias(null)
      setAliasEditing(false)
      setAliasDraft('')
      setAliasBusy(false)
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

      if (other) {
        const aRes = await listMyContactAliases([uid])
        if (!cancelled) {
          const a = aRes.data?.[uid]?.trim() ?? ''
          setAlias(a || null)
          setAliasDraft(a || '')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, uid, user?.id])

  useEffect(() => {
    if (!open || !uid || isSelf || !user?.id) {
      setDmConversationId(null)
      setNotifMuted(false)
      return
    }
    const peekName = (target?.displayName?.trim() || profile?.displayName || 'Пользователь').trim()
    let cancelled = false
    void (async () => {
      // Для mute нужен conversation_id; берём через ensure (может создать, если ещё не было).
      const res = await ensureDirectConversationWithUser(uid, peekName)
      if (cancelled) return
      if (!res.data || res.error) {
        setDmConversationId(null)
        setNotifMuted(false)
        return
      }
      setDmConversationId(res.data)
      const m = await getMyConversationNotificationMutes([res.data])
      if (cancelled) return
      if (!m.error && m.data) setNotifMuted(m.data[res.data] === true)
    })()
    return () => {
      cancelled = true
    }
  }, [open, uid, isSelf, user?.id, target?.displayName, profile?.displayName])

  if (!open || !target) return null

  const profileName = profile?.displayName ?? (target.displayName?.trim() || 'Пользователь')
  const displayName = (alias?.trim() || profileName).trim()
  const avatarUrl = profile?.avatarUrl ?? target.avatarUrl ?? null
  const slug = profile?.profileSlug
  const lastLine = formatLastActive(profile?.lastActivityAt ?? null)

  const initials = (displayName.trim().charAt(0) || '?').toUpperCase()

  const togglePin = async () => {
    if (!uid || isSelf || pinBusy) return
    setPinBusy(true)
    const next = !(status?.pinnedByMe ?? false)
    const res = await setContactPin(uid, next)
    setPinBusy(false)
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

  const toggleNotifMuted = async () => {
    const cid = dmConversationId?.trim() ?? ''
    if (!cid || notifBusy || isSelf) return
    setNotifBusy(true)
    const nextMuted = !notifMuted
    const res = await setConversationNotificationsMuted(cid, nextMuted)
    setNotifBusy(false)
    if (!res.ok) return
    setNotifMuted(nextMuted)
  }

  const shareProfile = async () => {
    if (!slug?.trim()) {
      toast.push({ tone: 'warning', title: 'Нет ссылки', message: 'У пользователя пока нет публичного адреса.', ms: 3200 })
      return
    }
    const url = `${window.location.origin}/u/${encodeURIComponent(slug.trim())}`
    try {
      const nav = navigator as unknown as { share?: (data: { title?: string; url?: string; text?: string }) => Promise<void> }
      if (typeof nav.share === 'function') {
        await nav.share({ title: displayName, url })
        return
      }
    } catch {
      /* ignore */
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.push({ tone: 'success', message: 'Ссылка скопирована.', ms: 2200 })
    } catch {
      window.open(url, '_blank', 'noopener')
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
        <p className="user-peek-modal__name">
          {displayName}{' '}
          {!isSelf ? (
            <button
              type="button"
              className="user-peek-modal__alias-edit"
              aria-label="Изменить отображаемое имя"
              title="Изменить отображаемое имя"
              onClick={() => setAliasEditing((v) => !v)}
            >
              ✎
            </button>
          ) : null}
        </p>
        {!isSelf && profileName.trim() && profileName.trim() !== displayName.trim() ? (
          <p className="user-peek-modal__profile-name">В профиле: {profileName}</p>
        ) : null}
        {!isSelf && aliasEditing ? (
          <div className="user-peek-modal__alias-row">
            <input
              className="dashboard-messenger__input user-peek-modal__alias-input"
              value={aliasDraft}
              disabled={aliasBusy}
              placeholder="Как отображать у вас"
              onChange={(e) => setAliasDraft(e.target.value)}
            />
            <button
              type="button"
              className="dashboard-topbar__action dashboard-topbar__action--primary"
              disabled={aliasBusy}
              onClick={() => {
                if (!uid || aliasBusy) return
                setAliasBusy(true)
                void (async () => {
                  const res = await setMyContactAlias(uid, aliasDraft)
                  setAliasBusy(false)
                  if (res.error) {
                    toast.push({ tone: 'error', message: res.error, ms: 2600 })
                    return
                  }
                  setAlias(res.data)
                  setAliasEditing(false)
                  requestMessengerContactAliasRefresh()
                })()
              }}
            >
              {aliasBusy ? '…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className="dashboard-topbar__action"
              disabled={aliasBusy}
              onClick={() => {
                setAliasDraft(alias?.trim() ?? '')
                setAliasEditing(false)
              }}
            >
              Отмена
            </button>
          </div>
        ) : null}
        {slug ? <p className="user-peek-modal__slug">@{slug}</p> : null}
        <p className="user-peek-modal__active">
          Был(а): {lastLine}
          {profile?.isOnline ? ' · в сети' : ''}
        </p>
        {loadErr ? <p className="join-error user-peek-modal__err">{loadErr}</p> : null}
        {loading ? <p className="user-peek-modal__hint">Загрузка…</p> : null}

        <div className="user-peek-modal__actions">
          {!isSelf ? (
            <>
              <button
                type="button"
                className="dashboard-topbar__action"
                disabled={pinBusy}
                onClick={() => void togglePin()}
              >
                {status?.pinnedByMe ? 'Убрать из контактов' : 'Добавить в контакты'}
              </button>
              {dmConversationId ? (
                <button
                  type="button"
                  className="dashboard-topbar__action"
                  disabled={notifBusy}
                  onClick={() => void toggleNotifMuted()}
                  title={notifMuted ? 'Включить уведомления для чата' : 'Выключить уведомления для чата'}
                >
                  {notifMuted ? 'Уведомления: выкл.' : 'Уведомления: вкл.'}
                </button>
              ) : null}
              <button type="button" className="dashboard-topbar__action" onClick={() => void shareProfile()}>
                Поделиться
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
            <>
              <p className="user-peek-modal__hint">Это ваш профиль.</p>
              <button type="button" className="dashboard-topbar__action" onClick={() => void shareProfile()}>
                Поделиться
              </button>
              <button
                type="button"
                className="dashboard-topbar__action dashboard-topbar__action--primary"
                onClick={() => {
                  onClose()
                  openProfileEdit()
                }}
              >
                Редактировать
              </button>
            </>
          )}
          <button type="button" className="dashboard-topbar__action" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
