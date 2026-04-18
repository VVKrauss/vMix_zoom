import { getMessengerImageSignedUrl } from './messenger'

const CACHE_NAME = 'vmix-messenger-media-v1'
const KEY_ORIGIN = 'https://vmix-cache.local'
const MEM_MAX = 220

type MemEntry = { url: string; createdAt: number }
const mem = new Map<string, MemEntry>()

function makeKeyUrl(storagePath: string): string {
  const enc = encodeURIComponent(storagePath.trim())
  return `${KEY_ORIGIN}/messenger-media/${enc}`
}

function memGet(storagePath: string): string | null {
  const e = mem.get(storagePath)
  if (!e) return null
  // LRU-ish: refresh order
  mem.delete(storagePath)
  mem.set(storagePath, e)
  return e.url
}

function memSet(storagePath: string, url: string): void {
  mem.set(storagePath, { url, createdAt: Date.now() })
  while (mem.size > MEM_MAX) {
    const first = mem.keys().next().value as string | undefined
    if (!first) break
    const ent = mem.get(first)
    mem.delete(first)
    if (ent?.url?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(ent.url)
      } catch {
        /* ignore */
      }
    }
  }
}

async function getCachedBlob(storagePath: string): Promise<Blob | null> {
  if (typeof caches === 'undefined') return null
  const cache = await caches.open(CACHE_NAME)
  const hit = await cache.match(makeKeyUrl(storagePath))
  if (!hit) return null
  try {
    return await hit.blob()
  } catch {
    return null
  }
}

async function putCachedBlob(storagePath: string, blob: Blob): Promise<void> {
  if (typeof caches === 'undefined') return
  const cache = await caches.open(CACHE_NAME)
  const res = new Response(blob, {
    headers: {
      'content-type': blob.type || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
  await cache.put(makeKeyUrl(storagePath), res)
}

/**
 * Возвращает URL для `<img src>`.
 * - если blob уже в Cache Storage — отдаём `blob:` сразу
 * - иначе берём signed URL, скачиваем, кладём в Cache Storage и отдаём `blob:`
 * - при любой ошибке — фолбэк на signed URL (если он есть)
 */
export async function resolveMediaUrlForStoragePath(
  storagePath: string,
  opts?: { expiresSec?: number; preferSignedUrlFallback?: boolean },
): Promise<string | null> {
  const p = storagePath.trim()
  if (!p) return null

  const memHit = memGet(p)
  if (memHit) return memHit

  const cached = await getCachedBlob(p)
  if (cached && cached.size > 0) {
    const u = URL.createObjectURL(cached)
    memSet(p, u)
    return u
  }

  const expiresSec = opts?.expiresSec ?? 3600
  const signed = await getMessengerImageSignedUrl(p, expiresSec)
  const signedUrl = signed.url?.trim() || null
  if (!signedUrl) return null

  try {
    const r = await fetch(signedUrl, { mode: 'cors' })
    if (!r.ok) return opts?.preferSignedUrlFallback === false ? null : signedUrl
    const blob = await r.blob()
    if (!blob || blob.size === 0) return opts?.preferSignedUrlFallback === false ? null : signedUrl
    void putCachedBlob(p, blob)
    const u = URL.createObjectURL(blob)
    memSet(p, u)
    return u
  } catch {
    return opts?.preferSignedUrlFallback === false ? null : signedUrl
  }
}

/** Резолв нескольких путей с ограничением параллелизма (кладёт байты в Cache Storage по одному пути). */
export async function resolveMediaUrlsForStoragePaths(
  paths: string[],
  opts?: { expiresSec?: number; concurrency?: number },
): Promise<Record<string, string>> {
  const uniq = [...new Set(paths.map((p) => p.trim()).filter(Boolean))]
  const conc = Math.max(1, Math.min(opts?.concurrency ?? 8, 24))
  const out: Record<string, string> = {}
  for (let i = 0; i < uniq.length; i += conc) {
    const slice = uniq.slice(i, i + conc)
    const entries = await Promise.all(
      slice.map(async (p) => [p, await resolveMediaUrlForStoragePath(p, opts)] as const),
    )
    for (const [p, u] of entries) {
      if (u) out[p] = u
    }
  }
  return out
}
