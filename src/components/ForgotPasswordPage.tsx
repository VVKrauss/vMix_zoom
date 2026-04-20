import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getPasswordResetRedirectUrl } from '../config/authUrls'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const v = email.trim()
    if (!v) return
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(v, {
      redirectTo: getPasswordResetRedirectUrl(),
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setSentTo(v)
  }

  return (
    <div className="join-screen join-screen--themed">
      <div className="join-card">
        <Link to="/" className="join-logo-btn" aria-label="Главная">
          <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
        </Link>

        {sentTo ? (
          <div className="confirm-sent">
            <div className="confirm-sent__icon" aria-hidden>
              ✉️
            </div>
            <h2 className="confirm-sent__title">Ссылка для сброса отправлена</h2>
            <p className="confirm-sent__text">
              Мы отправили письмо на <strong>{sentTo}</strong>.<br />
              Перейдите по ссылке в письме, чтобы установить новый пароль.
            </p>
            <p className="confirm-sent__hint">Не пришло? Проверьте папку «Спам».</p>
            <Link to="/login" className="join-btn join-btn--block confirm-sent__back">
              Вернуться ко входу
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
          </>
        )}
      </div>
    </div>
  )
}

