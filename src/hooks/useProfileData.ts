import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { normalizeProfileSlug, validateProfileSlugInput } from '../lib/profileSlug'
import { assignAutoProfileSlugIfEmpty, isProfileSlugAvailable } from '../lib/profileSlugAvailability'
import { authUpdateProfile } from '../api/authApi'
import { storageGetPublicUrl, storageRemove, storageUpload } from '../api/storageApi'
import { v1GetMeProfile, v1PatchMeProfile } from '../api/meProfileApi'

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

      const me = await v1GetMeProfile()
      if (me.error || !me.data?.profile) {
        setError(me.error ?? 'profile_load_failed')
        setLoading(false)
        return
      }

      const userData = me.data.profile as Record<string, unknown>
      const roleRows = Array.isArray(me.data.roles) ? (me.data.roles as unknown[]) : []

      const globalRoles: UserGlobalRole[] = []
      for (const raw of roleRows) {
        const row = raw as Record<string, unknown>
        const code = typeof row.code === 'string' ? row.code : ''
        if (!code) continue
        globalRoles.push({
          code,
          title: typeof row.title === 'string' ? row.title : null,
          scope_type: typeof row.scope_type === 'string' ? row.scope_type : 'global',
        })
      }

      const ROLE_SORT = ['superadmin', 'platform_admin', 'support_admin', 'registered_user'] as const
      globalRoles.sort((a, b) => {
        const ia = ROLE_SORT.indexOf(a.code as (typeof ROLE_SORT)[number])
        const ib = ROLE_SORT.indexOf(b.code as (typeof ROLE_SORT)[number])
        const pa = ia === -1 ? 99 : ia
        const pb = ib === -1 ? 99 : ib
        if (pa !== pb) return pa - pb
        return a.code.localeCompare(b.code)
      })

      let resolvedSlug: string | null =
        typeof userData.profile_slug === 'string' && userData.profile_slug.trim()
          ? userData.profile_slug.trim()
          : null

      if (!resolvedSlug) {
        const assigned = await assignAutoProfileSlugIfEmpty(String(userData.id ?? ''))
        if (assigned.slug) resolvedSlug = assigned.slug
      }

      setProfile({
        id: String(userData.id ?? ''),
        display_name: String(userData.display_name ?? ''),
        profile_slug: resolvedSlug,
        email: (userData.email as any) ?? user.email ?? null,
        avatar_url: (userData.avatar_url as any) ?? null,
        status: String(userData.status ?? ''),
        room_ui_preferences: (userData.room_ui_preferences as any) ?? null,
        global_roles: globalRoles,
        profile_search_closed: userData.profile_search_closed === true,
        profile_search_allow_by_name: userData.profile_search_allow_by_name !== false,
        profile_search_allow_by_email: userData.profile_search_allow_by_email === true,
        profile_search_allow_by_slug: userData.profile_search_allow_by_slug !== false,
        dm_allow_from: userData.dm_allow_from === 'contacts_only' ? 'contacts_only' : 'everyone',
        profile_view_allow_from:
          userData.profile_view_allow_from === 'contacts_only' ? 'contacts_only' : 'everyone',
        profile_show_avatar: userData.profile_show_avatar !== false,
        profile_show_slug: userData.profile_show_slug !== false,
        profile_show_last_active: userData.profile_show_last_active !== false,
        profile_show_online: (userData as Record<string, unknown>).profile_show_online !== false,
        profile_dm_receipts_private:
          (userData as Record<string, unknown>).profile_dm_receipts_private === true,
        ...('messenger_pinned_conversation_ids' in userData
          ? { messenger_pinned_conversation_ids: userData.messenger_pinned_conversation_ids ?? null }
          : {}),
      })

      const subData = me.data.plan as any
      if (subData?.title) {
        setPlan({
          plan_name: String(subData.title ?? 'Pro'),
          plan_status: 'active',
          sub_status: String(subData.status ?? 'active'),
          trial_ends_at: typeof subData.trial_ends_at === 'string' ? subData.trial_ends_at : null,
        })
      } else {
        setPlan({ plan_name: 'Free', plan_status: 'active', sub_status: null, trial_ends_at: null })
      }

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

      const { error: dbErr } = await v1PatchMeProfile(patch)

      if (dbErr) {
        setSaving(false)
        if (String(dbErr).includes('23505') || String(dbErr).includes('unique')) return { error: 'Это имя пользователя уже занято' }
        return { error: dbErr }
      }

      void authUpdateProfile({
        displayName: trimmed,
        ...(profileSlugRaw !== undefined ? { profileSlug: nextSlug } : {}),
      })

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

    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${user.id}/avatar.${ext}`

    const up = await storageUpload({ bucket: 'avatars', path, file, upsert: true, contentType: file.type })
    if (!up.ok) { setUploadingAvatar(false); return { error: up.error.message } }

    const publicUrl = await storageGetPublicUrl({ bucket: 'avatars', path })
    // Добавляем cache-bust чтобы браузер не отображал старый аватар
    const urlWithBust = `${publicUrl}?t=${Date.now()}`

    const r = await v1PatchMeProfile({ avatar_url: urlWithBust, updated_at: new Date().toISOString() })

    if (r.error) { setUploadingAvatar(false); return { error: r.error } }

    void authUpdateProfile({ avatarUrl: urlWithBust })

    setProfile((prev) => prev ? { ...prev, avatar_url: urlWithBust } : prev)
    setUploadingAvatar(false)
    return { error: null }
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
      const r = await v1PatchMeProfile(body)
      setSearchPrivacySaving(false)
      if (r.error) return { error: r.error }
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
      const r = await v1PatchMeProfile(body)
      setContactPrivacySaving(false)
      if (r.error) return { error: r.error }
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
    setUploadingAvatar(true)

    void storageRemove({
      bucket: 'avatars',
      paths: [`${user.id}/avatar.jpg`, `${user.id}/avatar.png`, `${user.id}/avatar.webp`, `${user.id}/avatar.gif`],
    })

    const r = await v1PatchMeProfile({ avatar_url: null, updated_at: new Date().toISOString() })
    if (r.error) { setUploadingAvatar(false); return { error: r.error } }

    void authUpdateProfile({ avatarUrl: null })

    setProfile((prev) => prev ? { ...prev, avatar_url: null } : prev)
    setUploadingAvatar(false)
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
