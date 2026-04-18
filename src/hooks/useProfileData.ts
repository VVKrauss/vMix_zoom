import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { normalizeProfileSlug, validateProfileSlugInput } from '../lib/profileSlug'
import { assignAutoProfileSlugIfEmpty, isProfileSlugAvailable } from '../lib/profileSlugAvailability'

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

      const [{ data: userData, error: userError }, { data: roleRows, error: rolesError }] = await Promise.all([
        supabase
          .from('users')
          .select(
            'id, display_name, profile_slug, email, avatar_url, status, room_ui_preferences, messenger_pinned_conversation_ids, profile_search_closed, profile_search_allow_by_name, profile_search_allow_by_email, profile_search_allow_by_slug, dm_allow_from, profile_view_allow_from, profile_show_avatar, profile_show_slug, profile_show_last_active, profile_dm_receipts_private',
          )
          .eq('id', uid)
          .single(),
        supabase
          .from('user_global_roles')
          .select('roles ( code, title, scope_type )')
          .eq('user_id', uid),
      ])

      if (userError) {
        setError(userError.message)
        setLoading(false)
        return
      }

      const globalRoles: UserGlobalRole[] = []
      if (!rolesError && Array.isArray(roleRows)) {
        for (const row of roleRows as { roles: UserGlobalRole | UserGlobalRole[] | null }[]) {
          const r = row.roles
          if (!r) continue
          const list = Array.isArray(r) ? r : [r]
          for (const x of list) {
            if (x?.code) globalRoles.push(x)
          }
        }
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
        const assigned = await assignAutoProfileSlugIfEmpty(userData.id)
        if (assigned.slug) resolvedSlug = assigned.slug
      }

      setProfile({
        id: userData.id,
        display_name: userData.display_name,
        profile_slug: resolvedSlug,
        email: userData.email ?? user.email ?? null,
        avatar_url: userData.avatar_url,
        status: userData.status,
        room_ui_preferences: userData.room_ui_preferences ?? null,
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
        profile_dm_receipts_private:
          (userData as Record<string, unknown>).profile_dm_receipts_private === true,
        ...('messenger_pinned_conversation_ids' in userData
          ? { messenger_pinned_conversation_ids: userData.messenger_pinned_conversation_ids ?? null }
          : {}),
      })

      // Подписка: берём через аккаунт владельца
      const { data: subData } = await supabase
        .from('account_subscriptions')
        .select(`
          status,
          trial_ends_at,
          subscription_plans ( title )
        `)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()

      if (subData) {
        const plans = subData.subscription_plans as unknown as { title: string } | null
        const planTitle = plans?.title ?? 'Pro'
        setPlan({
          plan_name: planTitle,
          plan_status: 'active',
          sub_status: subData.status,
          trial_ends_at: subData.trial_ends_at,
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

      const { error: dbErr } = await supabase.from('users').update(patch).eq('id', user.id)

      if (dbErr) {
        setSaving(false)
        if (dbErr.code === '23505') {
          return { error: 'Это имя пользователя уже занято' }
        }
        return { error: dbErr.message }
      }

      await supabase.auth.updateUser({
        data: {
          display_name: trimmed,
          ...(profileSlugRaw !== undefined ? { profile_slug: nextSlug } : {}),
        },
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

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadErr) { setUploadingAvatar(false); return { error: uploadErr.message } }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    // Добавляем cache-bust чтобы браузер не отображал старый аватар
    const urlWithBust = `${publicUrl}?t=${Date.now()}`

    const { error: dbErr } = await supabase
      .from('users')
      .update({ avatar_url: urlWithBust, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (dbErr) { setUploadingAvatar(false); return { error: dbErr.message } }

    await supabase.auth.updateUser({ data: { avatar_url: urlWithBust } })

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
      const { error: dbErr } = await supabase.from('users').update(body).eq('id', user.id)
      setSearchPrivacySaving(false)
      if (dbErr) return { error: dbErr.message }
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
        profile_dm_receipts_private: patch.profile_dm_receipts_private,
        updated_at: new Date().toISOString(),
      }
      const { error: dbErr } = await supabase.from('users').update(body).eq('id', user.id)
      setContactPrivacySaving(false)
      if (dbErr) return { error: dbErr.message }
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

    await supabase.storage.from('avatars').remove([
      `${user.id}/avatar.jpg`,
      `${user.id}/avatar.png`,
      `${user.id}/avatar.webp`,
      `${user.id}/avatar.gif`,
    ])

    const { error: dbErr } = await supabase
      .from('users')
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (dbErr) { setUploadingAvatar(false); return { error: dbErr.message } }

    await supabase.auth.updateUser({ data: { avatar_url: null } })

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
