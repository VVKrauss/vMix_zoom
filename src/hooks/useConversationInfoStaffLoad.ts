import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { listConversationStaffMembers, type ConversationStaffMember, type ConversationStaffRole } from '../lib/conversationStaff'
import type { MessengerConversationSummary } from '../lib/messengerConversations'

/**
 * Список модераторов/стаффа в модалке инфо при редактировании (owner/admin).
 */
export function useConversationInfoStaffLoad(opts: {
  conversationInfoEdit: boolean
  conversationInfoId: string | null
  conversationInfoConv: MessengerConversationSummary | null
  conversationInfoRole: string | null
  userId: string | undefined
  setConversationStaffRows: Dispatch<SetStateAction<ConversationStaffMember[]>>
  setConversationStaffTargetUserId: Dispatch<SetStateAction<string>>
  setConversationStaffNewRole: Dispatch<SetStateAction<ConversationStaffRole>>
  setConversationStaffLoading: Dispatch<SetStateAction<boolean>>
}): void {
  const {
    conversationInfoEdit,
    conversationInfoId,
    conversationInfoConv,
    conversationInfoRole,
    userId,
    setConversationStaffRows,
    setConversationStaffTargetUserId,
    setConversationStaffNewRole,
    setConversationStaffLoading,
  } = opts

  useEffect(() => {
    if (!conversationInfoEdit) {
      setConversationStaffRows([])
      setConversationStaffTargetUserId('')
      setConversationStaffNewRole('moderator')
      setConversationStaffLoading(false)
      return
    }
    const id = conversationInfoId?.trim()
    if (
      !id ||
      !userId ||
      !conversationInfoConv ||
      (conversationInfoConv.kind !== 'group' && conversationInfoConv.kind !== 'channel')
    ) {
      return
    }
    if (!conversationInfoRole || !['owner', 'admin'].includes(conversationInfoRole)) {
      return
    }
    let cancelled = false
    setConversationStaffLoading(true)
    void listConversationStaffMembers(id).then((r) => {
      if (cancelled) return
      setConversationStaffLoading(false)
      if (r.error) {
        setConversationStaffRows([])
        return
      }
      setConversationStaffRows(r.data ?? [])
      setConversationStaffTargetUserId('')
      setConversationStaffNewRole('moderator')
    })
    return () => {
      cancelled = true
    }
  }, [
    conversationInfoEdit,
    conversationInfoId,
    conversationInfoConv?.id,
    conversationInfoConv?.kind,
    conversationInfoRole,
    userId,
  ])
}
