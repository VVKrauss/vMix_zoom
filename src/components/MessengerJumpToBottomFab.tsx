/** Плавающая кнопка прокрутки к хвосту ленты (внутри обёртки `dashboard-messenger__scroll-region-wrap`). */
export function MessengerJumpToBottomFab({
  visible,
  onClick,
}: {
  visible: boolean
  onClick: () => void
}) {
  if (!visible) return null
  return (
    <button
      type="button"
      className="messenger-jump-to-bottom"
      onClick={onClick}
      aria-label="К последнему сообщению"
      title="Вниз"
    >
      <span className="messenger-jump-to-bottom__glyph" aria-hidden>
        ↓
      </span>
    </button>
  )
}
