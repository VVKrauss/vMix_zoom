import { useEffect, type RefObject } from 'react'
import { shouldClosePopoverOnOutsidePointer } from '../utils/popoverOutsideClick'

export function useOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    let active = false
    const activateId = window.setTimeout(() => {
      active = true
    }, 0)
    const handler = (e: MouseEvent | PointerEvent) => {
      if (!active) return
      if (shouldClosePopoverOnOutsidePointer(ref.current, e.target)) onClose()
    }
    document.addEventListener('click', handler)
    return () => {
      window.clearTimeout(activateId)
      document.removeEventListener('click', handler)
    }
  }, [ref, onClose])
}
