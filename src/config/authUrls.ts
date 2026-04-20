/** Страница после подтверждения почты — URL должен быть в Supabase → Authentication → Redirect URLs. */
export const AUTH_EMAIL_CONFIRMED_PATH = '/auth/email-confirmed' as const
export const AUTH_PASSWORD_RESET_PATH = '/auth/reset-password' as const

export function getEmailConfirmationRedirectUrl(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${AUTH_EMAIL_CONFIRMED_PATH}`
}

export function getPasswordResetRedirectUrl(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${AUTH_PASSWORD_RESET_PATH}`
}
