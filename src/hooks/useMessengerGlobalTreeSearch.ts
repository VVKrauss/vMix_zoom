import { useEffect, type Dispatch, type SetStateAction } from 'react'
import {
  searchOpenPublicConversations,
  type OpenPublicConversationSearchHit,
} from '../lib/messengerConversations'
import { searchRegisteredUsers, type RegisteredUserSearchHit } from '../lib/socialGraph'

/**
 * Debounced глобальный поиск пользователей и открытых публичных чатов в дереве.
 */
export function useMessengerGlobalTreeSearch(opts: {
  chatListSearch: string
  chatListSearchNorm: string
  setChatListGlobalUsers: Dispatch<SetStateAction<RegisteredUserSearchHit[]>>
  setChatListGlobalOpen: Dispatch<SetStateAction<OpenPublicConversationSearchHit[]>>
  setChatListGlobalLoading: Dispatch<SetStateAction<boolean>>
}): void {
  const {
    chatListSearch,
    chatListSearchNorm,
    setChatListGlobalUsers,
    setChatListGlobalOpen,
    setChatListGlobalLoading,
  } = opts

  useEffect(() => {
    if (chatListSearchNorm.length < 2) {
      setChatListGlobalUsers([])
      setChatListGlobalOpen([])
      setChatListGlobalLoading(false)
      return
    }
    let alive = true
    setChatListGlobalLoading(true)
    const t = window.setTimeout(() => {
      void Promise.all([searchRegisteredUsers(chatListSearch, 25), searchOpenPublicConversations(chatListSearch, 25)])
        .then(([u, o]) => {
          if (!alive) return
          if (u.error || o.error) {
            setChatListGlobalUsers([])
            setChatListGlobalOpen([])
          } else {
            setChatListGlobalUsers(u.data ?? [])
            setChatListGlobalOpen(o.data ?? [])
          }
          setChatListGlobalLoading(false)
        })
        .catch(() => {
          if (!alive) return
          setChatListGlobalLoading(false)
        })
    }, 320)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [chatListSearch, chatListSearchNorm])
}
