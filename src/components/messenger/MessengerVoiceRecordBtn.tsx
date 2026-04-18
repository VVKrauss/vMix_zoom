import { useCallback, useEffect, useRef, useState } from 'react'
import { MicIcon } from '../icons'
import { useMessengerVoiceRecorder } from '../../hooks/useMessengerVoiceRecorder'

/** Не passive: блокируем скролл ленты во время удержания (жест отмены вверх). */
function preventTouchDefault(e: TouchEvent) {
  e.preventDefault()
}

/** Порог сдвига вверх (px): выше — отмена при отпускании. */
const SLIDE_UP_CANCEL_PX = 56

export function MessengerVoiceRecordBtn(props: {
  disabled?: boolean
  /** Запись и загрузка фото / отправка текста */
  busy?: boolean
  onRecorded: (blob: Blob, durationSec: number) => void | Promise<void>
}) {
  const { disabled, busy, onRecorded } = props
  const onRecRef = useRef(onRecorded)
  onRecRef.current = onRecorded

  const { isRecording, seconds, error, start, stop, cancel, maxSec } = useMessengerVoiceRecorder({
    onAfterStop: (r) => {
      if (r) void onRecRef.current(r.blob, r.durationSec)
    },
  })

  const startClientYRef = useRef(0)
  const activePointerIdRef = useRef<number | null>(null)
  const slideCancelRef = useRef(false)
  const [slideCancelUi, setSlideCancelUi] = useState(false)

  const moveHandlerRef = useRef<(ev: PointerEvent) => void>(() => {})
  const endHandlerRef = useRef<(ev: PointerEvent) => void>(() => {})
  const removeListenersRef = useRef<(() => void) | null>(null)

  const onWindowMove = useCallback((e: PointerEvent) => {
    if (activePointerIdRef.current != null && e.pointerId !== activePointerIdRef.current) return
    const up = startClientYRef.current - e.clientY
    if (up > SLIDE_UP_CANCEL_PX) {
      if (!slideCancelRef.current) setSlideCancelUi(true)
      slideCancelRef.current = true
    } else {
      if (slideCancelRef.current) setSlideCancelUi(false)
      slideCancelRef.current = false
    }
  }, [])

  const onWindowEnd = useCallback(
    (e: PointerEvent) => {
      if (activePointerIdRef.current != null && e.pointerId !== activePointerIdRef.current) return
      removeListenersRef.current?.()
      removeListenersRef.current = null
      activePointerIdRef.current = null
      const wantCancel = slideCancelRef.current
      slideCancelRef.current = false
      setSlideCancelUi(false)
      if (wantCancel) {
        cancel()
        return
      }
      void stop()
    },
    [cancel, stop],
  )

  useEffect(() => {
    moveHandlerRef.current = onWindowMove
  }, [onWindowMove])
  useEffect(() => {
    endHandlerRef.current = onWindowEnd
  }, [onWindowEnd])

  /** Пока идёт запись — гасим touchmove на документе, чтобы жест «вверх» не скроллил ленту (iOS). */
  useEffect(() => {
    if (!isRecording) return
    const root = document.documentElement
    const touchOpts: AddEventListenerOptions = { passive: false }
    root.addEventListener('touchmove', preventTouchDefault, touchOpts)
    return () => root.removeEventListener('touchmove', preventTouchDefault, touchOpts)
  }, [isRecording])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || busy || e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      activePointerIdRef.current = e.pointerId
      startClientYRef.current = e.clientY
      slideCancelRef.current = false
      setSlideCancelUi(false)

      const moveWrap = (ev: Event) => moveHandlerRef.current(ev as PointerEvent)
      const endWrap = (ev: Event) => endHandlerRef.current(ev as PointerEvent)

      removeListenersRef.current = () => {
        window.removeEventListener('pointermove', moveWrap)
        window.removeEventListener('pointerup', endWrap)
        window.removeEventListener('pointercancel', endWrap)
      }

      window.addEventListener('pointermove', moveWrap, { passive: true })
      window.addEventListener('pointerup', endWrap)
      window.addEventListener('pointercancel', endWrap)

      void start().then((ok) => {
        if (!ok) {
          removeListenersRef.current?.()
          removeListenersRef.current = null
          activePointerIdRef.current = null
        }
      })
    },
    [busy, disabled, start],
  )

  return (
    <div className="messenger-voice-wrap">
      <button
        type="button"
        className={`dashboard-messenger__composer-icon-btn messenger-voice-mic-btn${isRecording ? ' messenger-voice-btn--rec' : ''}${slideCancelUi ? ' messenger-voice-btn--cancel-zone' : ''}`}
        title="Удерживайте для записи, отпустите для отправки. Вверх — отмена."
        aria-label="Голосовое сообщение: удержать для записи"
        disabled={disabled || busy}
        onPointerDown={onPointerDown}
        onContextMenu={(ev) => ev.preventDefault()}
      >
        <MicIcon />
      </button>
      {isRecording ? (
        <span className="messenger-voice-hint" aria-live="polite">
          {slideCancelUi ? (
            <span className="messenger-voice-hint--cancel">Отпустите для отмены</span>
          ) : (
            <span>Отпустите для отправки · вверх — отмена</span>
          )}
        </span>
      ) : null}
      {isRecording ? (
        <span className="messenger-voice-timer" aria-live="polite">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} / {Math.floor(maxSec / 60)}м
        </span>
      ) : null}
      {error ? (
        <span className="messenger-voice-err" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
