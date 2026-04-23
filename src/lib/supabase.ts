import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const supabaseUrlDirect = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/$/, '') ?? ''

/** Прямой origin Supabase из сборки (без слэша). */
export function getSupabaseDirectOrigin(): string {
  return supabaseUrlDirect
}

const STORAGE_USE_PROXY = 'vmix-supabase-use-proxy'

function trimOrigin(value: string): string {
  return value.trim().replace(/\/$/, '')
}

/** В сборке задан HTTPS-прокси к тому же проекту Supabase (см. дашборд «Прокси для базы»). */
export function isSupabaseProxyOriginConfigured(): boolean {
  const raw = import.meta.env.VITE_SUPABASE_PROXY_ORIGIN as string | undefined
  return Boolean(raw && trimOrigin(String(raw)))
}

function supabaseProxyOrigin(): string {
  return trimOrigin(String(import.meta.env.VITE_SUPABASE_PROXY_ORIGIN ?? ''))
}

/** Публичный origin прокси (без слэша) или пустая строка, если не задан в сборке. */
export function getSupabaseProxyOrigin(): string {
  if (!isSupabaseProxyOriginConfigured()) return ''
  return supabaseProxyOrigin()
}

/**
 * Запросы supabase-js идут на прокси-origin вместо VITE_SUPABASE_URL.
 * Хранится в localStorage; после смены нужна перезагрузка страницы (см. дашборд).
 */
export function getSupabaseUseProxy(): boolean {
  if (!isSupabaseProxyOriginConfigured()) return false
  try {
    const v = localStorage.getItem(STORAGE_USE_PROXY)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    /* приватный режим / запрет storage */
  }
  return import.meta.env.VITE_SUPABASE_PROXY_DEFAULT === 'true'
}

export function setSupabaseUseProxy(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_USE_PROXY, value ? '1' : '0')
  } catch {
    /* noop */
  }
}

function resolveSupabaseUrl(): string {
  if (!supabaseUrlDirect || !supabaseAnonKey) {
    throw new Error('VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY должны быть заданы в .env')
  }
  if (getSupabaseUseProxy() && isSupabaseProxyOriginConfigured()) {
    return supabaseProxyOrigin()
  }
  return supabaseUrlDirect
}

const supabaseResolvedUrl = resolveSupabaseUrl()

const supabaseViaProxy = Boolean(isSupabaseProxyOriginConfigured() && getSupabaseUseProxy())

/** В dev при включённом тумблере: каждый fetch к origin прокси — одна строка в консоль. */
function createDevProxyFetchLogger(baseUrl: string): typeof fetch {
  const origin = new URL(baseUrl).origin
  return (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const method =
        (init?.method as string | undefined)?.toUpperCase() ??
        (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')
      let href = ''
      if (typeof input === 'string') href = input
      else if (typeof URL !== 'undefined' && input instanceof URL) href = input.href
      else if (typeof Request !== 'undefined' && input instanceof Request) href = input.url
      if (!href) return fetch(input as RequestInfo, init)
      const abs = /^https?:\/\//i.test(href) ? href : new URL(href.replace(/^\//, ''), `${origin}/`).href
      const u = new URL(abs)
      if (u.origin === origin) {
        console.info('[Supabase·прокси]', method, u.pathname + u.search)
      }
    } catch {
      /* noop */
    }
    return fetch(input as RequestInfo, init)
  }
}

export let supabase: SupabaseClient = createClient(
  supabaseResolvedUrl,
  supabaseAnonKey,
  import.meta.env.DEV && supabaseViaProxy
    ? { global: { fetch: createDevProxyFetchLogger(supabaseResolvedUrl) } }
    : undefined,
)

if (import.meta.env.DEV) {
  if (supabaseViaProxy) {
    console.info('[Supabase] ТУМБЛЕР ПРОКСИ ВКЛ — запросы к БД / auth / realtime →', supabaseResolvedUrl)
    console.info(
      '[Supabase] «[Supabase·прокси]» — только HTTP (rest/auth/storage). Realtime (wss) смотрите во вкладке Network → WS.',
    )
  } else {
    console.info('[Supabase] Прокси выкл — клиент напрямую →', supabaseResolvedUrl)
  }
}
