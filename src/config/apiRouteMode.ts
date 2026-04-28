export type ApiRouteMode = 'direct' | 'proxy'

const KEY = 'rf_api_route_mode'
export const API_ROUTE_MODE_CHANGED_EVENT = 'rf_api_route_mode_changed'

function isMode(x: unknown): x is ApiRouteMode {
  return x === 'direct' || x === 'proxy'
}

export function readApiRouteMode(): ApiRouteMode | null {
  try {
    const v = globalThis.localStorage?.getItem(KEY)
    return isMode(v) ? v : null
  } catch {
    return null
  }
}

export function writeApiRouteMode(mode: ApiRouteMode | null): void {
  try {
    if (!globalThis.localStorage) return
    if (mode) globalThis.localStorage.setItem(KEY, mode)
    else globalThis.localStorage.removeItem(KEY)
    globalThis.dispatchEvent?.(new Event(API_ROUTE_MODE_CHANGED_EVENT))
  } catch {
    // ignore (private mode / denied storage)
  }
}

