import { useEffect } from 'react'

/**
 * Устанавливает CSS-переменные:
 * - `--vvh` = visualViewport.height (видимая область с учётом клавиатуры);
 * - `--vv-offset-top` / `--vv-offset-left` = смещение visual viewport внутри layout (iOS Safari, клавиатура);
 * - `--vvw` = visualViewport.width;
 * - `--messenger-keyboard-bottom` = зона под «реальным» низом экрана (клавиатура): innerHeight − offsetTop − height.
 *
 * Использование в CSS: height: var(--vvh, 100dvh); при необходимости — bottom с var(--messenger-keyboard-bottom).
 * Не вешать translate по --vv-offset-top на предка с position:fixed внутри — ломает iOS Safari.
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const scrollLockMessengerChromeless = () => {
      if (!document.querySelector('.dashboard-page--messenger-chromeless')) return
      /* Полноэкранное фото в мессенджере: принудительный scrollTo на Android ломает фокус/клавиатуру. */
      if (document.querySelector('.messenger-image-lightbox-backdrop')) return
      const lock = () => {
        window.scrollTo(0, 0)
        document.documentElement.scrollTop = 0
        document.documentElement.scrollLeft = 0
        document.body.scrollTop = 0
        document.body.scrollLeft = 0
      }
      lock()
      requestAnimationFrame(lock)
    }

    const update = () => {
      document.documentElement.style.setProperty('--vvh', `${vv.height}px`)
      document.documentElement.style.setProperty('--vv-offset-top', `${vv.offsetTop}px`)
      document.documentElement.style.setProperty('--vv-offset-left', `${vv.offsetLeft}px`)
      document.documentElement.style.setProperty('--vvw', `${vv.width}px`)
      /** Высота «полоски» под видимой областью (клавиатура) — для фикс. композера мессенджера. */
      const kb = Math.max(0, window.innerHeight - vv.offsetTop - vv.height)
      document.documentElement.style.setProperty('--messenger-keyboard-bottom', `${kb}px`)
      scrollLockMessengerChromeless()
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)

    const onVis = () => {
      requestAnimationFrame(() => update())
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pageshow', onVis)

    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pageshow', onVis)
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      document.documentElement.style.removeProperty('--vvh')
      document.documentElement.style.removeProperty('--vv-offset-top')
      document.documentElement.style.removeProperty('--vv-offset-left')
      document.documentElement.style.removeProperty('--vvw')
      document.documentElement.style.removeProperty('--messenger-keyboard-bottom')
    }
  }, [])
}
