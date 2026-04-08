import type { StoredLayoutMode } from '../config/roomUiStorage'

export interface PipPosPref {
  x: number
  y: number
}
export interface PipSizePref {
  w: number
  h: number
}

export interface RoomUiPreferences {
  layout_mode?: StoredLayoutMode
  pip?: { pos: PipPosPref; size: PipSizePref }
  /** Показывать круглую кнопку переключения раскладки в комнате (десктоп) */
  show_layout_toggle?: boolean
  /**
   * Камера в плитках: true — обрезать под контейнер без полос (object-fit: cover).
   * false — вписать весь кадр (contain), могут быть поля по краям.
   */
  hide_video_letterboxing?: boolean
}

export const DEFAULT_ROOM_UI_PREFS: Required<
  Pick<RoomUiPreferences, 'layout_mode' | 'show_layout_toggle' | 'hide_video_letterboxing'>
> = {
  layout_mode: 'pip',
  show_layout_toggle: true,
  hide_video_letterboxing: true,
}

export function mergeRoomUiPrefs(raw: unknown): {
  layout_mode: StoredLayoutMode
  show_layout_toggle: boolean
  hide_video_letterboxing: boolean
  pip: { pos: PipPosPref; size: PipSizePref } | null
} {
  const base = DEFAULT_ROOM_UI_PREFS
  if (!raw || typeof raw !== 'object') {
    return { ...base, pip: null }
  }
  const o = raw as Record<string, unknown>
  const layoutRaw = o.layout_mode
  const layout_mode =
    layoutRaw === 'grid' || layoutRaw === 'pip' || layoutRaw === 'speaker' || layoutRaw === 'meet'
      ? layoutRaw
      : base.layout_mode
  const show_layout_toggle =
    typeof o.show_layout_toggle === 'boolean' ? o.show_layout_toggle : base.show_layout_toggle
  const hide_video_letterboxing =
    typeof o.hide_video_letterboxing === 'boolean'
      ? o.hide_video_letterboxing
      : base.hide_video_letterboxing

  const pipRaw = o.pip
  let pip: { pos: PipPosPref; size: PipSizePref } | null = null
  if (pipRaw && typeof pipRaw === 'object') {
    const p = pipRaw as Record<string, unknown>
    const pos = p.pos as Record<string, unknown> | undefined
    const size = p.size as Record<string, unknown> | undefined
    if (
      pos &&
      typeof pos.x === 'number' &&
      typeof pos.y === 'number' &&
      size &&
      typeof size.w === 'number' &&
      typeof size.h === 'number' &&
      size.w > 0 &&
      size.h > 0
    ) {
      pip = { pos: { x: pos.x, y: pos.y }, size: { w: size.w, h: size.h } }
    }
  }

  return { layout_mode, show_layout_toggle, hide_video_letterboxing, pip }
}

export function prefsToJson(p: RoomUiPreferences): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (p.layout_mode != null) out.layout_mode = p.layout_mode
  if (p.pip != null) out.pip = p.pip
  if (p.show_layout_toggle != null) out.show_layout_toggle = p.show_layout_toggle
  if (p.hide_video_letterboxing != null) out.hide_video_letterboxing = p.hide_video_letterboxing
  return out
}
