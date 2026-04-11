import { FormEvent, useState } from 'react'
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from './ThemeToggle'

type Mode = 'login' | 'register'

export function LoginPage() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sp] = useSearchParams()

  const [mode, setMode] = useState<Mode>(sp.get('mode') === 'register' ? 'register' : 'login')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError]             = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null)

  const from = (location.state as { from?: string })?.from ?? '/'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    let result: { error: string | null }

    if (mode === 'login') {
      result = await signIn(email.trim(), password)
      setLoading(false)
      if (result.error) { setError(result.error); return }
      navigate(from, { replace: true })
    } else {
      if (!displayName.trim()) {
        setError('Введите отображаемое имя')
        setLoading(false)
        return
      }
      result = await signUp(email.trim(), password, displayName.trim())
      setLoading(false)
      if (result.error) { setError(result.error); return }
      setConfirmSentTo(email.trim())
    }
  }

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setError(null)
    setConfirmSentTo(null)
  }

  if (confirmSentTo) {
    return (
      <div className="join-screen join-screen--themed">
        <ThemeToggle variant="inline" className="theme-toggle--join-corner" />
        <div className="join-card">
          <Link to="/" className="join-logo-btn" aria-label="Главная">
            <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
          </Link>
          <div className="confirm-sent">
            <div className="confirm-sent__icon" aria-hidden>✉️</div>
            <h2 className="confirm-sent__title">Подтвердите почту</h2>
            <p className="confirm-sent__text">
              Мы отправили письмо на <strong>{confirmSentTo}</strong>.<br />
              Перейдите по ссылке в письме, чтобы завершить регистрацию.
            </p>
            <p className="confirm-sent__hint">
              Не пришло? Проверьте папку «Спам».
            </p>
            <Link to="/" className="join-btn join-btn--block confirm-sent__back">
              На главную
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="join-screen join-screen--themed">
      <ThemeToggle variant="inline" className="theme-toggle--join-corner" />
      <div className="join-card">
        <Link to="/" className="join-logo-btn" aria-label="Главная">
          <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
        </Link>

        <form onSubmit={handleSubmit} className="join-form">
          {mode === 'register' && (
            <>
              <label className="join-label">Отображаемое имя</label>
              <input
                className="join-input"
                type="text"
                placeholder="Ваше имя"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoFocus
                maxLength={40}
                required
              />
            </>
          )}

          <label className="join-label">Email</label>
          <input
            className="join-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus={mode === 'login'}
            required
          />

          <label className="join-label">Пароль</label>
          <input
            className="join-input"
            type="password"
            placeholder={mode === 'register' ? 'Минимум 6 символов' : 'Пароль'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={mode === 'register' ? 6 : undefined}
            required
          />

          <button
            className="join-btn join-btn--block"
            type="submit"
            disabled={loading || !email.trim() || !password}
          >
            {loading
              ? 'Подождите…'
              : mode === 'login'
              ? 'Войти'
              : 'Зарегистрироваться'}
          </button>
        </form>

        {error && <p className="join-error">{error}</p>}

        <p className="login-switch">
          {mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}{' '}
          <button type="button" className="login-switch__btn" onClick={toggleMode}>
            {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </p>
      </div>
    </div>
  )
}
