/** Ключ источника для студии: камера или экран участника. */
export type StudioSourceKey = string

export type StudioRect = {
  /** 0..1 относительно доски */
  x: number
  y: number
  w: number
  h: number
}

export type StudioSlotState = {
  sourceKey: StudioSourceKey | null
  rect: StudioRect
}

export type StudioBoardState = {
  slots: StudioSlotState[]
}

export const STUDIO_SLOT_COUNT = 6

/** Слоты 3×2 на доске 16:9: каждая плитка 16:9 (в нормализованных координатах w === h). */
export function defaultStudioRectForSlot(index: number): StudioRect {
  const col = index % 3
  const row = Math.floor(index / 3)
  const gap = 0.02
  const w = (1 - 4 * gap) / 3
  const h = w
  const rowGap = 0.02
  const totalH = 2 * h + rowGap
  const offsetY = Math.max(0, (1 - totalH) / 2)
  return {
    x: gap + col * (w + gap),
    y: offsetY + row * (h + rowGap),
    w,
    h,
  }
}

export function emptyStudioBoard(): StudioBoardState {
  return {
    slots: Array.from({ length: STUDIO_SLOT_COUNT }, (_, i) => ({
      sourceKey: null,
      rect: defaultStudioRectForSlot(i),
    })),
  }
}

export function studioSourceCameraKey(peerId: string): StudioSourceKey {
  return `cam:${peerId}`
}

export function studioSourceScreenKey(peerId: string): StudioSourceKey {
  return `scr:${peerId}`
}

export type StudioSourceOption = {
  key: StudioSourceKey
  label: string
  kind: 'camera' | 'screen'
  peerId: string
  /** Зарегистрированный пользователь-владелец источника; для избранного и т.п. */
  authUserId?: string | null
  displayName: string
  avatarUrl?: string | null
  /** Видео для превью и канваса. Если null, источник рисуется как заглушка участника. */
  stream: MediaStream | null
  /** Отдельный поток для метра (например микрофон при `videoStream` без звука). */
  meterStream?: MediaStream | null
}

/** Выход студии на RTMP (размер канваса + лимит битрейта видео). */
export type StudioOutputPreset = {
  id: string
  label: string
  width: number
  height: number
  maxBitrate: number
  maxFramerate: number
}

export const STUDIO_OUTPUT_PRESETS: StudioOutputPreset[] = [
  /** 848 вместо 854: ширина кратна 16 — меньше сюрпризов у libx264/RTMP после масштабирования. */
  { id: '854x480', label: '480p', width: 848, height: 480, maxBitrate: 1_500_000, maxFramerate: 30 },
  { id: '1280x720', label: '720p', width: 1280, height: 720, maxBitrate: 4_000_000, maxFramerate: 30 },
  { id: '1920x1080', label: '1080p', width: 1920, height: 1080, maxBitrate: 6_000_000, maxFramerate: 30 },
  { id: '1920x1080-hi', label: '1080p · высокий битрейт', width: 1920, height: 1080, maxBitrate: 10_000_000, maxFramerate: 30 },
]

export const DEFAULT_STUDIO_OUTPUT_PRESET_ID = STUDIO_OUTPUT_PRESETS[1]!.id

export function findStudioOutputPreset(id: string): StudioOutputPreset {
  return STUDIO_OUTPUT_PRESETS.find((p) => p.id === id) ?? STUDIO_OUTPUT_PRESETS[1]!
}
