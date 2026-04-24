import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../hooks/useProfile'
import { useToast } from '../context/ToastContext'
import { GuestAuthPanel } from './GuestAuthPanel'
import { ensureDirectConversationWithUser } from '../lib/messenger'
import { getContactStatuses, setContactPin } from '../lib/socialGraph'

type PublicProfile = {
  id: string
  displayName: string
  avatarUrl: string | null
  profileSlug: string | null
  restricted: boolean
}

function parsePublicProfile(raw: unknown): PublicProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.ok !== true) return null
  const id = typeof r.id === 'string' ? r.id.trim() : ''
  if (!id) return null
  return {
    id,
    displayName: typeof r.display_name === 'string' && r.display_name.trim() ? r.display_name.trim() : 'Пользователь',
    avatarUrl: typeof r.avatar_url === 'string' && r.avatar_url.trim() ? r.avatar_url.trim() : null,
    profileSlug: typeof r.profile_slug === 'string' && r.profile_slug.trim() ? r.profile_slug.trim() : null,
    restricted: r.restricted === true,
  }
}

export function PublicUserPage() {
  const { slug: rawSlug = '' } = useParams<{ slug: string }>()
  const slug = useMemo(() => rawSlug.trim(), [rawSlug])
  const { user, loading: authLoading } = useAuth()
  const [guestExpandSignal, setGuestExpandSignal] = useState(0)
  const [guestPanelExpanded, setGuestPanelExpanded] = useState(false)
  const { openProfileEdit } = useProfile()
  const toast = useToast()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [inContacts, setInContacts] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setProfile(null)
    void (async () => {
      void slug
      if (!active) return
      setError('Публичные профили пока недоступны: Supabase удалён, backend API ещё не реализован.')
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [slug])

  useEffect(() => {
    let cancelled = false
    if (!user?.id || !profile?.id) {
      setInContacts(false)
      return
    }
    void getContactStatuses([profile.id]).then((res) => {
      if (cancelled) return
      const st = res.data?.[profile.id]
      setInContacts(Boolean(st?.pinnedByMe))
    })
    return () => {
      cancelled = true
    }
  }, [user?.id, profile?.id])

  const isOwnProfile = Boolean(user?.id && profile?.id && user.id === profile.id)
  const showGuestPanel = Boolean(profile && !authLoading && !user)

  const goChat = useCallback(async () => {
    if (!profile?.id || busy) return
    if (!user?.id) {
      setGuestExpandSignal((n) => n + 1)
      return
    }
    setBusy(true)
    try {
      const ensured = await ensureDirectConversationWithUser(profile.id, profile.displayName)
      if (ensured.error || !ensured.data) {
        const msg = ensured.error?.includes('dm_not_allowed')
          ? 'Этот пользователь принимает личные сообщения только от взаимных контактов.'
          : ensured.error?.includes('dm_blocked')
            ? 'Чат недоступен из‑за блокировки.'
            : ensured.error || 'Не удалось открыть чат.'
        toast.push({ tone: 'error', title: 'Не удалось', message: msg, ms: 4200 })
        return
      }
      navigate(`/dashboard/messenger?chat=${encodeURIComponent(ensured.data)}`)
    } finally {
      setBusy(false)
    }
  }, [profile?.displayName, profile?.id, toast, navigate, user?.id, busy])

  const addToContacts = useCallback(async () => {
    if (!profile?.id || busy) return
    if (!user?.id) {
      setGuestExpandSignal((n) => n + 1)
      return
    }
    setBusy(true)
    try {
      const res = await setContactPin(profile.id, !inContacts)
      if (res.error || !res.data) {
        toast.push({ tone: 'error', title: 'Не удалось', message: res.error ?? 'Не удалось обновить контакт.', ms: 4200 })
        return
      }
      setInContacts(res.data.pinnedByMe)
      toast.push({
        tone: 'success',
        message: res.data.pinnedByMe ? 'Добавлено в контакты.' : 'Убрано из контактов.',
        ms: 2500,
      })
    } finally {
      setBusy(false)
    }
  }, [profile?.id, toast, user?.id, busy, inContacts])

  return (
    <div
      className={`join-screen join-screen--themed${showGuestPanel ? ' join-screen--public-guest' : ''}${
        showGuestPanel && guestPanelExpanded ? ' join-screen--public-guest-expanded' : ''
      }`}
    >
      <div className="join-card">
        <Link to="/" className="join-logo-btn" aria-label="Главная">
          <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
        </Link>

        {loading ? <div className="auth-loading" aria-label="Загрузка..." /> : null}
        {!loading && error ? <p className="join-error">{error}</p> : null}

        {!loading && !error && profile ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 999,
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                  background: 'color-mix(in srgb, var(--text) 8%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                }}
                aria-hidden
              >
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <span>{profile.displayName.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{profile.displayName}</div>
                {profile.profileSlug ? (
                  <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>@{profile.profileSlug}</div>
                ) : null}
                {profile.restricted ? (
                  <div style={{ color: 'var(--text-dim)', marginTop: 8 }}>Профиль доступен только взаимным контактам.</div>
                ) : null}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {isOwnProfile ? (
                <button
                  type="button"
                  className="join-btn join-btn--block"
                  onClick={() => openProfileEdit()}
                >
                  Редактировать профиль
                </button>
              ) : (
                <>
                  <button type="button" className="join-btn join-btn--block" onClick={() => void goChat()} disabled={busy}>
                    Написать в чат
                  </button>
                  <button
                    type="button"
                    className="join-btn join-btn--secondary join-btn--block"
                    onClick={() => void addToContacts()}
                    disabled={busy}
                  >
                    {inContacts ? 'Убрать из контактов' : 'Добавить в контакты'}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {showGuestPanel ? (
        <GuestAuthPanel
          expandSignal={guestExpandSignal}
          onExpandedChange={setGuestPanelExpanded}
        />
      ) : null}
    </div>
  )
}

