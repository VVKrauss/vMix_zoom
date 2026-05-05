import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  exportCoverCropPanZoomJpegBlob,
  isApproxSquare,
  letterboxToSquareJpegBlob,
  type PanZoomCoverParams,
} from '../../lib/squareCoverExport'
import './PostCoverSquareEditor.css'

const VIEWPORT_PX = 320
const MAX_OUTPUT_PX = 1080

type Mode = 'crop' | 'letterbox'

const FILL = {
  dark: '#141518',
  light: '#e8eaef',
} as const

export function PostCoverSquareEditor(props: {
  file: File
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}) {
  const { file, onCancel, onConfirm } = props
  const [mode, setMode] = useState<Mode>('crop')
  const [letterFill, setLetterFill] = useState<'dark' | 'light'>('dark')
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [busy, setBusy] = useState(false)
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const fileKey = `${file.name}-${file.size}-${file.lastModified}`

  useEffect(() => {
    let cancelled = false
    setLoadErr(null)
    setImg(null)
    const url = URL.createObjectURL(file)
    const im = new Image()
    im.onload = () => {
      if (!cancelled) setImg(im)
    }
    im.onerror = () => {
      if (!cancelled) setLoadErr('Не удалось открыть изображение')
    }
    im.src = url
    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [file, fileKey])

  const nw = img?.naturalWidth ?? 0
  const nh = img?.naturalHeight ?? 0

  const layout = useMemo(() => {
    if (!nw || !nh) return null
    const V = VIEWPORT_PX
    const baseScale = Math.max(V / nw, V / nh)
    const dispW = nw * baseScale * zoom
    const dispH = nh * baseScale * zoom
    return { baseScale, dispW, dispH, V }
  }, [nw, nh, zoom])

  useEffect(() => {
    if (!layout) return
    const { dispW, dispH, V } = layout
    setOffsetX((V - dispW) / 2)
    setOffsetY((V - dispH) / 2)
  }, [layout?.dispW, layout?.dispH, layout?.V, fileKey, zoom])

  const clampOffset = useCallback((ox: number, oy: number, dispW: number, dispH: number, V: number) => {
    const cx = Math.min(0, Math.max(V - dispW, ox))
    const cy = Math.min(0, Math.max(V - dispH, oy))
    return { cx, cy }
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (mode !== 'crop' || !layout) return
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = { sx: e.clientX, sy: e.clientY, ox: offsetX, oy: offsetY }
    },
    [mode, layout, offsetX, offsetY],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || !layout) return
      const dx = e.clientX - dragRef.current.sx
      const dy = e.clientY - dragRef.current.sy
      const nextX = dragRef.current.ox + dx
      const nextY = dragRef.current.oy + dy
      const { cx, cy } = clampOffset(nextX, nextY, layout.dispW, layout.dispH, layout.V)
      setOffsetX(cx)
      setOffsetY(cy)
    },
    [layout, clampOffset],
  )

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    dragRef.current = null
  }, [])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const handleConfirm = useCallback(async () => {
    if (!img || !layout) return
    setBusy(true)
    try {
      if (mode === 'letterbox') {
        const blob = await letterboxToSquareJpegBlob(img, {
          maxEdgePx: MAX_OUTPUT_PX,
          fillStyle: FILL[letterFill],
        })
        onConfirm(blob)
        return
      }
      const params: PanZoomCoverParams = {
        viewportPx: VIEWPORT_PX,
        zoom,
        offsetX,
        offsetY,
      }
      const blob = await exportCoverCropPanZoomJpegBlob(img, params, MAX_OUTPUT_PX)
      onConfirm(blob)
    } finally {
      setBusy(false)
    }
  }, [img, layout, mode, letterFill, zoom, offsetX, offsetY, onConfirm])

  const approxSq = nw && nh ? isApproxSquare(nw, nh) : false

  return createPortal(
    <div className="post-cover-editor-overlay" role="presentation" onClick={onCancel}>
      <div
        className="post-cover-editor-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-cover-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="post-cover-editor-title" className="post-cover-editor__title">
          Обложка для ленты
        </h2>
        <p className="post-cover-editor__hint">
          Квадрат {VIEWPORT_PX}×{VIEWPORT_PX} — выберите кадр или вписание с полями.
          {nw > 0 && nh > 0 ? (
            <span className="post-cover-editor__dims">
              {' '}
              Исходник: {nw}×{nh}
              {approxSq ? ' (почти квадрат)' : ''}
            </span>
          ) : null}
        </p>

        {loadErr ? <p className="post-cover-editor__error">{loadErr}</p> : null}

        <div className="post-cover-editor__modes" role="tablist" aria-label="Режим обложки">
          <button
            type="button"
            role="tab"
            className={`post-cover-editor__mode${mode === 'crop' ? ' post-cover-editor__mode--active' : ''}`}
            aria-selected={mode === 'crop'}
            onClick={() => setMode('crop')}
          >
            Кадрировать
          </button>
          <button
            type="button"
            role="tab"
            className={`post-cover-editor__mode${mode === 'letterbox' ? ' post-cover-editor__mode--active' : ''}`}
            aria-selected={mode === 'letterbox'}
            onClick={() => setMode('letterbox')}
          >
            Вписать с полями
          </button>
        </div>

        <div className="post-cover-editor__viewport-wrap">
          {mode === 'crop' && img && layout ? (
            <>
              <div
                className="post-cover-editor__viewport"
                style={{ width: layout.V, height: layout.V }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- img set */}
                <img
                  src={img.src || undefined}
                  alt=""
                  className="post-cover-editor__pan-img"
                  draggable={false}
                  style={{
                    width: layout.dispW,
                    height: layout.dispH,
                    left: offsetX,
                    top: offsetY,
                  }}
                />
              </div>
              <label className="post-cover-editor__zoom">
                Масштаб
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.02}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </label>
              <p className="post-cover-editor__drag-hint">Перетащите фото, чтобы выбрать область</p>
            </>
          ) : null}

          {mode === 'letterbox' && img ? (
            <>
              <div
                className="post-cover-editor__viewport post-cover-editor__viewport--letterbox"
                style={{
                  width: VIEWPORT_PX,
                  height: VIEWPORT_PX,
                  background: FILL[letterFill],
                }}
              >
                {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */}
                <img src={img.src || undefined} alt="" className="post-cover-editor__letter-img" draggable={false} />
              </div>
              <div className="post-cover-editor__fill-pick" role="group" aria-label="Цвет полей">
                <button
                  type="button"
                  className={`post-cover-editor__fill-btn${letterFill === 'dark' ? ' post-cover-editor__fill-btn--active' : ''}`}
                  onClick={() => setLetterFill('dark')}
                >
                  Тёмные поля
                </button>
                <button
                  type="button"
                  className={`post-cover-editor__fill-btn${letterFill === 'light' ? ' post-cover-editor__fill-btn--active' : ''}`}
                  onClick={() => setLetterFill('light')}
                >
                  Светлые поля
                </button>
              </div>
              <p className="post-cover-editor__drag-hint">Вся картинка видна целиком, по краям — поля</p>
            </>
          ) : null}

          {!img && !loadErr ? (
            <div className="post-cover-editor__viewport post-cover-editor__viewport--loading">Загрузка…</div>
          ) : null}
        </div>

        <div className="post-cover-editor__actions">
          <button type="button" className="dashboard-topbar__action" onClick={onCancel} disabled={busy}>
            Отмена
          </button>
          <button
            type="button"
            className="dashboard-topbar__action dashboard-topbar__action--primary"
            onClick={() => void handleConfirm()}
            disabled={busy || !img || !layout}
          >
            {busy ? 'Обработка…' : 'Готово'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

