import { createPortal } from 'react-dom'
import type { ReactPortal } from 'react'
import { MessengerChatListMenuPopover } from '../MessengerChatListMenuPopover'
import type { MessengerConversationSummary } from '../../lib/messengerConversations'

type Anchor = { left: number; top: number; right: number; bottom: number }

export function MessengerChatListRowMenuPortal(props: {
  menu: { item: MessengerConversationSummary; anchor: Anchor } | null
  onClose: () => void
  pinned: boolean
  pinDisabled: boolean
  onTogglePin: () => void
  onMarkRead: () => void
  onDeleteChat: (() => void) | undefined
}): ReactPortal | null {
  const { menu, onClose, pinned, pinDisabled, onTogglePin, onMarkRead, onDeleteChat } = props
  if (!menu) return null
  return createPortal(
    <div
      className="messenger-chatlist-menu-anchor"
      style={{
        left: Math.min(menu.anchor.right, typeof window !== 'undefined' ? window.innerWidth - 8 : menu.anchor.right),
        top: menu.anchor.bottom + 4,
        transform: 'translateX(-100%)',
      }}
    >
      <MessengerChatListMenuPopover
        onClose={onClose}
        pinned={pinned}
        pinDisabled={pinDisabled}
        onTogglePin={onTogglePin}
        onMarkRead={onMarkRead}
        onDeleteChat={onDeleteChat}
      />
    </div>,
    document.body,
  )
}
