import { extractYoutubeVideoId } from './youtube'

export type VideoProviderKind = 'youtube' | 'vimeo' | 'rutube' | 'vk' | 'dailymotion' | 'generic'

export function detectVideoProvider(url: string): VideoProviderKind {
  const s = url.trim()
  if (!s) return 'generic'
  if (extractYoutubeVideoId(s)) return 'youtube'
  try {
    const u = new URL(s)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (host === 'youtu.be') return 'youtube'
    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) return 'vimeo'
    if (host === 'rutube.ru' || host.endsWith('.rutube.ru')) return 'rutube'
    if (host.includes('vk.com') || host.includes('vkvideo.ru') || host === 'vk.cc') return 'vk'
    if (host.includes('dailymotion.com') || host === 'dai.ly') return 'dailymotion'
    return 'generic'
  } catch {
    return 'generic'
  }
}

export function videoOpenActionLabel(kind: VideoProviderKind): string {
  switch (kind) {
    case 'youtube':
      return 'Открыть на YouTube'
    case 'vimeo':
      return 'Открыть на Vimeo'
    case 'rutube':
      return 'Открыть на Rutube'
    case 'vk':
      return 'Открыть во VK'
    case 'dailymotion':
      return 'Открыть на Dailymotion'
    default:
      return 'Открыть видео'
  }
}

export function faviconUrlForPage(url: string): string | null {
  try {
    const host = new URL(url).hostname
    if (!host) return null
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`
  } catch {
    return null
  }
}
