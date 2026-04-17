import { markChannelRead } from './channels'
import { markGroupRead } from './groups'
import { markDirectConversationRead } from './messenger'
import type { MessengerConversationSummary } from './messengerConversations'

export async function markMessengerConversationRead(
  item: Pick<MessengerConversationSummary, 'id' | 'kind'>,
): Promise<{ error: string | null }> {
  const id = item.id.trim()
  if (!id) return { error: 'no_conversation' }
  if (item.kind === 'direct') {
    const { error } = await markDirectConversationRead(id)
    return { error }
  }
  if (item.kind === 'group') {
    return markGroupRead(id)
  }
  if (item.kind === 'channel') {
    return markChannelRead(id)
  }
  return { error: 'unknown_kind' }
}
