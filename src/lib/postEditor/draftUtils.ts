import type { PostBlock, PostDraftV1 } from './types'
import { newBlockId } from './types'

export function createEmptyDraft(): PostDraftV1 {
  return {
    v: 1,
    title: '',
    subtitle: '',
    coverImage: null,
    slug: '',
    seoTitle: '',
    seoDescription: '',
    seoImage: '',
    blocks: [{ id: newBlockId(), type: 'paragraph', text: '' }],
    materials: [],
    status: 'draft',
  }
}

/** Текст для поля body / превью в списке чатов */
export function draftToPreviewBody(d: PostDraftV1): string {
  const title = (d.title ?? '').trim()
  const excerpt = firstPlainExcerpt(d.blocks, 220)
  if (title && excerpt) return `${title}\n${excerpt}`
  if (title) return title
  return excerpt || 'Пост'
}

function stripLightMd(s: string): string {
  let t = s
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1')
  t = t.replace(/\*([^*]+)\*/g, '$1')
  t = t.replace(/__([^_]+)__/g, '$1')
  t = t.replace(/_([^_]+)_/g, '$1')
  t = t.replace(/`([^`]+)`/g, '$1')
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  return t
}

function firstPlainExcerpt(blocks: PostBlock[], max: number): string {
  for (const b of blocks) {
    if (b.type === 'paragraph' || b.type === 'heading2' || b.type === 'heading3') {
      const raw = (b.text ?? '').trim().replace(/\s+/g, ' ')
      const t = stripLightMd(raw)
      if (t) return t.length > max ? `${t.slice(0, max)}…` : t
    }
    if (b.type === 'quote') {
      const raw = (b.text ?? '').trim().replace(/\s+/g, ' ')
      const t = stripLightMd(raw)
      if (t) return t.length > max ? `${t.slice(0, max)}…` : t
    }
  }
  return ''
}

export function blockHasRenderableContent(b: PostBlock): boolean {
  switch (b.type) {
    case 'paragraph':
    case 'heading2':
    case 'heading3':
      return Boolean((b.text ?? '').trim())
    case 'image':
      return Boolean((b.url ?? '').trim())
    case 'gallery':
      return (b.items ?? []).some((i) => (i.url ?? '').trim())
    case 'quote':
      return Boolean((b.text ?? '').trim())
    case 'divider':
      return true
    case 'video':
      return Boolean((b.url ?? '').trim())
    case 'linkCard':
      return Boolean((b.url ?? '').trim())
    case 'cta':
      return Boolean((b.text ?? '').trim() && (b.url ?? '').trim())
    default:
      return false
  }
}

/** Минимум один контентный или медиа-блок (кроме одного пустого абзаца) */
export function draftHasPublishableBody(d: PostDraftV1): boolean {
  const meaningful = d.blocks.filter((b) => {
    if (b.type === 'paragraph' && !(b.text ?? '').trim()) return false
    if (b.type === 'divider') return false
    return blockHasRenderableContent(b)
  })
  return meaningful.length > 0
}

export function isPostDraftV1(raw: unknown): raw is PostDraftV1 {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return false
  if (typeof o.title !== 'string') return false
  if (!Array.isArray(o.blocks)) return false
  return true
}

export function migrateLegacyBodyToDraft(body: string): PostDraftV1 {
  const d = createEmptyDraft()
  d.blocks = [{ id: newBlockId(), type: 'paragraph', text: body.trim() }]
  return d
}

export function normalizeSeoFromDraft(d: PostDraftV1): PostDraftV1 {
  const title = d.title.trim()
  const subtitle = (d.subtitle ?? '').trim()
  const excerpt = firstPlainExcerpt(d.blocks, 160)
  return {
    ...d,
    seoTitle: (d.seoTitle ?? '').trim() || title,
    seoDescription:
      (d.seoDescription ?? '').trim() || subtitle || excerpt || (d.seoDescription ?? ''),
    seoImage: (d.seoImage ?? '').trim() || (d.coverImage ?? '') || '',
  }
}

export function parsePostDraftFromMeta(raw: unknown): PostDraftV1 | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.postDraft && isPostDraftV1(o.postDraft)) return o.postDraft as PostDraftV1
  if (isPostDraftV1(raw)) return raw as PostDraftV1
  return null
}

export function mergeMetaWithDraft(
  existing: Record<string, unknown> | null | undefined,
  draft: PostDraftV1,
  linkFromFirstCard?: { url: string; title?: string; description?: string; image?: string; siteName?: string } | null,
): Record<string, unknown> {
  const base = existing && typeof existing === 'object' ? { ...existing } : {}
  const normalized = normalizeSeoFromDraft(draft)
  base.postDraft = normalized
  if (linkFromFirstCard?.url) base.link = linkFromFirstCard
  return base
}

const MS_RE = /\bms:\/\/([^\s)]+)\b/g

export function collectStoragePathsFromDraft(d: PostDraftV1): string[] {
  const paths = new Set<string>()
  const addFromUrl = (u: string | undefined | null) => {
    const s = (u ?? '').trim()
    if (s.startsWith('ms://')) paths.add(s.slice('ms://'.length))
  }
  addFromUrl(d.coverImage)
  addFromUrl(d.seoImage)
  for (const b of d.blocks) {
    switch (b.type) {
      case 'image':
        addFromUrl(b.url)
        break
      case 'gallery':
        for (const it of b.items ?? []) addFromUrl(it.url)
        break
      default:
        break
    }
  }
  for (const b of d.blocks) {
    if (b.type === 'paragraph' || b.type === 'heading2' || b.type === 'heading3' || b.type === 'quote') {
      let m: RegExpExecArray | null
      const t = b.text ?? ''
      MS_RE.lastIndex = 0
      while ((m = MS_RE.exec(t))) {
        const p = (m[1] ?? '').trim()
        if (p) paths.add(p)
      }
    }
  }
  return [...paths]
}

export function firstLinkCardMeta(blocks: PostBlock[]): {
  url: string
  title?: string
  description?: string
  image?: string
  siteName?: string
} | null {
  for (const b of blocks) {
    if (b.type !== 'linkCard') continue
    const url = (b.url ?? '').trim()
    if (!url) continue
    return {
      url,
      ...(b.title ? { title: b.title } : {}),
      ...(b.description ? { description: b.description } : {}),
      ...(b.image ? { image: b.image } : {}),
    }
  }
  return null
}
