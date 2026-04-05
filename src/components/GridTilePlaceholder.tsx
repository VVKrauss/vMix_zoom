/** Пустая ячейка сетки: тихий фон с лёгким появлением, квадратное лого без анимации. */
export function GridTilePlaceholder() {
  return (
    <div className="grid-tile-placeholder" aria-hidden>
      <img
        className="grid-tile-placeholder__logo"
        src="/logo.png"
        alt=""
        width={72}
        height={72}
        draggable={false}
      />
    </div>
  )
}
