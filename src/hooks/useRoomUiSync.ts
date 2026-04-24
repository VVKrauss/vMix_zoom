import { useEffect, useRef } from 'react'
import type { StoredLayoutMode } from '../config/roomUiStorage'
import type { PipPos, PipSize } from '../components/DraggablePip'
import { mergeRoomUiPrefs } from '../types/roomUiPreferences'

const SAVE_DEBOUNCE_MS = 650

type MinimalUser = { id: string }

interface Args {
  user: MinimalUser | null
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
    // room_ui_preferences persistence is still Supabase-based; disable during backend migration
    if (!user || isViewportMobile) loadedRef.current = false
  }, [user, isViewportMobile, setLayout, setPipPos, setPipSize, setShowLayoutToggle, setHideVideoLetterboxing])

  useEffect(() => {
    void skipSavesRef.current
    void SAVE_DEBOUNCE_MS
    void user
    void isViewportMobile
    void layout
    void pipPos
    void pipSize
    void showLayoutToggle
    void hideVideoLetterboxing
  }, [user, isViewportMobile, layout, pipPos, pipSize, showLayoutToggle, hideVideoLetterboxing])
}
