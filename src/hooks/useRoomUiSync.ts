import { useEffect, useRef } from 'react'
import { dbTableSelectOne, dbTableUpdate } from '../api/dbApi'
import type { StoredLayoutMode } from '../config/roomUiStorage'
import type { PipPos, PipSize } from '../components/DraggablePip'
import { mergeRoomUiPrefs } from '../types/roomUiPreferences'

const SAVE_DEBOUNCE_MS = 650

interface Args {
  user: { id: string } | null
  isViewportMobile: boolean
  layout: StoredLayoutMode
  pipPos: PipPos
  pipSize: PipSize
  showLayoutToggle: boolean
  hideVideoLetterboxing: boolean
  setLayout: (m: StoredLayoutMode) => void
  setPipPos: (p: PipPos) => void
  setPipSize: (s: PipSize) => void
  setShowLayoutToggle: (v: boolean) => void
  setHideVideoLetterboxing: (v: boolean) => void
}

/**
 * Десктоп + авторизованный: подтягиваем room_ui_preferences из users, сохраняем изменения в БД.
 * Мобильный / гость — только localStorage (уже в RoomPage).
 */
export function useRoomUiSync({
  user,
  isViewportMobile,
  layout,
  pipPos,
  pipSize,
  showLayoutToggle,
  hideVideoLetterboxing,
  setLayout,
  setPipPos,
  setPipSize,
  setShowLayoutToggle,
  setHideVideoLetterboxing,
}: Args): void {
  const loadedRef = useRef(false)
  const skipSavesRef = useRef(0)

  useEffect(() => {
    if (!user || isViewportMobile) {
      loadedRef.current = false
      return
    }
    if (loadedRef.current) return
    loadedRef.current = true
    let cancelled = false
    void (async () => {
      const r = await dbTableSelectOne<any>({
        table: 'users',
        select: 'room_ui_preferences',
        filters: { id: user.id },
      })
      if (cancelled || !r.ok || !r.data?.row) return
      const m = mergeRoomUiPrefs((r.data.row as any).room_ui_preferences)
        skipSavesRef.current += 1
        setLayout(m.layout_mode)
        setShowLayoutToggle(m.show_layout_toggle)
        setHideVideoLetterboxing(m.hide_video_letterboxing)
        if (m.pip) {
          setPipPos(m.pip.pos)
          setPipSize(m.pip.size)
        }
    })()
    return () => {
      cancelled = true
    }
  }, [user, isViewportMobile, setLayout, setPipPos, setPipSize, setShowLayoutToggle, setHideVideoLetterboxing])

  useEffect(() => {
    if (!user || isViewportMobile) return
    const t = window.setTimeout(() => {
      if (skipSavesRef.current > 0) {
        skipSavesRef.current -= 1
        return
      }
      void dbTableUpdate({
        table: 'users',
        filters: { id: user.id },
        patch: {
          room_ui_preferences: {
            layout_mode: layout,
            show_layout_toggle: showLayoutToggle,
            hide_video_letterboxing: hideVideoLetterboxing,
            pip: { pos: pipPos, size: pipSize },
          },
          updated_at: new Date().toISOString(),
        },
      })
    }, SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [user, isViewportMobile, layout, pipPos, pipSize, showLayoutToggle, hideVideoLetterboxing])
}
