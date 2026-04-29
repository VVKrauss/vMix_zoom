import { useEffect, useRef } from 'react'
import { v1GetMeProfile, v1PatchMeProfile } from '../api/meProfileApi'
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
      const r = await v1GetMeProfile()
      if (cancelled || r.error || !r.data) return
      const m = mergeRoomUiPrefs((r.data as any).room_ui_preferences)
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
      void v1PatchMeProfile({
        room_ui_preferences: {
          layout_mode: layout,
          show_layout_toggle: showLayoutToggle,
          hide_video_letterboxing: hideVideoLetterboxing,
          pip: { pos: pipPos, size: pipSize },
        },
      })
    }, SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [user, isViewportMobile, layout, pipPos, pipSize, showLayoutToggle, hideVideoLetterboxing])
}
