import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudioBoardState, StudioSourceOption } from '../../types/studio'
import { clamp01 } from '../../utils/studioCanvasDraw'

type DragMode = 'move' | 'resize-se' | null

/** w/h в нормализованных координатах доски 16:9, чтобы пиксельное соотношение слоя = aspect видео. */
function normalizedWidthOverHeight(video: HTMLVideoElement | null): number {
  const av =
    video && video.videoWidth > 0 && video.videoHeight > 0
      ? video.videoWidth / video.videoHeight
      : 16 / 9
  return (av * 9) / 16
}

interface Props {
  title: string
  board: StudioBoardState
  onBoardChange: (next: StudioBoardState) => void
  sources: StudioSourceOption[]
  /** Только для доски «Эфир» — видео для захвата canvas. */
  registerProgramVideo?: (slotIndex: number, el: HTMLVideoElement | null) => void
  /** Скрыть ряд кнопок выбора источника (только «Эфир»). */
  hideSlotPickers?: boolean
  /** Запретить перетаскивание и ресайз слоёв (только «Эфир»). */
  readOnlyStage?: boolean
}

function slotLabel(boardState: StudioBoardState, index: number, sources: StudioSourceOption[]): string {
  const k = boardState.slots[index]?.sourceKey
  if (!k) return 'Нет'
  return sources.find((s) => s.key === k)?.label ?? k
}

export function StudioBoardPanel({
  title,
  board: boardState,
  onBoardChange,
  sources,
  registerProgramVideo,
  hideSlotPickers = false,
  readOnlyStage = false,
}: Props) {
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    slot: number
    mode: DragMode
    startX: number
    startY: number
    startRect: { x: number; y: number; w: number; h: number }
    boardW: number
    boardH: number
    aspectWH: number
  } | null>(null)

  useEffect(() => {
    if (openMenu == null) return
    const close = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      setOpenMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [openMenu])

  const updateSlotRect = useCallback(
    (slot: number, rect: { x: number; y: number; w: number; h: number }) => {
      onBoardChange({
        slots: boardState.slots.map((s, i) => (i === slot ? { ...s, rect } : s)),
      })
    },
    [boardState.slots, onBoardChange],
  )

  const updateSlotSource = useCallback(
    (slot: number, key: string | null) => {
      onBoardChange({
        slots: boardState.slots.map((s, i) => (i === slot ? { ...s, sourceKey: key } : s)),
      })
      setOpenMenu(null)
    },
    [boardState.slots, onBoardChange],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const dx = (e.clientX - d.startX) / d.boardW
      const dy = (e.clientY - d.startY) / d.boardH
      let { x, y, w, h } = d.startRect
      if (d.mode === 'move') {
        x = clamp01(x + dx)
        y = clamp01(y + dy)
        if (x + w > 1) x = 1 - w
        if (y + h > 1) y = 1 - h
      } else if (d.mode === 'resize-se') {
        const k = d.aspectWH
        const minH = 0.08
        const minW = minH * k
        const sW = (d.startRect.w + dx) / d.startRect.w
        const sH = (d.startRect.h + dy) / d.startRect.h
        const s = Math.max(sW, sH)
        let wn = d.startRect.w * s
        let hn = wn / k
        wn = Math.max(minW, wn)
        hn = wn / k
        x = d.startRect.x
        y = d.startRect.y
        if (x + wn > 1) {
          wn = 1 - x
          hn = wn / k
        }
        if (y + hn > 1) {
          hn = 1 - y
          wn = hn * k
        }
        if (wn < minW) {
          wn = minW
          hn = wn / k
        }
        w = wn
        h = hn
      }
      updateSlotRect(d.slot, { x, y, w, h })
    },
    [updateSlotRect],
  )

  const endDrag = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
  }, [onPointerMove])

  const startDrag = useCallback(
    (slot: number, mode: DragMode, e: React.PointerEvent, boardEl: HTMLDivElement, layerEl?: HTMLDivElement | null) => {
      e.preventDefault()
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      const r = boardEl.getBoundingClientRect()
      const s = boardState.slots[slot]
      if (!s) return
      const video = layerEl?.querySelector('video') ?? null
      const aspectWH = mode === 'resize-se' ? normalizedWidthOverHeight(video) : 1
      dragRef.current = {
        slot,
        mode,
        startX: e.clientX,
        startY: e.clientY,
        startRect: { ...s.rect },
        boardW: r.width,
        boardH: r.height,
        aspectWH,
      }
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', endDrag)
      window.addEventListener('pointercancel', endDrag)
    },
    [boardState.slots, onPointerMove, endDrag],
  )

  return (
    <div className="studio-board-panel" ref={rootRef}>
      <div className="studio-board-panel__title">{title}</div>
      {hideSlotPickers ? null : (
        <div className="studio-slot-pickers" role="toolbar" aria-label={`Источники: ${title}`}>
          {boardState.slots.map((_, i) => (
            <div key={i} className="studio-slot-picker">
              <button
                type="button"
                className={`studio-slot-picker__btn${openMenu === i ? ' studio-slot-picker__btn--open' : ''}`}
                onClick={() => setOpenMenu((v) => (v === i ? null : i))}
              >
                {slotLabel(boardState, i, sources)}
              </button>
              {openMenu === i ? (
                <div className="studio-slot-picker__menu" role="listbox">
                  <button
                    type="button"
                    className="studio-slot-picker__item"
                    onClick={() => updateSlotSource(i, null)}
                  >
                    Нет
                  </button>
                  {sources.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className="studio-slot-picker__item"
                      onClick={() => updateSlotSource(i, s.key)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <div className={`studio-board-stage${readOnlyStage ? ' studio-board-stage--readonly' : ''}`} ref={stageRef}>
        {boardState.slots.map((slot, i) => {
          const src = slot.sourceKey ? sources.find((s) => s.key === slot.sourceKey) : null
          const stream = src?.stream
          return (
            <div key={i} className="studio-board-stage__slot-wrap">
              {stream ? (
                <div
                  className={`studio-layer${readOnlyStage ? ' studio-layer--readonly' : ''}`}
                  style={{
                    left: `${slot.rect.x * 100}%`,
                    top: `${slot.rect.y * 100}%`,
                    width: `${slot.rect.w * 100}%`,
                    height: `${slot.rect.h * 100}%`,
                  }}
                  onPointerDown={
                    readOnlyStage
                      ? undefined
                      : (e) => {
                          if ((e.target as HTMLElement).closest('.studio-layer__resize')) return
                          const stage = stageRef.current
                          if (stage) startDrag(i, 'move', e, stage, e.currentTarget)
                        }
                  }
                >
                  <video
                    ref={(el) => {
                      if (registerProgramVideo) registerProgramVideo(i, el)
                      if (el) {
                        el.srcObject = stream
                        void el.play().catch(() => {})
                      }
                    }}
                    className="studio-layer__video"
                    autoPlay
                    playsInline
                    muted
                  />
                  {readOnlyStage ? null : (
                    <button
                      type="button"
                      className="studio-layer__resize"
                      aria-label="Размер (пропорции источника)"
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        const stage = stageRef.current
                        const layer = e.currentTarget.closest('.studio-layer') as HTMLDivElement | null
                        if (stage) startDrag(i, 'resize-se', e, stage, layer)
                      }}
                    />
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
