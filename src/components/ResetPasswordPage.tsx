import { FormEvent, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { backendResetPassword } from '../lib/backend/authApi'

export function ResetPasswordPage() {
  const loc = useLocation()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const token = useMemo(() => {
    const sp = new URLSearchParams(loc.search)
    return (sp.get('token') ?? '').trim()
  }, [loc.search])
  const canReset = useMemo(() => Boolean(token), [token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Пароль должен быть минимум 8 символов')
      return
    }
    if (password !== password2) {
      setError('Пароли не совпадают')
      return
    }
    setLoading(true)
    const res = await backendResetPassword(token, password)
    setLoading(false)
    if (res.error) {
      setError(res.error)
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
                placeholder="Минимум 8 символов"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
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
                minLength={8}
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

