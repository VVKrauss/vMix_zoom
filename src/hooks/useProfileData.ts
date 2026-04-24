import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { normalizeProfileSlug, validateProfileSlugInput } from '../lib/profileSlug'
import { assignAutoProfileSlugIfEmpty, isProfileSlugAvailable } from '../lib/profileSlugAvailability'
import { backendMe } from '../lib/backend/authApi'

/** Глобальные роли из `user_global_roles` + справочник `roles`. */
export interface UserGlobalRole {
  code: string
  title: string | null
  scope_type: string
}

export interface UserProfile {
  id: string
  display_name: string
  /** Публичный латинский slug; null — не задан */
  profile_slug: string | null
  email: string | null
  avatar_url: string | null
  status: string
  /** jsonb с сервера; парсить через mergeRoomUiPrefs */
  room_ui_preferences: unknown | null
  global_roles: UserGlobalRole[]
  /** true — профиль не показывается в глобальном поиске */
  profile_search_closed: boolean
  profile_search_allow_by_name: boolean
  profile_search_allow_by_email: boolean
  profile_search_allow_by_slug: boolean
  /** ЛС: everyone | contacts_only */
  dm_allow_from: 'everyone' | 'contacts_only'
  /** Карточка профиля: everyone | contacts_only */
  profile_view_allow_from: 'everyone' | 'contacts_only'
  profile_show_avatar: boolean
  profile_show_slug: boolean
  profile_show_last_active: boolean
  profile_show_online: boolean
  /** Не показывать собеседникам детальные статусы доставки/прочтения исходящих ЛС */
  profile_dm_receipts_private: boolean
  /** Закреплённые в дереве мессенджера (порядок важен), max 3; если ключа нет — только localStorage (до колонки в API). */
  messenger_pinned_conversation_ids?: unknown | null
}

export interface PlanInfo {
  plan_name: string
  plan_status: string
  sub_status: string | null
  trial_ends_at: string | null
}

export interface UseProfileReturn {
  profile: UserProfile | null
  plan: PlanInfo | null
  loading: boolean
  saving: boolean
  uploadingAvatar: boolean
  error: string | null
  saveProfile: (displayName: string, profileSlugRaw?: string) => Promise<{ error: string | null }>
  searchPrivacySaving: boolean
  contactPrivacySaving: boolean
  saveSearchPrivacy: (patch: {
    profile_search_closed: boolean
    profile_search_allow_by_name: boolean
    profile_search_allow_by_email: boolean
    profile_search_allow_by_slug: boolean
  }) => Promise<{ error: string | null }>
  saveContactPrivacy: (patch: {
    dm_allow_from: 'everyone' | 'contacts_only'
    profile_view_allow_from: 'everyone' | 'contacts_only'
    profile_show_avatar: boolean
    profile_show_slug: boolean
    profile_show_last_active: boolean
    profile_show_online: boolean
    profile_dm_receipts_private: boolean
  }) => Promise<{ error: string | null }>
  uploadAvatar: (file: File) => Promise<{ error: string | null }>
  removeAvatar: () => Promise<{ error: string | null }>
  /** Проверка занятости ника (свой текущий ник считается свободным). */
  checkProfileSlugAvailable: (rawSlug: string) => Promise<boolean>
}

export function useProfileData(): UseProfileReturn {
  const { user } = useAuth()
  const [profile, setProfile]               = useState<UserProfile | null>(null)
  const [plan, setPlan]                     = useState<PlanInfo | null>(null)
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [searchPrivacySaving, setSearchPrivacySaving] = useState(false)
  const [contactPrivacySaving, setContactPrivacySaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  useEffect(() => {
    const uid = user?.id
    if (!uid) {
      setProfile(null)
      setPlan(null)
      setLoading(false)
      setError(null)
      return
    }

    const fetchProfile = async () => {
      setLoading(true)
      setError(null)

      const me = await backendMe()
      if (!me.user) {
        setError(me.error ?? 'me_failed')
        setLoading(false)
        return
      }

      setProfile({
        id: me.user.id,
        display_name: me.user.displayName,
        profile_slug: null,
        email: me.user.email ?? user.email ?? null,
        avatar_url: me.user.avatarUrl,
        status: 'active',
        room_ui_preferences: null,
        global_roles: [],
        profile_search_closed: false,
        profile_search_allow_by_name: true,
        profile_search_allow_by_email: false,
        profile_search_allow_by_slug: true,
        dm_allow_from: 'everyone',
        profile_view_allow_from: 'everyone',
        profile_show_avatar: true,
        profile_show_slug: true,
        profile_show_last_active: false,
        profile_show_online: false,
        profile_dm_receipts_private: false,
      })

      setPlan({ plan_name: 'Free', plan_status: 'active', sub_status: null, trial_ends_at: null })

      setLoading(false)
    }

    void fetchProfile()
  }, [user?.id])

  const checkProfileSlugAvailable = useCallback(
    async (rawSlug: string): Promise<boolean> => {
      if (!user) return false
      const raw = rawSlug.trim()
      if (!raw) return true
      const err = validateProfileSlugInput(raw)
      if (err) return false
      const normalized = normalizeProfileSlug(raw)
      return isProfileSlugAvailable(normalized, user.id)
    },
    [user],
  )

  const saveProfile = useCallback(
    async (displayName: string, profileSlugRaw?: string): Promise<{ error: string | null }> => {
      if (!user || !profile) return { error: 'Нет пользователя' }
      setSaving(true)

      const trimmed = displayName.trim()
      if (!trimmed) {
        setSaving(false)
        return { error: 'Имя не может быть пустым' }
      }

      let nextSlug: string | null = profile.profile_slug
      if (profileSlugRaw !== undefined) {
        const raw = profileSlugRaw.trim()
        if (raw.length === 0) {
          nextSlug = null
        } else {
          const slugErr = validateProfileSlugInput(raw)
          if (slugErr) {
            setSaving(false)
            return { error: slugErr }
          }
          nextSlug = normalizeProfileSlug(raw)
          if (nextSlug !== profile.profile_slug) {
            const free = await isProfileSlugAvailable(nextSlug, user.id)
            if (!free) {
              setSaving(false)
              return { error: 'Это имя пользователя уже занято' }
            }
          }
        }
      }

      const patch: Record<string, unknown> = {
        display_name: trimmed,
        updated_at: new Date().toISOString(),
      }
      if (profileSlugRaw !== undefined) {
        patch.profile_slug = nextSlug
      }

      // profile update is still Supabase-based; keep local-only during backend migration
      void patch

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              display_name: trimmed,
              ...(profileSlugRaw !== undefined ? { profile_slug: nextSlug } : {}),
            }
          : prev,
      )
      setSaving(false)
      return { error: null }
    },
    [user, profile],
  )

  const uploadAvatar = useCallback(async (file: File): Promise<{ error: string | null }> => {
    if (!user) return { error: 'Нет пользователя' }
    setUploadingAvatar(true)
    void file
    setUploadingAvatar(false)
    return { error: 'avatar_not_migrated' }
  }, [user])

  const saveSearchPrivacy = useCallback(
    async (patch: {
      profile_search_closed: boolean
      profile_search_allow_by_name: boolean
      profile_search_allow_by_email: boolean
      profile_search_allow_by_slug: boolean
    }): Promise<{ error: string | null }> => {
      if (!user || !profile) return { error: 'Нет пользователя' }
      setSearchPrivacySaving(true)
      const body = {
        profile_search_closed: patch.profile_search_closed,
        profile_search_allow_by_name: patch.profile_search_allow_by_name,
        profile_search_allow_by_email: patch.profile_search_allow_by_email,
        profile_search_allow_by_slug: patch.profile_search_allow_by_slug,
        updated_at: new Date().toISOString(),
      }
      void body
      setSearchPrivacySaving(false)
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              profile_search_closed: patch.profile_search_closed,
              profile_search_allow_by_name: patch.profile_search_allow_by_name,
              profile_search_allow_by_email: patch.profile_search_allow_by_email,
              profile_search_allow_by_slug: patch.profile_search_allow_by_slug,
            }
          : prev,
      )
      return { error: null }
    },
    [user, profile],
  )

  const saveContactPrivacy = useCallback(
    async (patch: {
      dm_allow_from: 'everyone' | 'contacts_only'
      profile_view_allow_from: 'everyone' | 'contacts_only'
      profile_show_avatar: boolean
      profile_show_slug: boolean
      profile_show_last_active: boolean
      profile_show_online: boolean
      profile_dm_receipts_private: boolean
    }): Promise<{ error: string | null }> => {
      if (!user || !profile) return { error: 'Нет пользователя' }
      setContactPrivacySaving(true)
      const body = {
        dm_allow_from: patch.dm_allow_from,
        profile_view_allow_from: patch.profile_view_allow_from,
        profile_show_avatar: patch.profile_show_avatar,
        profile_show_slug: patch.profile_show_slug,
        profile_show_last_active: patch.profile_show_last_active,
        profile_show_online: patch.profile_show_online,
        profile_dm_receipts_private: patch.profile_dm_receipts_private,
        updated_at: new Date().toISOString(),
      }
      void body
      setContactPrivacySaving(false)
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              ...patch,
            }
          : prev,
      )
      return { error: null }
    },
    [user, profile],
  )

  const removeAvatar = useCallback(async (): Promise<{ error: string | null }> => {
    if (!user || !profile?.avatar_url) return { error: null }
    // avatar remove is still Supabase-based; keep local-only during backend migration
    setProfile((prev) => (prev ? { ...prev, avatar_url: null } : prev))
    return { error: null }
  }, [user, profile])

  return {
    profile,
    plan,
    loading,
    saving,
    searchPrivacySaving,
    contactPrivacySaving,
    uploadingAvatar,
    error,
    saveProfile,
    saveSearchPrivacy,
    saveContactPrivacy,
    uploadAvatar,
    removeAvatar,
    checkProfileSlugAvailable,
  }
}
