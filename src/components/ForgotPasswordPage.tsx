import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { authResetPassword } from '../api/authApi'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const v = email.trim()
    if (!v) return
    if (password.length < 6) {
      setError('Пароль должен быть минимум 6 символов')
      return
    }
    if (password !== password2) {
      setError('Пароли не совпадают')
      return
    }
    setLoading(true)
    const r = await authResetPassword({ email: v, newPassword: password })
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
        ) : (
          <>
            <form onSubmit={handleSubmit} className="join-form">
              <label className="join-label">Email</label>
              <input
                className="join-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />

              <label className="join-label">Новый пароль</label>
              <input
                className="join-input"
                type="password"
                placeholder="Минимум 6 символов"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
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
                disabled={loading || !email.trim() || !password || !password2 || password !== password2}
              >
                {loading ? 'Сохраняем…' : 'Сменить пароль'}
              </button>
            </form>

            {error ? <p className="join-error">{error}</p> : null}

            <p className="login-switch">
              Вспомнили пароль?{' '}
              <Link to="/login" className="login-switch__btn" role="button">
                Войти
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

