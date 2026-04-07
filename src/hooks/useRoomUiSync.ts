import { useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { StoredLayoutMode } from '../config/roomUiStorage'
import type { PipPos, PipSize } from '../components/DraggablePip'
import { mergeRoomUiPrefs } from '../types/roomUiPreferences'

const SAVE_DEBOUNCE_MS = 650

interface Args {
  user: User | null
  isViewportMobile: boolean
  layout: StoredLayoutMode
  pipPos: PipPos
  pipSize: PipSize
  showLayoutToggle: boolean
  setLayout: (m: StoredLayoutMode) => void
  setPipPos: (p: PipPos) => void
  setPipSize: (s: PipSize) => void
  setShowLayoutToggle: (v: boolean) => void
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
  setLayout,
  setPipPos,
  setPipSize,
  setShowLayoutToggle,
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
    void supabase
      .from('users')
      .select('room_ui_preferences')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        const m = mergeRoomUiPrefs(data.room_ui_preferences)
        skipSavesRef.current += 1
        setLayout(m.layout_mode)
        setShowLayoutToggle(m.show_layout_toggle)
        if (m.pip) {
          setPipPos(m.pip.pos)
          setPipSize(m.pip.size)
        }
      })
    return () => {
      cancelled = true
    }
  }, [user, isViewportMobile, setLayout, setPipPos, setPipSize, setShowLayoutToggle])

  useEffect(() => {
    if (!user || isViewportMobile) return
    const t = window.setTimeout(() => {
      if (skipSavesRef.current > 0) {
        skipSavesRef.current -= 1
        return
      }
      void supabase
        .from('users')
        .update({
          room_ui_preferences: {
            layout_mode: layout,
            show_layout_toggle: showLayoutToggle,
            pip: { pos: pipPos, size: pipSize },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
    }, SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [user, isViewportMobile, layout, pipPos, pipSize, showLayoutToggle])
}
