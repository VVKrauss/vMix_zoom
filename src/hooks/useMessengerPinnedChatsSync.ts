import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { ToastApi } from '../context/ToastContext'
import type { UserProfile } from './useProfile'
import { supabase } from '../lib/supabase'
import {
  readMessengerPinnedChatIds,
  resolveMessengerPinnedChatsForHydration,
  writeMessengerPinnedChatIds,
} from '../lib/messengerPins'

/**
 * Закрепы списка чатов: localStorage + гидрация из профиля + debounced сохранение в users.
 */
export function useMessengerPinnedChatsSync(
  userId: string | undefined,
  profile: UserProfile | null,
  toast: ToastApi,
): { pinnedChatIds: string[]; setPinnedChatIds: Dispatch<SetStateAction<string[]>> } {
  const [pinnedChatIds, setPinnedChatIds] = useState<string[]>(() => readMessengerPinnedChatIds())
  const remoteReadyRef = useRef(false)

  const serverSig = useMemo(() => {
    if (!profile || !userId || profile.id !== userId) return ''
    if (!('messenger_pinned_conversation_ids' in profile)) return 'missing'
    return JSON.stringify(profile.messenger_pinned_conversation_ids)
  }, [profile, userId])

  useEffect(() => {
    if (!userId || !profile || profile.id !== userId) {
      if (!userId) remoteReadyRef.current = false
      return
    }
    const resolved =
      'messenger_pinned_conversation_ids' in profile
        ? resolveMessengerPinnedChatsForHydration(profile.messenger_pinned_conversation_ids)
        : resolveMessengerPinnedChatsForHydration(undefined)
    setPinnedChatIds(resolved)
    writeMessengerPinnedChatIds(resolved)
    remoteReadyRef.current = true
  }, [userId, profile, serverSig])

  useEffect(() => {
    writeMessengerPinnedChatIds(pinnedChatIds)
    if (!userId || !remoteReadyRef.current) return
    const t = window.setTimeout(() => {
      void (async () => {
        const { error } = await supabase
          .from('users')
          .update({
            messenger_pinned_conversation_ids: pinnedChatIds,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
        if (error) {
          toast.push({
            tone: 'error',
            message: `Не удалось сохранить закрепы: ${error.message}`,
            ms: 4200,
          })
        }
      })()
    }, 450)
    return () => window.clearTimeout(t)
  }, [pinnedChatIds, userId, toast])

  return { pinnedChatIds, setPinnedChatIds }
}
