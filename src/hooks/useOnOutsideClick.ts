import { useEffect, type RefObject } from 'react'
import { shouldClosePopoverOnOutsidePointer } from '../utils/popoverOutsideClick'

export function useOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (shouldClosePopoverOnOutsidePointer(ref.current, e.target)) onClose()
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [ref, onClose])
}
