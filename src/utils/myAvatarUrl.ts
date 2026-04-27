import type { AuthUser } from '../api/authApi'
import type { UserProfile } from '../hooks/useProfileData'

export function pickMyAvatarUrl(args: { profile: UserProfile | null; user: AuthUser | null }): string | null {
  const p = args.profile
  if (typeof (p as any)?.avatar_url === 'string') {
    const s = String((p as any).avatar_url).trim()
    if (s) return s
  }
  const meta = args.user?.user_metadata as Record<string, unknown> | null | undefined
  const raw = meta ? (meta['avatar_url'] as unknown) : undefined
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (s) return s
  }
  return null
}

