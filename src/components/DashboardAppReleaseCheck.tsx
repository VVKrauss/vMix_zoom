import { useCallback, useEffect, useState } from 'react'
import { APP_VERSION } from '../config/version'
import { fetchDeployedRelease, hardReloadApp, normalizeAppRelease } from '../lib/deployedRelease'
import { FiRrIcon } from './icons'

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
        setState({ status: 'error', message: 'no_release' })
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
      setState({ status: 'error', message: 'network' })
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

  const current = normalizeAppRelease(APP_VERSION)

  return (
    <div className="dashboard-app-release-check">
      <p className="dashboard-field__hint" style={{ marginTop: 8 }}>
        Текущая версия: {current}
      </p>
      {state.status === 'idle' || state.status === 'loading' ? (
        <p className="dashboard-field__hint">…</p>
      ) : null}
      {state.status === 'ok' ? <p className="dashboard-field__hint">Обновлений нет.</p> : null}
      {state.status === 'stale' ? (
        <p className="dashboard-field__hint dashboard-app-release-check__update-row">
          Есть обновление: {normalizeAppRelease(state.server)}.{' '}
          <button type="button" className="dashboard-app-release-check__update-link" onClick={() => void hardReloadApp()}>
            Обновить
          </button>
          <button
            type="button"
            className="dashboard-app-release-check__icon-btn"
            aria-label="Обновить приложение"
            title="Обновить"
            onClick={() => void hardReloadApp()}
          >
            <FiRrIcon name="download" className="dashboard-app-release-check__icon-btn-ico" />
          </button>
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className="dashboard-field__hint dashboard-app-release-check__update-row">
          Не удалось проверить обновление.{' '}
          <button type="button" className="dashboard-app-release-check__update-link" onClick={() => void runCheck()}>
            Повторить
          </button>
          <button
            type="button"
            className="dashboard-app-release-check__icon-btn"
            aria-label="Обновить приложение"
            title="Обновить"
            onClick={() => void hardReloadApp()}
          >
            <FiRrIcon name="download" className="dashboard-app-release-check__icon-btn-ico" />
          </button>
        </p>
      ) : null}
    </div>
  )
}
