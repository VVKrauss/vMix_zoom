/** Квадратный бренд-лого с лёгкой анимацией — для экранов загрузки по всему приложению. */
export function BrandLogoLoader({ size = 48 }: { size?: number }) {
  return (
    <div className="brand-logo-loader-wrap" aria-hidden>
      <img
        className="brand-logo-loader"
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        draggable={false}
      />
    </div>
  )
}
