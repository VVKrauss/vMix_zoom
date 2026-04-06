/**
 * Bearer для админских маршрутов (настройки, рестарт).
 * VITE_ADMIN_API_SECRET — предпочтительно; иначе VITE_SERVER_RESTART_SECRET (обратная совместимость).
 */
export function getAdminBearerToken(): string {
  return String(
    import.meta.env.VITE_ADMIN_API_SECRET ?? import.meta.env.VITE_SERVER_RESTART_SECRET ?? '',
  ).trim()
}

export function hasAdminBearerToken(): boolean {
  return getAdminBearerToken().length > 0
}

export function adminAuthHeaders(jsonBody = false): Record<string, string> {
  const h: Record<string, string> = {}
  if (jsonBody) h['Content-Type'] = 'application/json'
  const t = getAdminBearerToken()
  if (t) h.Authorization = `Bearer ${t}`
  return h
}
