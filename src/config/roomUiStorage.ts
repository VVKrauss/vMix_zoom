import type { PipPos, PipSize } from '../components/DraggablePip'
import { mediaQueryMaxWidthMobile } from './uiBreakpoints'
import { DEFAULT_VIDEO_PRESET, VIDEO_PRESETS, type VideoPreset } from '../types'

const LS_ROOM_LAYOUT = 'vmix_room_layout'
/** Предпочтение раскладки только для узкого viewport; без ключа — мобильный дефолт (сетка). */
const LS_ROOM_LAYOUT_MOBILE = 'vmix_room_layout_mobile'
const LS_PIP_LAYOUT = 'vmix_pip_layout'
const LS_PIP_LAYOUT_MOBILE = 'vmix_pip_layout_mobile'
const LS_VIDEO_PRESET_INDEX = 'vmix_video_preset_index'
const LS_PREFERRED_CAMERA = 'vmix_preferred_camera_id'
const LS_PREFERRED_MIC = 'vmix_preferred_mic_id'

const LAYOUT_MODES = new Set<string>(['grid', 'pip', 'speaker', 'meet'])

export type StoredLayoutMode = 'grid' | 'pip' | 'speaker' | 'meet'

export function getDefaultLayoutMode(): StoredLayoutMode {
  if (typeof window === 'undefined') return 'pip'
  return window.matchMedia(mediaQueryMaxWidthMobile).matches ? 'grid' : 'pip'
}

export function readStoredLayoutMode(isMobileViewport: boolean): StoredLayoutMode | undefined {
  const key = isMobileViewport ? LS_ROOM_LAYOUT_MOBILE : LS_ROOM_LAYOUT
  try {
    const raw = localStorage.getItem(key)
    if (raw === 'facetile') return 'pip'
    if (raw != null && LAYOUT_MODES.has(raw)) return raw as StoredLayoutMode
  } catch {
    /* noop */
  }
  return undefined
}

export function writeStoredLayoutMode(mode: StoredLayoutMode, isMobileViewport: boolean): void {
  const key = isMobileViewport ? LS_ROOM_LAYOUT_MOBILE : LS_ROOM_LAYOUT
  try {
    localStorage.setItem(key, mode)
  } catch {
    /* noop */
  }
}

function defaultPipLayoutForViewport(isMobileViewport: boolean): { pos: PipPos; size: PipSize } {
  return {
    pos: { x: 16, y: 10 },
    size: isMobileViewport ? { w: 140, h: 94 } : { w: 220, h: 148 },
  }
}

export function readStoredPipLayout(isMobileViewport: boolean): { pos: PipPos; size: PipSize } {
  const key = isMobileViewport ? LS_PIP_LAYOUT_MOBILE : LS_PIP_LAYOUT
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultPipLayoutForViewport(isMobileViewport)
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object') return defaultPipLayoutForViewport(isMobileViewport)
    const rec = o as Record<string, unknown>
    const pos = rec.pos as Record<string, unknown> | undefined
    const size = rec.size as Record<string, unknown> | undefined
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
      return { pos: { x: pos.x, y: pos.y }, size: { w: size.w, h: size.h } }
    }
  } catch {
    /* noop */
  }
  return defaultPipLayoutForViewport(isMobileViewport)
}

export function writeStoredPipLayout(
  pos: PipPos,
  size: PipSize,
  isMobileViewport: boolean,
): void {
  const key = isMobileViewport ? LS_PIP_LAYOUT_MOBILE : LS_PIP_LAYOUT
  try {
    localStorage.setItem(key, JSON.stringify({ pos, size }))
  } catch {
    /* noop */
  }
}

export function getStoredVideoPreset(): VideoPreset {
  try {
    const raw = localStorage.getItem(LS_VIDEO_PRESET_INDEX)
    if (raw == null) return DEFAULT_VIDEO_PRESET
    const i = Number.parseInt(raw, 10)
    if (Number.isFinite(i) && i >= 0 && i < VIDEO_PRESETS.length) return VIDEO_PRESETS[i]!
  } catch {
    /* noop */
  }
  return DEFAULT_VIDEO_PRESET
}

export function persistVideoPreset(preset: VideoPreset): void {
  const i = VIDEO_PRESETS.findIndex(
    (p) =>
      p.width === preset.width &&
      p.height === preset.height &&
      p.maxBitrate === preset.maxBitrate,
  )
  if (i < 0) return
  try {
    localStorage.setItem(LS_VIDEO_PRESET_INDEX, String(i))
  } catch {
    /* noop */
  }
}

export function readPreferredCameraId(): string {
  try {
    return localStorage.getItem(LS_PREFERRED_CAMERA) ?? ''
  } catch {
    return ''
  }
}

export function readPreferredMicId(): string {
  try {
    return localStorage.getItem(LS_PREFERRED_MIC) ?? ''
  } catch {
    return ''
  }
}

export function writePreferredCameraId(deviceId: string): void {
  try {
    if (deviceId) localStorage.setItem(LS_PREFERRED_CAMERA, deviceId)
    else localStorage.removeItem(LS_PREFERRED_CAMERA)
  } catch {
    /* noop */
  }
}

export function writePreferredMicId(deviceId: string): void {
  try {
    if (deviceId) localStorage.setItem(LS_PREFERRED_MIC, deviceId)
    else localStorage.removeItem(LS_PREFERRED_MIC)
  } catch {
    /* noop */
  }
}
