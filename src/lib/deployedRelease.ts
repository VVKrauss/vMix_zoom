/** Нормализация строки версии для сравнения (как в vite `computeAppVersion`). */
export function normalizeAppRelease(s: string): string {
  return String(s ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^v\s*/i, '')
    .trim()
}

export type DeployedReleasePayload = {
  release: string
}

/** Актуальная версия с сервера (тот же `release`, что в `version.json` на момент деплоя). */
export async function fetchDeployedRelease(): Promise<DeployedReleasePayload | null> {
  const base = import.meta.env.BASE_URL || '/'
  const prefix = base.endsWith('/') ? base : `${base}/`
  const url = `${prefix}release.json?_=${Date.now()}`
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!res.ok) return null
  let data: unknown
  try {
    data = await res.json()
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const rel = (data as { release?: unknown }).release
  if (typeof rel !== 'string' || !rel.trim()) return null
  return { release: rel.trim() }
}

/** Сброс SW-кэша и перезагрузка, чтобы подтянуть новый бандл после деплоя. */
export async function hardReloadApp(): Promise<void> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* ignore */
  }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
  } catch {
    /* ignore */
  }
  window.location.reload()
}
