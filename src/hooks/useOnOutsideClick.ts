import { useEffect, type RefObject } from 'react'
import { shouldClosePopoverOnOutsidePointer } from '../utils/popoverOutsideClick'

export function useOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    const handler = (e: MouseEvent | PointerEvent) => {
      if (shouldClosePopoverOnOutsidePointer(ref.current, e.target)) onClose()
    }
    document.addEventListener('pointerup', handler)
    return () => document.removeEventListener('pointerup', handler)
  }, [ref, onClose])
}
