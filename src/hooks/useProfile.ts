import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

/** Глобальные роли из `user_global_roles` + справочник `roles`. */
export interface UserGlobalRole {
  code: string
  title: string | null
  scope_type: string
}

export interface UserProfile {
  id: string
  display_name: string
  email: string | null
  avatar_url: string | null
  status: string
  /** jsonb с сервера; парсить через mergeRoomUiPrefs */
  room_ui_preferences: unknown | null
  global_roles: UserGlobalRole[]
}

export interface PlanInfo {
  plan_name: string
  plan_status: string
  sub_status: string | null
  trial_ends_at: string | null
}

interface UseProfileReturn {
  profile: UserProfile | null
  plan: PlanInfo | null
  loading: boolean
  saving: boolean
  uploadingAvatar: boolean
  error: string | null
  saveProfile: (displayName: string) => Promise<{ error: string | null }>
  uploadAvatar: (file: File) => Promise<{ error: string | null }>
  removeAvatar: () => Promise<{ error: string | null }>
}

export function useProfile(): UseProfileReturn {
  const { user } = useAuth()
  const [profile, setProfile]               = useState<UserProfile | null>(null)
  const [plan, setPlan]                     = useState<PlanInfo | null>(null)
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    const fetchProfile = async () => {
      setLoading(true)
      setError(null)

      const [{ data: userData, error: userError }, { data: roleRows, error: rolesError }] = await Promise.all([
        supabase
          .from('users')
          .select('id, display_name, email, avatar_url, status, room_ui_preferences')
          .eq('id', user.id)
          .single(),
        supabase
          .from('user_global_roles')
          .select('roles ( code, title, scope_type )')
          .eq('user_id', user.id),
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

      setProfile({
        id: userData.id,
        display_name: userData.display_name,
        email: userData.email ?? user.email ?? null,
        avatar_url: userData.avatar_url,
        status: userData.status,
        room_ui_preferences: userData.room_ui_preferences ?? null,
        global_roles: globalRoles,
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

    fetchProfile()
  }, [user])

  const saveProfile = useCallback(async (displayName: string): Promise<{ error: string | null }> => {
    if (!user || !profile) return { error: 'Нет пользователя' }
    setSaving(true)

    const trimmed = displayName.trim()
    if (!trimmed) { setSaving(false); return { error: 'Имя не может быть пустым' } }

    const { error: dbErr } = await supabase
      .from('users')
      .update({ display_name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (dbErr) { setSaving(false); return { error: dbErr.message } }

    await supabase.auth.updateUser({ data: { display_name: trimmed } })

    setProfile((prev) => (prev ? { ...prev, display_name: trimmed } : prev))
    setSaving(false)
    return { error: null }
  }, [user, profile])

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

  return { profile, plan, loading, saving, uploadingAvatar, error, saveProfile, uploadAvatar, removeAvatar }
}
