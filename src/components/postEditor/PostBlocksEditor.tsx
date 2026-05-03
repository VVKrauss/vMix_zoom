import type { KeyboardEvent } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { fetchLinkPreview } from '../../lib/linkPreview'
import type { PostBlock } from '../../lib/postEditor/types'
import { newBlockId } from '../../lib/postEditor/types'
import {
  fetchYoutubeOEmbed,
  isProbablyYoutubeUrl,
  extractYoutubeVideoId,
  youtubeThumbnailFromId,
} from '../../lib/postEditor/youtube'

const SLASH_ITEMS: { id: string; label: string; type: PostBlock['type'] }[] = [
  { id: 'p', label: 'Текст', type: 'paragraph' },
  { id: 'h2', label: 'Заголовок H2', type: 'heading2' },
  { id: 'h3', label: 'Заголовок H3', type: 'heading3' },
  { id: 'img', label: 'Изображение', type: 'image' },
  { id: 'gal', label: 'Галерея', type: 'gallery' },
  { id: 'quote', label: 'Цитата', type: 'quote' },
  { id: 'div', label: 'Разделитель', type: 'divider' },
  { id: 'vid', label: 'Видео YouTube', type: 'video' },
  { id: 'link', label: 'Карточка ссылки', type: 'linkCard' },
  { id: 'cta', label: 'Кнопка', type: 'cta' },
]

function emptyBlock(type: PostBlock['type']): PostBlock {
  const id = newBlockId()
  switch (type) {
    case 'paragraph':
      return { id, type: 'paragraph', text: '' }
    case 'heading2':
      return { id, type: 'heading2', text: '' }
    case 'heading3':
      return { id, type: 'heading3', text: '' }
    case 'image':
      return { id, type: 'image', url: '', caption: '' }
    case 'gallery':
      return { id, type: 'gallery', items: [] }
    case 'quote':
      return { id, type: 'quote', text: '', author: '' }
    case 'divider':
      return { id, type: 'divider' }
    case 'video':
      return { id, type: 'video', provider: 'youtube', url: '' }
    case 'linkCard':
      return { id, type: 'linkCard', url: '' }
    case 'cta':
      return { id, type: 'cta', text: '', url: '' }
    default:
      return { id, type: 'paragraph', text: '' }
  }
}

function applyMdWrap(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): { next: string; selStart: number; selEnd: number } {
  const sel = text.slice(start, end)
  const inner = sel || placeholder
  const next = text.slice(0, start) + before + inner + after + text.slice(end)
  const selStart = start + before.length
  const selEnd = selStart + inner.length
  return { next, selStart, selEnd }
}

function focusRichTextarea(blockId: string, selStart: number, selEnd: number) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `textarea[data-pe-block="${CSS.escape(blockId)}"]`,
      ) as HTMLTextAreaElement | null
      if (!el) return
      el.focus()
      el.setSelectionRange(selStart, selEnd)
    })
  })
}

function richTextAreaKeyDown(
  e: KeyboardEvent<HTMLTextAreaElement>,
  opts: {
    disabled?: boolean
    text: string
    blockId: string
    setText: (next: string) => void
    onEscape?: () => void
  },
) {
  if (opts.onEscape && e.key === 'Escape' && !e.ctrlKey && !e.metaKey) {
    opts.onEscape()
    return
  }
  if (opts.disabled) return
  const mod = e.ctrlKey || e.metaKey
  const ta = e.currentTarget
  if (mod && (e.key === 'b' || e.key === 'B')) {
    e.preventDefault()
    const { next, selStart, selEnd } = applyMdWrap(
      opts.text,
      ta.selectionStart,
      ta.selectionEnd,
      '**',
      '**',
      'жирный',
    )
    opts.setText(next)
    focusRichTextarea(opts.blockId, selStart, selEnd)
    return
  }
  if (mod && (e.key === 'i' || e.key === 'I')) {
    e.preventDefault()
    const { next, selStart, selEnd } = applyMdWrap(
      opts.text,
      ta.selectionStart,
      ta.selectionEnd,
      '*',
      '*',
      'курсив',
    )
    opts.setText(next)
    focusRichTextarea(opts.blockId, selStart, selEnd)
    return
  }
  if (mod && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault()
    const url = window.prompt('URL ссылки')
    if (url == null || !url.trim()) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sel = opts.text.slice(start, end)
    const label = sel.trim() || url.trim()
    const md = `[${label}](${url.trim()})`
    const next = opts.text.slice(0, start) + md + opts.text.slice(end)
    const caret = start + md.length
    opts.setText(next)
    focusRichTextarea(opts.blockId, caret, caret)
  }
}

function RichTextFormatBar({
  blockId,
  disabled,
  text,
  onApply,
}: {
  blockId: string
  disabled?: boolean
  text: string
  onApply: (next: string, selStart: number, selEnd: number) => void
}) {
  const ta = () =>
    document.querySelector(`textarea[data-pe-block="${CSS.escape(blockId)}"]`) as HTMLTextAreaElement | null
  const wrap = (before: string, after: string, ph: string) => {
    const el = ta()
    if (!el) return
    const { next, selStart, selEnd } = applyMdWrap(text, el.selectionStart, el.selectionEnd, before, after, ph)
    onApply(next, selStart, selEnd)
  }
  const link = () => {
    const el = ta()
    if (!el) return
    const url = window.prompt('URL ссылки')
    if (url == null || !url.trim()) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const sel = text.slice(start, end)
    const label = sel.trim() || url.trim()
    const md = `[${label}](${url.trim()})`
    const next = text.slice(0, start) + md + text.slice(end)
    const caret = start + md.length
    onApply(next, caret, caret)
  }
  return (
    <div className="post-blocks-editor__md-bar" aria-label="Формат текста">
      <button
        type="button"
        className="post-blocks-editor__md-btn"
        disabled={disabled}
        title="Жирный (Ctrl+B)"
        onClick={() => wrap('**', '**', 'жирный')}
      >
        Ж
      </button>
      <button
        type="button"
        className="post-blocks-editor__md-btn"
        disabled={disabled}
        title="Курсив (Ctrl+I)"
        onClick={() => wrap('*', '*', 'курсив')}
      >
        К
      </button>
      <button type="button" className="post-blocks-editor__md-btn" disabled={disabled} title="Ссылка (Ctrl+K)" onClick={link}>
        Ссылка
      </button>
      <span className="post-blocks-editor__md-hint">Ctrl+B · I · K</span>
    </div>
  )
}

export function PostBlocksEditor({
  blocks,
  onChange,
  disabled,
  onRequestImageUpload,
}: {
  blocks: PostBlock[]
  onChange: (next: PostBlock[]) => void
  disabled?: boolean
  onRequestImageUpload: (file: File) => Promise<string | null>
}) {
  const [slash, setSlash] = useState<{ index: number; query: string } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [fileTarget, setFileTarget] = useState<{ kind: 'image' | 'gallery'; blockId: string } | null>(null)

  const replaceBlock = useCallback(
    (i: number, b: PostBlock) => {
      const next = [...blocks]
      next[i] = b
      onChange(next)
    },
    [blocks, onChange],
  )

  const insertAfter = useCallback(
    (i: number, b: PostBlock) => {
      const next = [...blocks.slice(0, i + 1), b, ...blocks.slice(i + 1)]
      onChange(next)
    },
    [blocks, onChange],
  )

  const removeAt = useCallback(
    (i: number) => {
      if (blocks.length <= 1) {
        onChange([emptyBlock('paragraph')])
        return
      }
      onChange(blocks.filter((_, j) => j !== i))
    },
    [blocks, onChange],
  )

  const applySlashChoice = useCallback(
    (blockIndex: number, type: PostBlock['type']) => {
      const nb = emptyBlock(type)
      const cur = blocks[blockIndex]
      if (cur?.type === 'paragraph' && (cur.text === '/' || cur.text.startsWith('/'))) {
        replaceBlock(blockIndex, nb)
      } else {
        insertAfter(blockIndex, nb)
      }
      setSlash(null)
    },
    [blocks, insertAfter, replaceBlock],
  )

  const filteredSlash = useMemo(() => {
    if (!slash) return SLASH_ITEMS
    const q = slash.query.toLowerCase()
    if (!q) return SLASH_ITEMS
    return SLASH_ITEMS.filter((x) => x.label.toLowerCase().includes(q) || x.id.includes(q))
  }, [slash])

  const tryPasteAsUrl = useCallback(
    async (text: string, blockIndex: number) => {
      const t = text.trim()
      if (!t.startsWith('http')) return false
      if (isProbablyYoutubeUrl(t)) {
        const o = await fetchYoutubeOEmbed(t)
        const vid = extractYoutubeVideoId(t)
        replaceBlock(blockIndex, {
          id: newBlockId(),
          type: 'video',
          provider: 'youtube',
          url: t,
          title: o?.title,
          description: o?.author,
          thumbnail: o?.thumbnail ?? (vid ? youtubeThumbnailFromId(vid) : undefined),
        })
        return true
      }
      const prev = await fetchLinkPreview(t)
      if (prev.data) {
        replaceBlock(blockIndex, {
          id: newBlockId(),
          type: 'linkCard',
          url: t,
          title: prev.data.title,
          description: prev.data.description,
          image: prev.data.image,
        })
        return true
      }
      replaceBlock(blockIndex, {
        id: newBlockId(),
        type: 'linkCard',
        url: t,
        title: t,
      })
      return true
    },
    [replaceBlock],
  )

  const openFile = (kind: 'image' | 'gallery', blockId: string) => {
    setFileTarget({ kind, blockId })
    fileRef.current?.click()
  }

  return (
    <div className="post-blocks-editor">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="post-blocks-editor__file"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f || !fileTarget) return
          const path = await onRequestImageUpload(f)
          if (!path) return
          const url = `ms://${path}`
          const bid = fileTarget.blockId
          const idx = blocks.findIndex((b) => b.id === bid)
          if (idx < 0) return
          const b = blocks[idx]
          if (fileTarget.kind === 'image' && b.type === 'image') {
            replaceBlock(idx, { ...b, url })
          } else if (fileTarget.kind === 'gallery' && b.type === 'gallery') {
            replaceBlock(idx, { ...b, items: [...b.items, { url }] })
          }
          setFileTarget(null)
        }}
      />

      {blocks.map((b, i) => (
        <div key={b.id} className="post-blocks-editor__row">
          <div className="post-blocks-editor__block">
            {b.type === 'paragraph' ? (
              <div className="post-blocks-editor__slash-wrap">
                <RichTextFormatBar
                  blockId={b.id}
                  disabled={disabled}
                  text={b.text}
                  onApply={(next, selStart, selEnd) => {
                    replaceBlock(i, { ...b, text: next })
                    focusRichTextarea(b.id, selStart, selEnd)
                  }}
                />
                <textarea
                  data-pe-block={b.id}
                  className="post-blocks-editor__textarea post-blocks-editor__textarea--paragraph"
                  rows={2}
                  disabled={disabled}
                  placeholder="Текст или / для меню (**жирный**, *курсив*)"
                  value={b.text}
                  onChange={(e) => {
                    const v = e.target.value
                    replaceBlock(i, { ...b, text: v })
                    if (v === '/' || (v.startsWith('/') && !v.includes('\n'))) {
                      setSlash({ index: i, query: v.slice(1) })
                    } else {
                      setSlash((s) => (s?.index === i ? null : s))
                    }
                  }}
                  onPaste={(e) => {
                    const t = e.clipboardData.getData('text/plain')
                    if (t.startsWith('http')) {
                      e.preventDefault()
                      void tryPasteAsUrl(t, i)
                    }
                  }}
                  onKeyDown={(e) =>
                    richTextAreaKeyDown(e, {
                      disabled,
                      text: b.text,
                      blockId: b.id,
                      setText: (next) => replaceBlock(i, { ...b, text: next }),
                      onEscape: () => setSlash(null),
                    })
                  }
                />
                {slash?.index === i ? (
                  <div className="post-blocks-editor__slash-menu app-scroll">
                    {filteredSlash.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="post-blocks-editor__slash-item"
                        onClick={() => applySlashChoice(i, item.type)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {b.type === 'heading2' ? (
              <input
                className="post-blocks-editor__input post-blocks-editor__input--h2"
                disabled={disabled}
                placeholder="Подзаголовок"
                value={b.text}
                onChange={(e) => replaceBlock(i, { ...b, text: e.target.value })}
              />
            ) : null}
            {b.type === 'heading3' ? (
              <input
                className="post-blocks-editor__input post-blocks-editor__input--h3"
                disabled={disabled}
                placeholder="Малый заголовок"
                value={b.text}
                onChange={(e) => replaceBlock(i, { ...b, text: e.target.value })}
              />
            ) : null}
            {b.type === 'image' ? (
              <div className="post-blocks-editor__image-block">
                <button type="button" className="dashboard-topbar__action" disabled={disabled} onClick={() => openFile('image', b.id)}>
                  {b.url ? 'Заменить изображение' : 'Загрузить изображение'}
                </button>
                {b.url ? <span className="post-blocks-editor__path-hint">{b.url.slice(0, 48)}…</span> : null}
                <input
                  className="post-blocks-editor__caption"
                  disabled={disabled}
                  placeholder="Подпись"
                  value={b.caption ?? ''}
                  onChange={(e) => replaceBlock(i, { ...b, caption: e.target.value })}
                />
              </div>
            ) : null}
            {b.type === 'gallery' ? (
              <div className="post-blocks-editor__gallery-block">
                <button type="button" className="dashboard-topbar__action" disabled={disabled} onClick={() => openFile('gallery', b.id)}>
                  Добавить в галерею
                </button>
                <div className="post-blocks-editor__gallery-items">
                  {b.items.map((it, j) => (
                    <div key={j} className="post-blocks-editor__gal-item">
                      <span>{it.url.slice(0, 36)}…</span>
                      <button
                        type="button"
                        className="post-blocks-editor__mini-remove"
                        onClick={() =>
                          replaceBlock(i, {
                            ...b,
                            items: b.items.filter((_, k) => k !== j),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {b.type === 'quote' ? (
              <div className="post-blocks-editor__quote-block">
                <RichTextFormatBar
                  blockId={b.id}
                  disabled={disabled}
                  text={b.text}
                  onApply={(next, selStart, selEnd) => {
                    replaceBlock(i, { ...b, text: next })
                    focusRichTextarea(b.id, selStart, selEnd)
                  }}
                />
                <textarea
                  data-pe-block={b.id}
                  className="post-blocks-editor__textarea"
                  disabled={disabled}
                  placeholder="Цитата (**жирный**, *курсив*)"
                  rows={3}
                  value={b.text}
                  onChange={(e) => replaceBlock(i, { ...b, text: e.target.value })}
                  onKeyDown={(e) =>
                    richTextAreaKeyDown(e, {
                      disabled,
                      text: b.text,
                      blockId: b.id,
                      setText: (next) => replaceBlock(i, { ...b, text: next }),
                    })
                  }
                />
                <input
                  className="post-blocks-editor__caption"
                  disabled={disabled}
                  placeholder="Автор (необязательно)"
                  value={b.author ?? ''}
                  onChange={(e) => replaceBlock(i, { ...b, author: e.target.value })}
                />
              </div>
            ) : null}
            {b.type === 'divider' ? <hr className="post-blocks-editor__divider" /> : null}
            {b.type === 'video' ? (
              <div className="post-blocks-editor__video-block">
                <input
                  className="post-blocks-editor__input"
                  disabled={disabled}
                  placeholder="Ссылка на YouTube"
                  value={b.url}
                  onChange={(e) => replaceBlock(i, { ...b, url: e.target.value })}
                />
                <button
                  type="button"
                  className="dashboard-topbar__action"
                  disabled={disabled || !b.url.trim()}
                  onClick={async () => {
                    const url = b.url.trim()
                    const o = await fetchYoutubeOEmbed(url)
                    const vid = extractYoutubeVideoId(url)
                    replaceBlock(i, {
                      ...b,
                      title: o?.title ?? b.title,
                      description: o?.author ?? b.description,
                      thumbnail: o?.thumbnail ?? (vid ? youtubeThumbnailFromId(vid) : b.thumbnail),
                    })
                  }}
                >
                  Подтянуть превью
                </button>
              </div>
            ) : null}
            {b.type === 'linkCard' ? (
              <div className="post-blocks-editor__link-block">
                <input
                  className="post-blocks-editor__input"
                  disabled={disabled}
                  placeholder="URL"
                  value={b.url}
                  onChange={(e) => replaceBlock(i, { ...b, url: e.target.value })}
                />
                <button
                  type="button"
                  className="dashboard-topbar__action"
                  disabled={disabled || !b.url.trim()}
                  onClick={async () => {
                    const res = await fetchLinkPreview(b.url.trim())
                    if (res.data) {
                      replaceBlock(i, {
                        ...b,
                        title: res.data.title,
                        description: res.data.description,
                        image: res.data.image,
                      })
                    }
                  }}
                >
                  Загрузить превью
                </button>
              </div>
            ) : null}
            {b.type === 'cta' ? (
              <div className="post-blocks-editor__cta-block">
                <input
                  className="post-blocks-editor__input"
                  disabled={disabled}
                  placeholder="Текст кнопки"
                  value={b.text}
                  onChange={(e) => replaceBlock(i, { ...b, text: e.target.value })}
                />
                <input
                  className="post-blocks-editor__input"
                  disabled={disabled}
                  placeholder="URL"
                  value={b.url}
                  onChange={(e) => replaceBlock(i, { ...b, url: e.target.value })}
                />
              </div>
            ) : null}
          </div>
          <div className="post-blocks-editor__row-tools">
            <button
              type="button"
              className="post-blocks-editor__add-inline"
              title="Блок ниже"
              disabled={disabled}
              onClick={() => insertAfter(i, emptyBlock('paragraph'))}
            >
              +
            </button>
            <button type="button" className="post-blocks-editor__remove-inline" disabled={disabled} onClick={() => removeAt(i)}>
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
