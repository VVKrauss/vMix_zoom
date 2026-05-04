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
      onPointerDown={(e) => {
        // Не забираем фокус у textarea → на мобильных это предотвращает закрытие клавиатуры.
        e.preventDefault()
      }}
      onMouseDown={(e) => {
        // Fallback для браузеров без Pointer Events.
        e.preventDefault()
      }}
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
