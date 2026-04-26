import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getPasswordResetRedirectUrl } from '../config/authUrls'
import { authRequestPasswordReset } from '../api/authApi'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const v = email.trim()
    if (!v) return
    setLoading(true)
    const r = await authRequestPasswordReset({ email: v, redirectTo: getPasswordResetRedirectUrl() })
    setLoading(false)
    if (!r.ok) {
      setError(r.error.message)
      return
    }
    const code = (r.data as any)?.devCode
    if (typeof code === 'string' && code.trim()) {
      const url = new URL('/auth/reset-password', window.location.origin)
      url.searchParams.set('email', v)
      url.searchParams.set('code', code.trim())
      navigate(`${url.pathname}${url.search}`)
    } else {
      const url = new URL('/auth/reset-password', window.location.origin)
      url.searchParams.set('email', v)
      navigate(`${url.pathname}${url.search}`)
    }
  }

  return (
    <div className="join-screen join-screen--themed">
      <div className="join-card">
        <Link to="/" className="join-logo-btn" aria-label="Главная">
          <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
        </Link>

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
          <button className="join-btn join-btn--block" type="submit" disabled={loading || !email.trim()}>
            {loading ? 'Отправляем…' : 'Сбросить пароль'}
          </button>
        </form>

        {error ? <p className="join-error">{error}</p> : null}

        <p className="login-switch">
          Вспомнили пароль?{' '}
          <Link to="/login" className="login-switch__btn" role="button">
            Войти
          </Link>
        </p>
      </div>
    </div>
  )
}

