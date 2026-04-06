import { VIDEO_PRESETS, type VideoPreset } from '../types'

/** Простой выбор качества (подробные пресеты — позже в продвинутом режиме). */
export type SimpleVideoQualityTier = 'low' | 'medium' | 'high'

const TIER_TO_PRESET_INDEX: Record<SimpleVideoQualityTier, number> = {
  low: 0,
  medium: 1,
  high: 3,
}

export const SIMPLE_VIDEO_QUALITY_LABELS: Record<SimpleVideoQualityTier, string> = {
  low: 'Низкое',
  medium: 'Среднее',
  high: 'Высокое',
}

export const SIMPLE_VIDEO_QUALITY_ORDER: SimpleVideoQualityTier[] = ['low', 'medium', 'high']

export function simpleTierToPreset(tier: SimpleVideoQualityTier): VideoPreset {
  return VIDEO_PRESETS[TIER_TO_PRESET_INDEX[tier]]!
}

export function presetToSimpleTier(preset: VideoPreset): SimpleVideoQualityTier {
  const i = VIDEO_PRESETS.findIndex(
    (p) =>
      p.width === preset.width &&
      p.height === preset.height &&
      p.maxBitrate === preset.maxBitrate,
  )
  if (i <= 0) return 'low'
  if (i === 1) return 'medium'
  return 'high'
}
