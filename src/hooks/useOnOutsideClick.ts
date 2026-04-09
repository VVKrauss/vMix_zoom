import { useEffect, type RefObject } from 'react'
import { shouldClosePopoverOnOutsidePointer } from '../utils/popoverOutsideClick'

export function useOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (shouldClosePopoverOnOutsidePointer(ref.current, e.target)) onClose()
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [ref, onClose])
}
