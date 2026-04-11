import { useEffect } from 'react'

/**
 * Устанавливает CSS-переменную --vvh = высота видимой области (visualViewport.height).
 * Решает проблему с Android Chrome и некоторыми iOS Safari, где 100dvh
 * не пересчитывается при появлении/скрытии виртуальной клавиатуры.
 *
 * Использование в CSS: height: var(--vvh, 100dvh)
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      document.documentElement.style.setProperty('--vvh', `${vv.height}px`)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)

    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      document.documentElement.style.removeProperty('--vvh')
    }
  }, [])
}
