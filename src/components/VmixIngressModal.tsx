import { useCallback, useEffect, useState } from 'react'
import type { VmixIngressInfo } from '../types'

interface Props {
  open: boolean
  info: VmixIngressInfo | null
  onClose: () => void
  /** После первого старта — «Ок»; из шеврона — только просмотр, «Закрыть». */
  mode?: 'setup' | 'reference'
}

function CopyCell({ label, value }: { label: string; value: string | number }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(String(value)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }, [value])

  return (
    <tr className="vmix-modal__row">
      <td className="vmix-modal__cell vmix-modal__cell--label">{label}</td>
      <td className="vmix-modal__cell vmix-modal__cell--value">
        <code>{value}</code>
        <button type="button" className="vmix-modal__copy" onClick={copy} title="Скопировать">
          {copied ? '✓' : '⎘'}
        </button>
      </td>
    </tr>
  )
}

export function VmixIngressModal({ open, info, onClose, mode = 'setup' }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !info) return null

  return (
    <div className="confirm-dialog-root">
      <button type="button" className="confirm-dialog-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="confirm-dialog vmix-modal" role="dialog" aria-modal="true" aria-labelledby="vmix-modal-title">
        <h2 id="vmix-modal-title" className="confirm-dialog__title">
          {mode === 'reference' ? 'Параметры подключения SRT' : 'Настройки SRT (Caller)'}
        </h2>
        <p className="confirm-dialog__msg">
          {mode === 'reference' ? (
            <>Текущие параметры <strong>SRT (Caller)</strong> в SRT-источнике (H.264&nbsp;+&nbsp;AAC):</>
          ) : (
            <>Выберите <strong>SRT (Caller)</strong>, кодеки H.264&nbsp;+&nbsp;AAC, и укажите параметры ниже:</>
          )}
        </p>
        <table className="vmix-modal__table">
          <tbody>
            <CopyCell label="Hostname" value={info.publicHost} />
            <CopyCell label="Port" value={info.listenPort} />
            <CopyCell label="Latency (ms)" value={info.latencyMs} />
            {'videoBitrateKbps' in info && info.videoBitrateKbps !== undefined && (
              <tr className="vmix-modal__row">
                <td className="vmix-modal__cell vmix-modal__cell--label">Битрейт видео (сервер)</td>
                <td className="vmix-modal__cell vmix-modal__cell--value">
                  <code>{info.videoBitrateKbps === null ? 'без лимита' : `${info.videoBitrateKbps} кбит/с`}</code>
                </td>
              </tr>
            )}
            {info.passphrase && <CopyCell label="Passphrase" value={info.passphrase} />}
            {info.streamId && <CopyCell label="Stream ID" value={info.streamId} />}
            {info.pbkeylen && <CopyCell label="Key length" value={info.pbkeylen} />}
          </tbody>
        </table>
        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-dialog__btn confirm-dialog__btn--primary" onClick={onClose}>
            {mode === 'reference' ? 'Закрыть' : 'Ок'}
          </button>
        </div>
      </div>
    </div>
  )
}
