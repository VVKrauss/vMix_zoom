import { useEffect, useMemo, useRef, useState } from 'react'
import { getMessengerImageSignedUrl } from '../lib/messenger'
import { idbGet, idbSet } from '../lib/idbKv'
import type { MessengerConversationSummary } from '../lib/messengerConversations'

/** Не чаще одного раза в сутки ходить в Storage за новой подписью (кроме явного обновления списка). */
const AVATAR_CACHE_TTL_MS = 24 * 60 * 60 * 1000
/** Срок жизни signed URL в Storage — с запасом относительно TTL кэша. */
const SIGNED_URL_EXPIRES_SEC = 60 * 60 * 24 * 7

export type MessengerSidebarAvatarCacheRow = {
  storagePath: string
  signedUrl: string
  fetchedAt: number
}

/**
 * Signed URL для аватарок групп/каналов в сайдбаре.
 * Кэш в IndexedDB + повторная подпись не чаще чем раз в сутки; при `pullEpoch` после явного refresh — всё заново.
 */
export function useMessengerConversationAvatarUrls(
  items: MessengerConversationSummary[],
  pullEpoch = 0,
): Record<string, string> {
  const [conversationAvatarUrlById, setConversationAvatarUrlById] = useState<Record<string, string>>({})
  const itemsRef = useRef(items)
  itemsRef.current = items

  const prevPullEpochRef = useRef(pullEpoch)

  const depsKey = useMemo(
    () =>
      JSON.stringify(
        items
          .filter((it) => it.kind === 'group' || it.kind === 'channel')
          .map((it) => [it.id, (it.avatarThumbPath?.trim() || it.avatarPath?.trim() || '').trim()] as const)
          .filter(([, p]) => Boolean(p))
          .sort((a, b) => a[0].localeCompare(b[0])),
      ),
    [items],
  )

  useEffect(() => {
    let cancelled = false
    const pullAdvanced = prevPullEpochRef.current !== pullEpoch
    prevPullEpochRef.current = pullEpoch

    const run = async () => {
      const list = (itemsRef.current ?? []).filter(
        (it) =>
          (it.kind === 'group' || it.kind === 'channel') &&
          Boolean(it.avatarThumbPath?.trim() || it.avatarPath?.trim()),
      )
      const need = list.map((it) => ({
        id: it.id,
        path: (it.avatarThumbPath?.trim() || it.avatarPath?.trim() || '').trim(),
      }))
      if (need.length === 0) {
        if (!cancelled) setConversationAvatarUrlById({})
        return
      }

      const next: Record<string, string> = {}
      const toFetch: { id: string; path: string }[] = []

      for (const { id, path } of need) {
        if (pullAdvanced) {
          toFetch.push({ id, path })
          continue
        }
        const row = await idbGet<MessengerSidebarAvatarCacheRow>('messengerSidebarAvatarsV1', id)
        if (
          row &&
          row.storagePath === path &&
          typeof row.signedUrl === 'string' &&
          row.signedUrl &&
          Number.isFinite(row.fetchedAt) &&
          Date.now() - row.fetchedAt < AVATAR_CACHE_TTL_MS
        ) {
          next[id] = row.signedUrl
        } else {
          toFetch.push({ id, path })
        }
      }

      if (!cancelled) {
        setConversationAvatarUrlById((prev) => {
          const out: Record<string, string> = { ...prev, ...next }
          const keep = new Set(need.map((n) => n.id))
          for (const k of Object.keys(out)) {
            if (!keep.has(k)) delete out[k]
          }
          /* При явном refresh не чистим строки в toFetch — старый URL держим до прихода новой подписи. */
          if (!pullAdvanced) {
            for (const { id } of toFetch) delete out[id]
          }
          return out
        })
      }

      for (const { id, path } of toFetch) {
        const signed = await getMessengerImageSignedUrl(path, SIGNED_URL_EXPIRES_SEC)
        if (cancelled) return
        if (signed.url) {
          const fetchedAt = Date.now()
          void idbSet<MessengerSidebarAvatarCacheRow>('messengerSidebarAvatarsV1', id, {
            storagePath: path,
            signedUrl: signed.url,
            fetchedAt,
          })
          setConversationAvatarUrlById((prev) => ({ ...prev, [id]: signed.url! }))
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [depsKey, pullEpoch])

  return conversationAvatarUrlById
}
