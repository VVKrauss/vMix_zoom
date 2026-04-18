import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../../context/ToastContext'
import {
  appendChannelPostRich,
  editChannelPostRich,
} from '../../lib/channels'
import {
  collectStoragePathsFromDraft,
  createEmptyDraft,
  draftHasPublishableBody,
  draftToPreviewBody,
  firstLinkCardMeta,
  mergeMetaWithDraft,
  migrateLegacyBodyToDraft,
} from '../../lib/postEditor/draftUtils'
import type { PostDraftV1, PostMaterial } from '../../lib/postEditor/types'
import { newBlockId } from '../../lib/postEditor/types'
import type { DirectMessage } from '../../lib/messenger'
import { getMessengerImageSignedUrl, uploadMessengerImage } from '../../lib/messenger'
import { PostBlocksEditor } from './PostBlocksEditor'
import { PostDraftReadView } from './PostDraftReadView'
import './PostEditorModal.css'

function storageKey(cid: string, mid: string | null) {
  return `vmix.pe.${cid}.${mid ?? 'new'}`
}

export function PostEditorModal({
  open,
  mode,
  editMessage,
  conversationId,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: 'create' | 'edit'
  editMessage: DirectMessage | null
  conversationId: string
  onClose: () => void
  onSaved?: () => void
}) {
  const toast = useToast()
  const [draft, setDraft] = useState<PostDraftV1>(createEmptyDraft())
  const [preview, setPreview] = useState(false)
  const [seoExtrasOpen, setSeoExtrasOpen] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [busy, setBusy] = useState(false)
  const snapshotRef = useRef<string>('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [urlByPath, setUrlByPath] = useState<Record<string, string>>({})

  const cid = conversationId.trim()
  const mid = mode === 'edit' && editMessage?.id ? editMessage.id : null

  const dirty = useMemo(() => {
    try {
      return JSON.stringify(draft) !== snapshotRef.current
    } catch {
      return true
    }
  }, [draft])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const fn = () => setNarrow(mq.matches)
    fn()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  useEffect(() => {
    if (!open) return
    let initial: PostDraftV1
    if (mode === 'edit' && editMessage) {
      initial = editMessage.meta?.postDraft ?? migrateLegacyBodyToDraft(editMessage.body ?? '')
    } else {
      try {
        const raw = localStorage.getItem(storageKey(cid, null))
        const parsed = raw ? (JSON.parse(raw) as Partial<PostDraftV1>) : null
        if (parsed && parsed.v === 1 && Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
          initial = parsed as PostDraftV1
        } else {
          initial = createEmptyDraft()
        }
      } catch {
        initial = createEmptyDraft()
      }
    }
    setDraft(initial)
    snapshotRef.current = JSON.stringify(initial)
    setPreview(false)
    setSaveStatus('idle')
    setSeoExtrasOpen(false)
  }, [open, mode, editMessage, cid])

  const draftStoragePathsKey = useMemo(() => {
    if (!open) return ''
    try {
      const paths = collectStoragePathsFromDraft(draft)
      const cover = draft.coverImage?.startsWith('ms://') ? draft.coverImage.slice('ms://'.length) : null
      const extra = cover && !paths.includes(cover) ? [...paths, cover] : paths
      return [...extra].sort().join('\n')
    } catch {
      return ''
    }
  }, [open, draft])

  useEffect(() => {
    if (!open || !draftStoragePathsKey) return
    let active = true
    const paths = draftStoragePathsKey.split('\n').filter(Boolean)
    void (async () => {
      for (const p of paths) {
        const signed = await getMessengerImageSignedUrl(p, 3600)
        if (!active) return
        if (signed.url) setUrlByPath((prev) => (prev[p] ? prev : { ...prev, [p]: signed.url! }))
      }
    })()
    return () => {
      active = false
    }
  }, [open, draftStoragePathsKey])

  useEffect(() => {
    if (!open || !dirty) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSaveStatus('saving')
    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey(cid, mid), JSON.stringify(draft))
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, 1600)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [open, draft, dirty, cid, mid])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preview) {
        if (dirty) {
          if (!window.confirm('Закрыть редактор? Несохранённые изменения останутся в черновике на этом устройстве.')) return
        }
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dirty, preview, onClose])

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm('Закрыть редактор? Несохранённые изменения останутся в черновике на этом устройстве.')) return
    onClose()
  }, [dirty, onClose])

  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      if (!cid) return null
      const up = await uploadMessengerImage(cid, file)
      if (up.error || !up.path) {
        toast.push({ tone: 'error', message: up.error ?? 'upload_failed', ms: 2600 })
        return null
      }
      return up.path
    },
    [cid, toast],
  )

  const validatePublish = useCallback((): string | null => {
    if (!draftHasPublishableBody(draft)) return 'Добавьте текст, изображение, видео или другой блок'
    return null
  }, [draft])

  const canPublish = useMemo(() => draftHasPublishableBody(draft), [draft])

  const handlePublish = useCallback(async () => {
    const err = validatePublish()
    if (err) {
      toast.push({ tone: 'error', message: err, ms: 3200 })
      return
    }
    if (!cid) return
    setBusy(true)
    try {
      const linkFromCard = firstLinkCardMeta(draft.blocks)
      const linkForMerge =
        linkFromCard?.url != null
          ? {
              url: linkFromCard.url,
              ...(linkFromCard.title ? { title: linkFromCard.title } : {}),
              ...(linkFromCard.description ? { description: linkFromCard.description } : {}),
              ...(linkFromCard.image ? { image: linkFromCard.image } : {}),
            }
          : null
      const previewBody = draftToPreviewBody(draft)
      const meta = mergeMetaWithDraft(
        mode === 'edit' && editMessage?.meta ? (editMessage.meta as Record<string, unknown>) : null,
        { ...draft, status: 'published' },
        linkForMerge,
      )
      if (mode === 'edit' && editMessage?.id) {
        const res = await editChannelPostRich(cid, editMessage.id, previewBody, meta)
        if (res.error) {
          toast.push({ tone: 'error', message: res.error, ms: 3200 })
          return
        }
      } else {
        const res = await appendChannelPostRich(cid, previewBody, meta)
        if (res.error) {
          toast.push({ tone: 'error', message: res.error, ms: 3200 })
          return
        }
      }
      snapshotRef.current = JSON.stringify({ ...draft, status: 'published' })
      localStorage.removeItem(storageKey(cid, null))
      toast.push({ tone: 'success', message: 'Опубликовано', ms: 2000 })
      onSaved?.()
      onClose()
    } finally {
      setBusy(false)
    }
  }, [
    validatePublish,
    cid,
    draft,
    mode,
    editMessage,
    toast,
    onSaved,
    onClose,
  ])

  const handleManualSave = useCallback(() => {
    try {
      localStorage.setItem(storageKey(cid, mid), JSON.stringify(draft))
      snapshotRef.current = JSON.stringify(draft)
      setSaveStatus('saved')
      toast.push({ tone: 'success', message: 'Сохранено', ms: 1600 })
    } catch {
      setSaveStatus('error')
      toast.push({ tone: 'error', message: 'Не удалось сохранить', ms: 2600 })
    }
  }, [cid, mid, draft, toast])

  const applyYoutubeCover = useCallback(() => {
    const vid = draft.blocks.find((b) => b.type === 'video' && b.thumbnail)
    if (vid && vid.type === 'video' && vid.thumbnail) {
      setDraft((d) => ({ ...d, coverImage: vid.thumbnail! }))
      toast.push({ tone: 'success', message: 'Обложка из превью видео', ms: 1800 })
    }
  }, [draft.blocks, toast])

  const [matTitle, setMatTitle] = useState('')
  const [matUrl, setMatUrl] = useState('')

  const addMaterial = useCallback(() => {
    const title = matTitle.trim()
    const url = matUrl.trim()
    if (!title || !url) return
    const m: PostMaterial = { id: newBlockId(), title, url }
    setDraft((d) => ({ ...d, materials: [...d.materials, m] }))
    setMatTitle('')
    setMatUrl('')
  }, [matTitle, matUrl])

  if (!open) return null

  const statusLabel =
    saveStatus === 'saving'
      ? 'Сохраняется…'
      : saveStatus === 'error'
        ? 'Ошибка сохранения'
        : saveStatus === 'saved' && !dirty
          ? 'Сохранено'
          : dirty
            ? 'Есть несохранённые изменения'
            : 'Черновик'

  return (
    <div className="post-editor-overlay" role="presentation" onClick={requestClose}>
      <div
        className={`post-editor-shell${narrow ? ' post-editor-shell--fullscreen' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-editor-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="post-editor-header">
          <div className="post-editor-header__title-wrap">
            <h2 id="post-editor-heading" className="post-editor-header__title">
              {mode === 'edit' ? 'Редактирование поста' : 'Оформленный пост'}
            </h2>
          </div>
          <span className="post-editor-header__status">{statusLabel}</span>
          <div className="post-editor-header__actions">
            <button type="button" className="dashboard-topbar__action" onClick={() => setPreview((p) => !p)} disabled={busy}>
              {preview ? 'Редактор' : 'Предпросмотр'}
            </button>
            <button type="button" className="dashboard-topbar__action" onClick={handleManualSave} disabled={busy}>
              Сохранить
            </button>
            <button
              type="button"
              className="dashboard-topbar__action dashboard-topbar__action--primary"
              onClick={() => void handlePublish()}
              disabled={busy || !canPublish}
            >
              {busy ? 'Публикация…' : 'Опубликовать'}
            </button>
            <button type="button" className="dashboard-topbar__action" aria-label="Закрыть" onClick={requestClose}>
              ×
            </button>
          </div>
        </header>

        <div className="post-editor-body">
          <div className="post-editor-main">
            {preview ? (
              <PostDraftReadView draft={draft} urlByStoragePath={urlByPath} />
            ) : (
              <>
                <textarea
                  className="post-editor-field-title"
                  rows={2}
                  placeholder="Заголовок поста"
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  disabled={busy}
                />
                <textarea
                  className="post-editor-field-subtitle"
                  rows={3}
                  placeholder="Краткое описание (Markdown: ~~зачёркнуто~~, **жирный**)"
                  value={draft.subtitle ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))}
                  disabled={busy}
                />
                <div className="post-editor-cover">
                  {draft.coverImage ? (
                    <>
                      {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked */}
                      <CoverImg cover={draft.coverImage!} urlByPath={urlByPath} />
                      <button
                        type="button"
                        className="dashboard-topbar__action post-editor-cover__btn"
                        onClick={() => setDraft((d) => ({ ...d, coverImage: null }))}
                      >
                        Убрать обложку
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="dashboard-topbar__action post-editor-cover__btn"
                      onClick={() => {
                        const inp = document.createElement('input')
                        inp.type = 'file'
                        inp.accept = 'image/*'
                        inp.onchange = async () => {
                          const f = inp.files?.[0]
                          if (!f) return
                          const path = await uploadFile(f)
                          if (path) setDraft((d) => ({ ...d, coverImage: `ms://${path}` }))
                        }
                        inp.click()
                      }}
                    >
                      Добавить обложку
                    </button>
                  )}
                  {draft.blocks.some((b) => b.type === 'video' && b.thumbnail) ? (
                    <button type="button" className="dashboard-topbar__action" onClick={applyYoutubeCover}>
                      Использовать превью видео как обложку
                    </button>
                  ) : null}
                </div>
                <PostBlocksEditor
                  blocks={draft.blocks}
                  disabled={busy}
                  onChange={(blocks) => setDraft((d) => ({ ...d, blocks }))}
                  onRequestImageUpload={uploadFile}
                />
                <div className="post-editor-extras">
                  <button
                    type="button"
                    className="dashboard-topbar__action post-editor-extras__toggle"
                    aria-expanded={seoExtrasOpen}
                    disabled={busy}
                    onClick={() => setSeoExtrasOpen((v) => !v)}
                  >
                    SEO и материалы
                    <span className="post-editor-extras__chevron" aria-hidden>
                      {seoExtrasOpen ? '▾' : '▸'}
                    </span>
                  </button>
                  {seoExtrasOpen ? (
                    <div className="post-editor-extras-panel">
                      <div className="post-editor-extras-section">
                        <h3 className="post-editor-extras-heading">SEO</h3>
                        <input
                          className="dashboard-messenger__input"
                          placeholder="slug"
                          value={draft.slug ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                        />
                        <input
                          className="dashboard-messenger__input"
                          placeholder="SEO title"
                          value={draft.seoTitle ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, seoTitle: e.target.value }))}
                        />
                        <textarea
                          className="dashboard-messenger__input"
                          rows={3}
                          placeholder="SEO description"
                          value={draft.seoDescription ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, seoDescription: e.target.value }))}
                        />
                        <input
                          className="dashboard-messenger__input"
                          placeholder="SEO image URL"
                          value={draft.seoImage ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, seoImage: e.target.value }))}
                        />
                      </div>
                      <div className="post-editor-extras-section">
                        <h3 className="post-editor-extras-heading">Материалы</h3>
                        {draft.materials.map((m) => (
                          <div key={m.id} className="post-editor-material">
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</span>
                            <button
                              type="button"
                              className="dashboard-topbar__action"
                              aria-label="Удалить"
                              onClick={() => setDraft((d) => ({ ...d, materials: d.materials.filter((x) => x.id !== m.id) }))}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <input
                          className="dashboard-messenger__input"
                          placeholder="Название"
                          value={matTitle}
                          onChange={(e) => setMatTitle(e.target.value)}
                        />
                        <input
                          className="dashboard-messenger__input"
                          placeholder="Ссылка"
                          value={matUrl}
                          onChange={(e) => setMatUrl(e.target.value)}
                        />
                        <button type="button" className="dashboard-topbar__action dashboard-topbar__action--primary" onClick={addMaterial}>
                          Добавить
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CoverImg({ cover, urlByPath }: { cover: string; urlByPath: Record<string, string> }) {
  const src = cover.startsWith('ms://') ? urlByPath[cover.slice('ms://'.length)] : cover
  if (!src) return <span className="post-editor-cover__path-hint">Загрузка превью…</span>
  return <img className="post-editor-cover__preview" src={src} alt="" />
}
