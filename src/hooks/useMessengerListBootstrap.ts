import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import {
  ensureDirectConversationWithUser,
  ensureSelfDirectConversation,
  type DirectMessage,
} from '../lib/messenger'
import {
  listMessengerConversationsWithContactAliases,
  type MessengerConversationSummary,
} from '../lib/messengerConversations'
import { buildMessengerUrl, pickDefaultConversationId } from '../lib/messengerDashboardUtils'

/**
 * Первичная загрузка списка чатов, мобильный bootstrap `?view=list`, ensure DM / self-DM, дефолтный navigate.
 */
export function useMessengerListBootstrap(opts: {
  userId: string | undefined
  isMobileMessenger: boolean
  navigate: NavigateFunction
  routeConversationId: string
  searchConversationId: string
  searchParams: URLSearchParams
  hasMobileOpenTarget: boolean
  inviteToken: string
  invitePreviewId: string | undefined
  inviteError: string | null
  targetUserId: string
  targetTitle: string
  conversationIdRef: MutableRefObject<string>
  lastFetchedThreadIdRef: MutableRefObject<string | null>
  prevThreadIdForClearRef: MutableRefObject<string | null>
  setItems: Dispatch<SetStateAction<MessengerConversationSummary[]>>
  setActiveConversation: Dispatch<SetStateAction<MessengerConversationSummary | null>>
  setMessages: Dispatch<SetStateAction<DirectMessage[]>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
}): void {
  const {
    userId,
    isMobileMessenger,
    navigate,
    routeConversationId,
    searchConversationId,
    searchParams,
    hasMobileOpenTarget,
    inviteToken,
    invitePreviewId,
    inviteError,
    targetUserId,
    targetTitle,
    conversationIdRef,
    lastFetchedThreadIdRef,
    prevThreadIdForClearRef,
    setItems,
    setActiveConversation,
    setMessages,
    setLoading,
    setError,
  } = opts

  const listLoadedOnceRef = useRef(false)

  useEffect(() => {
    let active = true
    const run = async () => {
      if (!userId) {
        listLoadedOnceRef.current = false
        lastFetchedThreadIdRef.current = null
        prevThreadIdForClearRef.current = null
        if (active) {
          setItems([])
          setActiveConversation(null)
          setMessages([])
          setLoading(false)
        }
        return
      }

      if (isMobileMessenger) {
        const spBoot = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
        const hasChatBoot = Boolean(spBoot.get('chat')?.trim())
        const hasWithBoot = Boolean(spBoot.get('with')?.trim())
        const hasInviteBoot = Boolean(spBoot.get('invite')?.trim())
        const hasRouteConversationBoot = Boolean(routeConversationId.trim())
        if (
          !hasChatBoot &&
          !hasWithBoot &&
          !hasInviteBoot &&
          !hasRouteConversationBoot &&
          spBoot.get('view') !== 'list'
        ) {
          navigate('/dashboard/messenger?view=list', { replace: true })
          if (active) setLoading(false)
          return
        }
      }

      const treeOnlyReturn =
        isMobileMessenger &&
        searchParams.get('view') === 'list' &&
        listLoadedOnceRef.current &&
        !hasMobileOpenTarget
      if (treeOnlyReturn) {
        if (active) {
          setLoading(false)
          setError(null)
        }
        return
      }

      if (!listLoadedOnceRef.current || Boolean(targetUserId?.trim())) {
        setLoading(true)
      }
      setError(null)

      const ensured = targetUserId
        ? await ensureDirectConversationWithUser(targetUserId, targetTitle || null)
        : await ensureSelfDirectConversation()

      if (!active) return
      if (ensured.error) {
        setError(ensured.error)
        setLoading(false)
        return
      }

      const listRes = await listMessengerConversationsWithContactAliases()
      if (!active) return
      if (listRes.error) {
        setError(listRes.error)
        setItems([])
        setLoading(false)
        return
      }

      const nextItems = listRes.data ?? []
      setItems(nextItems)
      listLoadedOnceRef.current = true

      const fromUrl = conversationIdRef.current.trim()
      const forTargetUser =
        targetUserId.trim() && typeof ensured.data === 'string' && ensured.data.trim() ? ensured.data.trim() : ''
      const inviteTok = inviteToken.trim()
      const holdMessengerInvite = Boolean(inviteTok) && !invitePreviewId?.trim() && !inviteError
      const defaultPick = holdMessengerInvite ? '' : pickDefaultConversationId(nextItems, ensured.data) || ''
      const targetConversationId = fromUrl || forTargetUser || defaultPick || ''

      const viewAtNavigate = new URLSearchParams(window.location.search).get('view')
      const viewListOnly = isMobileMessenger && viewAtNavigate === 'list'
      if (
        !conversationIdRef.current.trim() &&
        targetConversationId &&
        !viewListOnly &&
        !holdMessengerInvite
      ) {
        navigate(buildMessengerUrl(targetConversationId, targetUserId || undefined, targetTitle || undefined), {
          replace: true,
        })
      }

      if (!targetConversationId) {
        setActiveConversation(null)
        setMessages([])
        setLoading(false)
        return
      }

      setLoading(false)
    }

    void run()
    return () => {
      active = false
    }
  }, [
    hasMobileOpenTarget,
    inviteError,
    invitePreviewId,
    inviteToken,
    isMobileMessenger,
    navigate,
    routeConversationId,
    searchConversationId,
    searchParams,
    targetTitle,
    targetUserId,
    userId,
  ])
}
