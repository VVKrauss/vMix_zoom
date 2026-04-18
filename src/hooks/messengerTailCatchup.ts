import type { MutableRefObject } from 'react'

function doubleRAF(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )
}

/**
 * После первой отрисовки ленты — дождаться загрузки картинок и снова прижать низ,
 * чтобы не оставаться «выше» хвоста на высоту ещё не загруженных изображений.
 */
export function attachMessengerTailCatchupAfterContentPaint(opts: {
  scrollEl: HTMLElement
  contentEl: HTMLElement
  pinRef: MutableRefObject<boolean>
  isActive: () => boolean
}): () => void {
  let cancelled = false
  const { scrollEl, contentEl, pinRef, isActive } = opts

  const bump = () => {
    if (cancelled || !isActive()) return
    scrollEl.scrollTop = scrollEl.scrollHeight
    pinRef.current = true
  }

  void (async () => {
    bump()
    await doubleRAF()
    bump()
    const imgs = contentEl.querySelectorAll('img')
    await Promise.all(
      [...imgs].map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener('load', () => resolve(), { once: true })
                img.addEventListener('error', () => resolve(), { once: true })
              }),
      ),
    )
    bump()
    await Promise.all(
      [...imgs].map((img) =>
        typeof img.decode === 'function' ? img.decode().catch(() => undefined) : Promise.resolve(undefined),
      ),
    )
    bump()
  })()

  return () => {
    cancelled = true
  }
}
