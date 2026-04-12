import { useEffect } from 'react'

/**
 * Устанавливает CSS-переменные:
 * - `--vvh` = visualViewport.height (видимая область с учётом клавиатуры);
 * - `--vv-offset-top` = visualViewport.offsetTop (компенсация сдвига layout viewport в iOS Safari);
 * - `--messenger-keyboard-bottom` = зона под «реальным» низом экрана (клавиатура): innerHeight − offsetTop − height.
 *
 * Использование в CSS: height: var(--vvh, 100dvh); при необходимости — bottom с var(--messenger-keyboard-bottom).
 * Не вешать translate по --vv-offset-top на предка с position:fixed внутри — ломает iOS Safari.
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      document.documentElement.style.setProperty('--vvh', `${vv.height}px`)
      /** iOS Safari: при клавиатуре смещает layout viewport — компенсируем, чтобы UI не «улетал» вверх. */
      document.documentElement.style.setProperty('--vv-offset-top', `${vv.offsetTop}px`)
      /** Высота «полоски» под видимой областью (клавиатура) — для фикс. композера мессенджера. */
      const kb = Math.max(0, window.innerHeight - vv.offsetTop - vv.height)
      document.documentElement.style.setProperty('--messenger-keyboard-bottom', `${kb}px`)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)

    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      document.documentElement.style.removeProperty('--vvh')
      document.documentElement.style.removeProperty('--vv-offset-top')
      document.documentElement.style.removeProperty('--messenger-keyboard-bottom')
    }
  }, [])
}
