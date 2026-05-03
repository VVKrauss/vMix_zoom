export type PopoverOutsidePointerOptions = {
  /** Клики внутри этого поддерева не считаются «снаружи» (например, пузырь сообщения под портальным меню). */
  ignoreInside?: HTMLElement | null
}

/**
 * Закрывать поповер только если клик вне панели и вне той же .ctrl-group
 * (иначе mousedown по шеврону закрывает меню до click и toggleOpen снова открывает его).
 *
 * Для мобильной FAB: обёртка `.ctrl-mobile-fab-popover-host` объединяет нижнюю панель и портальные
 * device-popover — иначе синтетический click после long-press закрывает меню, пока палец ещё над кнопкой.
 */
export function shouldClosePopoverOnOutsidePointer(
  popoverEl: HTMLElement | null,
  target: EventTarget | null,
  options?: PopoverOutsidePointerOptions,
): boolean {
  if (!popoverEl) return false
  if (!target || !(target instanceof Node)) return false
  if (popoverEl.contains(target)) return false
  if (options?.ignoreInside?.contains(target)) return false
  const grp = popoverEl.parentElement
  if (grp?.classList.contains('ctrl-group') && grp.contains(target)) return false
  if (grp?.classList.contains('ctrl-mobile-fab-popover-host') && grp.contains(target)) return false
  return true
}
