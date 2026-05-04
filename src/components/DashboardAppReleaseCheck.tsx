import { useCallback, useEffect, useState } from 'react'
import { APP_VERSION } from '../config/version'
import { fetchDeployedRelease, hardReloadApp, normalizeAppRelease } from '../lib/deployedRelease'

type CheckState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; server: string }
  | { status: 'stale'; server: string }
  | { status: 'error'; message: string }

export type DashboardAppReleaseCheckProps = {
  /** Когда true — запрашиваем /release.json (раздел «Другие настройки» открыт). */
  active: boolean
}

export function DashboardAppReleaseCheck(props: DashboardAppReleaseCheckProps) {
  const { active } = props
  const [state, setState] = useState<CheckState>({ status: 'idle' })

  const runCheck = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const payload = await fetchDeployedRelease()
      if (!payload) {
        setState({
          status: 'error',
          message:
            'Не удалось загрузить release.json с сервера. Возможен старый деплой без файла версии или сбой сети.',
        })
        return
      }
      const serverN = normalizeAppRelease(payload.release)
      const localN = normalizeAppRelease(APP_VERSION)
      if (serverN === localN) {
        setState({ status: 'ok', server: payload.release })
      } else {
        setState({ status: 'stale', server: payload.release })
      }
    } catch {
      setState({ status: 'error', message: 'Ошибка сети при проверке версии.' })
    }
  }, [])

  useEffect(() => {
    if (!active) {
      setState({ status: 'idle' })
      return
    }
    void runCheck()
  }, [active, runCheck])

  if (!active) return null

  return (
    <div className="dashboard-app-release-check">
      <p className="dashboard-field__label" style={{ marginTop: 10 }}>
        Проверка актуальности
      </p>
      {state.status === 'idle' || state.status === 'loading' ? (
        <p className="dashboard-field__hint">Проверяем…</p>
      ) : null}
      {state.status === 'ok' ? (
        <>
          <p className="dashboard-field__hint">У вас актуальная версия приложения.</p>
          <p className="dashboard-field__hint">
            Версия на сервере и в этом окне: <strong>{normalizeAppRelease(state.server)}</strong>
          </p>
        </>
      ) : null}
      {state.status === 'stale' ? (
        <>
          <p className="join-error" style={{ marginTop: 6 }}>
            Доступна новая версия. На сервере: <strong>{normalizeAppRelease(state.server)}</strong>, у этого окна:{' '}
            <strong>{normalizeAppRelease(APP_VERSION)}</strong>.
          </p>
          <div className="dashboard-app-release-check__actions">
            <button type="button" className="dashboard-topbar__action dashboard-topbar__action--primary" onClick={() => void hardReloadApp()}>
              Обновить страницу
            </button>
          </div>
        </>
      ) : null}
      {state.status === 'error' ? (
        <>
          <p className="join-error" style={{ marginTop: 6 }}>
            {state.message}
          </p>
          <div className="dashboard-app-release-check__actions">
            <button type="button" className="dashboard-topbar__action" onClick={() => void runCheck()}>
              Повторить проверку
            </button>
            <button type="button" className="dashboard-topbar__action dashboard-topbar__action--primary" onClick={() => void hardReloadApp()}>
              Обновить страницу
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
