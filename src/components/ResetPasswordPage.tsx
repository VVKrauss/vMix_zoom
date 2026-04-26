import { FormEvent, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authConfirmPasswordReset, authUpdatePassword } from '../api/authApi'

export function ResetPasswordPage() {
  const { session, loading: authLoading } = useAuth()
  const loc = useLocation()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const qp = useMemo(() => new URLSearchParams(loc.search), [loc.search])
  const resetEmail = qp.get('email')?.trim() || ''
  const resetCode = qp.get('code')?.trim() || ''

  // Supabase-style flow required an active session after clicking email link.
  // Our self-hosted flow supports both:
  // - authenticated change (session)
  // - unauthenticated reset via (email, code) from query params
  const canResetByCode = Boolean(resetEmail && resetCode)
  const canResetBySession = Boolean(session?.user?.id)
  const canReset = canResetByCode || canResetBySession
  const awaitingEmailLink = Boolean(resetEmail && !resetCode && !canResetBySession)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Пароль должен быть минимум 6 символов')
      return
    }
    if (password !== password2) {
      setError('Пароли не совпадают')
      return
    }
    setLoading(true)
    const r = canResetByCode
      ? await authConfirmPasswordReset({ email: resetEmail, code: resetCode, newPassword: password })
      : await authUpdatePassword({ password })
    setLoading(false)
    if (!r.ok) {
      setError(r.error.message)
      return
    }
    setOk(true)
  }

  return (
    <div className="join-screen join-screen--themed">
      <div className="join-card">
        <Link to="/" className="join-logo-btn" aria-label="Главная">
          <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
        </Link>

        {ok ? (
          <div className="confirm-sent">
            <div className="confirm-sent__icon" aria-hidden>
              ✅
            </div>
            <h2 className="confirm-sent__title">Пароль обновлён</h2>
            <p className="confirm-sent__text">Теперь можно войти с новым паролем.</p>
            <Link to="/login" className="join-btn join-btn--block confirm-sent__back">
              Войти
            </Link>
          </div>
        ) : authLoading ? (
          <div className="confirm-sent">
            <div className="confirm-sent__icon" aria-hidden>
              …
            </div>
            <p className="confirm-sent__text">Проверяем ссылку…</p>
          </div>
        ) : awaitingEmailLink ? (
          <div className="confirm-sent">
            <div className="confirm-sent__icon" aria-hidden>
              ✉️
            </div>
            <h2 className="confirm-sent__title">Ссылка для сброса отправлена</h2>
            <p className="confirm-sent__text">
              Мы отправили письмо на <strong>{resetEmail}</strong>.<br />
              Перейдите по ссылке в письме, чтобы установить новый пароль.
            </p>
            <p className="confirm-sent__hint">Не пришло? Проверьте папку «Спам».</p>
            <Link to="/login" className="join-btn join-btn--block confirm-sent__back">
              Вернуться ко входу
            </Link>
          </div>
        ) : !canReset ? (
          <div className="confirm-sent">
            <div className="confirm-sent__icon" aria-hidden>
              ⚠️
            </div>
            <h2 className="confirm-sent__title">Ссылка недействительна</h2>
            <p className="confirm-sent__text">
              Откройте ссылку из письма ещё раз или запросите сброс пароля заново.
            </p>
            <Link to="/auth/forgot-password" className="join-btn join-btn--block confirm-sent__back">
              Сбросить пароль
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="join-form">
              <label className="join-label">Новый пароль</label>
              <input
                className="join-input"
                type="password"
                placeholder="Минимум 6 символов"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                autoFocus
                required
              />

              <label className="join-label">Повторите пароль</label>
              <input
                className="join-input"
                type="password"
                placeholder="Повторите пароль"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                minLength={6}
                required
              />

              <button
                className="join-btn join-btn--block"
                type="submit"
                disabled={loading || !password || !password2 || password !== password2}
              >
                {loading ? 'Сохраняем…' : 'Сохранить пароль'}
              </button>
            </form>

            {error ? <p className="join-error">{error}</p> : null}
          </>
        )}
      </div>
    </div>
  )
}

