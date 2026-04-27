/** Страница после подтверждения почты — URL должен быть в Supabase → Authentication → Redirect URLs. */
export const AUTH_EMAIL_CONFIRMED_PATH = '/auth/email-confirmed' as const

export function getEmailConfirmationRedirectUrl(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${AUTH_EMAIL_CONFIRMED_PATH}`
}
