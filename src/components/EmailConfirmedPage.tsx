import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AUTH_EMAIL_CONFIRMED_PATH } from '../config/authUrls'
import { useAuth } from '../context/AuthContext'

type Phase = 'checking' | 'success' | 'error' | 'no_session'

function parseAuthUrlErrors(): string | null {
  const read = (raw: string) => {
    const p = new URLSearchParams(raw)
    const desc = p.get('error_description')
    const code = p.get('error_code')
    const err = p.get('error')
    if (!desc && !code && !err) return null
    const text = desc || err || code || 'Ошибка подтверждения'
    try {
      return decodeURIComponent(text.replace(/\+/g, ' '))
    } catch {
      return text
    }
  }
  const q = read(window.location.search.replace(/^\?/, ''))
  if (q) return q
  return read(window.location.hash.replace(/^#/, ''))
}

function hasLikelyAuthPayload(): boolean {
  const { search, hash } = window.location
  return (
    search.includes('code=') ||
    hash.includes('access_token') ||
    hash.includes('refresh_token') ||
    search.includes('type=')
  )
}

/**
 * Редирект ссылки из письма Supabase: клиент подхватывает сессию из URL (PKCE / hash).
 */
export function EmailConfirmedPage() {
  const { user } = useAuth()
  const [phase, setPhase] = useState<Phase>('checking')
  const [errorText, setErrorText] = useState<string | null>(null)

  useEffect(() => {
    const urlError = parseAuthUrlErrors()
    if (urlError) {
      setErrorText(urlError)
      setPhase('error')
      window.history.replaceState({}, '', AUTH_EMAIL_CONFIRMED_PATH)
      return
    }

    let cancelled = false

    const considerSession = (hasUser: boolean) => {
      if (cancelled || !hasUser) return
      setPhase('success')
      window.history.replaceState({}, '', AUTH_EMAIL_CONFIRMED_PATH)
    }

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      considerSession(!!session?.user)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (
        session?.user &&
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')
      ) {
        considerSession(true)
      }
    })

    const waitMs = hasLikelyAuthPayload() ? 4000 : 800
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return
      setPhase((p) => (p === 'checking' ? 'no_session' : p))
    }, waitMs)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      sub.subscription.unsubscribe()
    }
  }, [])

  return (
    <div className="join-screen">
      <div className="join-card">
        <Link to="/" className="join-logo-btn" aria-label="Главная">
          <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
        </Link>

        {phase === 'checking' ? (
          <div className="confirm-sent" role="status">
            <div className="confirm-sent__icon" aria-hidden>
              …
            </div>
            <h2 className="confirm-sent__title">Проверяем ссылку</h2>
            <p className="confirm-sent__text">Подождите несколько секунд.</p>
          </div>
        ) : null}

        {phase === 'success' ? (
          <div className="confirm-sent">
            <div className="confirm-sent__icon" aria-hidden>
              ✓
            </div>
            <h2 className="confirm-sent__title">Почта подтверждена</h2>
            <p className="confirm-sent__text">
              {user
                ? 'Регистрация завершена, вы вошли в аккаунт.'
                : 'Регистрация завершена. Теперь можно войти в аккаунт.'}
            </p>
            {user ? (
              <Link to="/dashboard" className="join-btn join-btn--block confirm-sent__back">
                Личный кабинет
              </Link>
            ) : (
              <Link to="/login" className="join-btn join-btn--block confirm-sent__back">
                Войти
              </Link>
            )}
            <Link to="/" className="join-btn join-btn--secondary join-btn--block confirm-sent__back" style={{ marginTop: 10 }}>
              На главную
            </Link>
          </div>
        ) : null}

        {phase === 'error' && errorText ? (
          <div className="confirm-sent">
            <h2 className="confirm-sent__title">Не удалось подтвердить</h2>
            <p className="join-error" style={{ marginBottom: 16 }}>
              {errorText}
            </p>
            <p className="confirm-sent__hint">Запросите новое письмо или зарегистрируйтесь снова.</p>
            <Link to="/login?mode=register" className="join-btn join-btn--block confirm-sent__back">
              К регистрации
            </Link>
            <Link to="/" className="join-btn join-btn--secondary join-btn--block confirm-sent__back" style={{ marginTop: 10 }}>
              На главную
            </Link>
          </div>
        ) : null}

        {phase === 'no_session' ? (
          <div className="confirm-sent">
            <h2 className="confirm-sent__title">Сессия не найдена</h2>
            <p className="confirm-sent__text">
              Если вы уже переходили по ссылке из письма, откройте вход и авторизуйтесь. Если письмо устарело —
              зарегистрируйтесь снова или запросите повторную отправку в настройках Supabase.
            </p>
            <Link to="/login" className="join-btn join-btn--block confirm-sent__back">
              Войти
            </Link>
            <Link to="/" className="join-btn join-btn--secondary join-btn--block confirm-sent__back" style={{ marginTop: 10 }}>
              На главную
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  )
}
