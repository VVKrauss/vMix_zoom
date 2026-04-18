import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { VoiceRecordComposerIcon } from '../icons'
import { useMessengerVoiceRecorder } from '../../hooks/useMessengerVoiceRecorder'

/** Не passive: блокируем скролл ленты во время удержания (жест отмены). */
function preventTouchDefault(e: TouchEvent) {
  e.preventDefault()
}

/** Порог сдвига влево (px): дальше — отмена при отпускании. */
const SLIDE_LEFT_CANCEL_PX = 56

export function MessengerVoiceRecordBtn(props: {
  disabled?: boolean
  /** Запись и загрузка фото / отправка текста */
  busy?: boolean
  onRecorded: (blob: Blob, durationSec: number) => void | Promise<void>
  /** Мобильный ряд: таймер/подсказка в контейнере слева от кнопки «Отправить». */
  variant?: 'default' | 'mobileEnd'
  /** Куда рендерить таймер (только при variant=mobileEnd). */
  metaPortalEl?: HTMLDivElement | null
  onRecordingChange?: (recording: boolean) => void
}) {
  const { disabled, busy, onRecorded, variant = 'default', metaPortalEl, onRecordingChange } = props
  const onRecRef = useRef(onRecorded)
  onRecRef.current = onRecorded

  const { isRecording, seconds, error, start, stop, cancel, maxSec } = useMessengerVoiceRecorder({
    onAfterStop: (r) => {
      if (r) void onRecRef.current(r.blob, r.durationSec)
    },
  })

  const startClientXRef = useRef(0)
  const activePointerIdRef = useRef<number | null>(null)
  const slideCancelRef = useRef(false)
  const [slideCancelUi, setSlideCancelUi] = useState(false)

  const moveHandlerRef = useRef<(ev: PointerEvent) => void>(() => {})
  const endHandlerRef = useRef<(ev: PointerEvent) => void>(() => {})
  const removeListenersRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    onRecordingChange?.(isRecording)
  }, [isRecording, onRecordingChange])

  const onWindowMove = useCallback((e: PointerEvent) => {
    if (activePointerIdRef.current != null && e.pointerId !== activePointerIdRef.current) return
    const left = startClientXRef.current - e.clientX
    if (left > SLIDE_LEFT_CANCEL_PX) {
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
      startClientXRef.current = e.clientX
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

  const hintTimer =
    isRecording && variant === 'default' ? (
      <>
        <span className="messenger-voice-hint" aria-live="polite">
          {slideCancelUi ? (
            <span className="messenger-voice-hint--cancel">Отпустите для отмены</span>
          ) : (
            <span>Отпустите для отправки · влево — отмена</span>
          )}
        </span>
        <span className="messenger-voice-timer" aria-live="polite">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} / {Math.floor(maxSec / 60)}м
        </span>
      </>
    ) : null

  const portalMeta =
    isRecording && variant === 'mobileEnd' && metaPortalEl ? (
      <>
        <span className="messenger-voice-hint" aria-live="polite">
          {slideCancelUi ? (
            <span className="messenger-voice-hint--cancel">Отпустите для отмены</span>
          ) : (
            <span>Отпустите для отправки · влево — отмена</span>
          )}
        </span>
        <span className="messenger-voice-timer" aria-live="polite">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} / {Math.floor(maxSec / 60)}м
        </span>
        {error ? (
          <span className="messenger-voice-err" role="alert">
            {error}
          </span>
        ) : null}
      </>
    ) : null

  const btn = (
    <button
      type="button"
      className={`dashboard-messenger__composer-icon-btn messenger-voice-mic-btn${isRecording ? ' messenger-voice-btn--rec' : ''}${slideCancelUi ? ' messenger-voice-btn--cancel-zone' : ''}`}
      title="Удерживайте для записи, отпустите для отправки. Влево — отмена."
      aria-label="Голосовое сообщение: удержать для записи"
      disabled={disabled || busy}
      onPointerDown={onPointerDown}
      onContextMenu={(ev) => ev.preventDefault()}
    >
      <VoiceRecordComposerIcon />
    </button>
  )

  if (variant === 'mobileEnd') {
    return (
      <>
        {portalMeta && metaPortalEl ? createPortal(portalMeta, metaPortalEl) : null}
        <div className="messenger-voice-wrap messenger-voice-wrap--mobile-end">
          {btn}
          {!isRecording && error ? (
            <span className="messenger-voice-err" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      </>
    )
  }

  return (
    <div className="messenger-voice-wrap messenger-voice-wrap--with-fixed-slot">
      <div className="messenger-voice-wrap__meta">{hintTimer}</div>
      <div className="messenger-voice-wrap__btn-slot">{btn}</div>
      {error ? (
        <span className="messenger-voice-err messenger-voice-err--below-slot" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
