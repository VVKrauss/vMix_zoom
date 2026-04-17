import { useCallback, useEffect, useRef, useState } from 'react'
import {
  extractFirstHttpUrl,
  fetchLinkPreview,
  urlsLooselyEqual,
  type LinkPreview,
} from '../lib/linkPreview'

/**
 * Дебаунс-превью первой ссылки в черновике (как в Telegram).
 * Скрывается, если пользователь нажал «убрать» для текущего URL — до смены URL в тексте.
 */
export function useLinkPreviewFromText(
  text: string,
  options?: { enabled?: boolean; debounceMs?: number },
) {
  const enabled = options?.enabled ?? true
  const debounceMs = options?.debounceMs ?? 450
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const dismissedUrlRef = useRef<string | null>(null)
  const textRef = useRef(text)
  textRef.current = text

  const dismiss = useCallback(() => {
    const u = extractFirstHttpUrl(textRef.current)
    if (u) dismissedUrlRef.current = u
    setPreview(null)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setPreview(null)
      setLoading(false)
      return
    }
    const url = extractFirstHttpUrl(text)
    if (!url) {
      setPreview(null)
      setLoading(false)
      dismissedUrlRef.current = null
      return
    }
    if (dismissedUrlRef.current && urlsLooselyEqual(dismissedUrlRef.current, url)) {
      setPreview(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const t = window.setTimeout(() => {
      setLoading(true)
      void fetchLinkPreview(url).then(({ data, error }) => {
        if (cancelled) return
        const still = extractFirstHttpUrl(textRef.current)
        if (!still || !urlsLooselyEqual(still, url)) {
          setLoading(false)
          setPreview(null)
          return
        }
        setLoading(false)
        if (error || !data) {
          setPreview(null)
          return
        }
        setPreview(data)
      })
    }, debounceMs)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [text, enabled, debounceMs])

  return { preview, loading, dismiss }
}
