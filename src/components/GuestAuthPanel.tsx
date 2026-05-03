import { FormEvent, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type Mode = 'register' | 'login'

type Props = {
  /** Вызывается при раскрытии/сворачивании — для отступа контента страницы */
  onExpandedChange?: (expanded: boolean) => void
  /** Увеличьте значение (например при клике «Написать» без аккаунта), чтобы раскрыть панель */
  expandSignal?: number
}

export function GuestAuthPanel({ onExpandedChange, expandSignal = 0 }: Props) {
  const { user, loading, signIn, signUp, authBootstrapError, clearAuthBootstrapError } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<Mode>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null)
  const formId = useId()

  useEffect(() => {
    onExpandedChange?.(expanded)
  }, [expanded, onExpandedChange])

  useEffect(() => {
    if (expandSignal > 0) setExpanded(true)
  }, [expandSignal])

  if (loading || user) return null

  const collapse = () => {
    setExpanded(false)
    setError(null)
  }

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setError(null)
    setConfirmSentTo(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        const r = await signIn(email.trim(), password)
        if (r.error) {
          setError(r.error)
          return
        }
        setExpanded(false)
        setEmail('')
        setPassword('')
        setDisplayName('')
      } else {
        if (!displayName.trim()) {
          setError('Введите отображаемое имя')
          return
        }
        const r = await signUp(email.trim(), password, displayName.trim())
        if (r.error) {
          setError(r.error)
          return
        }
        setConfirmSentTo(email.trim())
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="guest-auth-panel" role="region" aria-label="Регистрация и вход">
      <div className={`guest-auth-panel__surface${expanded ? ' guest-auth-panel__surface--open' : ''}`}>
        {!expanded ? (
          <button
            type="button"
            className="guest-auth-panel__collapsed"
            onClick={() => setExpanded(true)}
          >
            <span className="guest-auth-panel__collapsed-text">
              <span className="guest-auth-panel__title">Зарегистрируйтесь</span>
              <span className="guest-auth-panel__subtitle">
                чтобы писать в чат, читать переписку и пользоваться сервисом
              </span>
            </span>
            <span className="guest-auth-panel__collapsed-action" aria-hidden>
              Развернуть
            </span>
          </button>
        ) : (
          <div className="guest-auth-panel__open">
            <div className="guest-auth-panel__toolbar">
              <span className="guest-auth-panel__toolbar-title">
                {confirmSentTo ? 'Почта' : mode === 'register' ? 'Регистрация' : 'Вход'}
              </span>
              {!confirmSentTo ? (
                <button type="button" className="guest-auth-panel__toolbar-btn" onClick={collapse}>
                  Свернуть
                </button>
              ) : null}
            </div>

            {authBootstrapError ? (
              <div className="join-bootstrap-alert guest-auth-panel__bootstrap-alert" role="alert">
                <p className="join-error join-bootstrap-alert__text">{authBootstrapError}</p>
                <button type="button" className="login-switch__btn join-bootstrap-alert__dismiss" onClick={clearAuthBootstrapError}>
                  Скрыть
                </button>
              </div>
            ) : null}

            <div className="guest-auth-panel__body">
              {confirmSentTo ? (
                <div className="guest-auth-panel__confirm">
                  <p className="guest-auth-panel__confirm-lead">
                    Мы отправили письмо на <strong>{confirmSentTo}</strong>. Перейдите по ссылке, чтобы завершить
                    регистрацию — вы останетесь на этой странице.
                  </p>
                  <p className="guest-auth-panel__confirm-hint">Не пришло? Проверьте папку «Спам».</p>
                  <button
                    type="button"
                    className="join-btn join-btn--secondary join-btn--block guest-auth-panel__confirm-btn"
                    onClick={() => {
                      setConfirmSentTo(null)
                      setMode('login')
                      setError(null)
                    }}
                  >
                    Уже подтвердил почту — войти
                  </button>
                </div>
              ) : (
                <form id={formId} className="join-form guest-auth-panel__form" onSubmit={handleSubmit}>
                  {mode === 'register' ? (
                    <>
                      <label className="join-label" htmlFor={`${formId}-name`}>
                        Отображаемое имя
                      </label>
                      <input
                        id={`${formId}-name`}
                        className="join-input"
                        type="text"
                        placeholder="Ваше имя"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        maxLength={40}
                        autoComplete="name"
                        required
                      />
                    </>
                  ) : null}

                  <label className="join-label" htmlFor={`${formId}-email`}>
                    Email
                  </label>
                  <input
                    id={`${formId}-email`}
                    className="join-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />

                  <label className="join-label" htmlFor={`${formId}-pass`}>
                    Пароль
                  </label>
                  <input
                    id={`${formId}-pass`}
                    className="join-input"
                    type="password"
                    placeholder={mode === 'register' ? 'Минимум 6 символов' : 'Пароль'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={mode === 'register' ? 6 : undefined}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    required
                  />

                  <button
                    className="join-btn join-btn--block"
                    type="submit"
                    disabled={busy || !email.trim() || !password}
                  >
                    {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
                  </button>
                </form>
              )}

              {!confirmSentTo ? (
                <>
                  {error ? <p className="join-error guest-auth-panel__err">{error}</p> : null}
                  {mode === 'login' ? (
                    <p className="guest-auth-panel__forgot">
                      <Link to="/auth/forgot-password" className="login-switch__btn">
                        Забыли пароль?
                      </Link>
                    </p>
                  ) : null}
                  <p className="login-switch guest-auth-panel__switch">
                    {mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}{' '}
                    <button type="button" className="login-switch__btn" onClick={toggleMode}>
                      {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
                    </button>
                  </p>
                  <p className="guest-auth-panel__fullpage">
                    <Link to="/login" className="messenger-message-link">
                      Полноэкранная страница входа
                    </Link>
                  </p>
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
