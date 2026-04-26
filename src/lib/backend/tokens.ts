const ACCESS_KEY = 'redflow-access-token'
const REFRESH_KEY = 'redflow-refresh-token'

export function getAccessToken(): string {
  try {
    return localStorage.getItem(ACCESS_KEY) ?? ''
  } catch {
    return ''
  }
}

export function getRefreshToken(): string {
  try {
    return localStorage.getItem(REFRESH_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setTokens(tokens: { accessToken: string; refreshToken: string } | null): void {
  try {
    if (!tokens) {
      localStorage.removeItem(ACCESS_KEY)
      localStorage.removeItem(REFRESH_KEY)
      return
    }
    localStorage.setItem(ACCESS_KEY, tokens.accessToken)
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken)
  } catch {
    /* noop */
  }
}

