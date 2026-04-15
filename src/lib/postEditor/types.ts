/** Структура черновика поста (редактор канала), meta.postDraft v1 */

export type PostDraftStatus = 'draft' | 'published'

export type PostMaterial = {
  id: string
  title: string
  url: string
}

export type PostBlock =
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'heading2'; text: string }
  | { id: string; type: 'heading3'; text: string }
  | { id: string; type: 'image'; url: string; caption?: string }
  | { id: string; type: 'gallery'; items: { url: string; caption?: string }[] }
  | { id: string; type: 'quote'; text: string; author?: string }
  | { id: string; type: 'divider' }
  | {
      id: string
      type: 'video'
      provider: 'youtube'
      url: string
      title?: string
      description?: string
      thumbnail?: string
    }
  | { id: string; type: 'linkCard'; url: string; title?: string; description?: string; image?: string }
  | { id: string; type: 'cta'; text: string; url: string }

export type PostDraftV1 = {
  v: 1
  title: string
  subtitle?: string
  coverImage?: string | null
  slug?: string
  seoTitle?: string
  seoDescription?: string
  seoImage?: string
  blocks: PostBlock[]
  materials: PostMaterial[]
  status: PostDraftStatus
}

export function newBlockId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `b-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}
