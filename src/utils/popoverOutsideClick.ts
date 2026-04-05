/**
 * Закрывать поповер только если клик вне панели и вне той же .ctrl-group
 * (иначе mousedown по шеврону закрывает меню до click и toggleOpen снова открывает его).
 */
export function shouldClosePopoverOnOutsidePointer(
  popoverEl: HTMLElement | null,
  target: EventTarget | null,
): boolean {
  if (!popoverEl) return false
  if (!target || !(target instanceof Node)) return false
  if (popoverEl.contains(target)) return false
  const grp = popoverEl.parentElement
  if (grp?.classList.contains('ctrl-group') && grp.contains(target)) return false
  return true
}
