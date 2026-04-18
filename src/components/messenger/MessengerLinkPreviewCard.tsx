import type { MessageLinkMeta } from '../../lib/linkPreview'
import { MessengerLinkOgCard } from './MessengerLinkOgCard'

type LinkLike = Pick<MessageLinkMeta, 'url' | 'title' | 'description' | 'image' | 'siteName'>

export function MessengerLinkPreviewCard({ link }: { link: LinkLike }) {
  return <MessengerLinkOgCard link={link} className="messenger-link-preview-card" />
}
