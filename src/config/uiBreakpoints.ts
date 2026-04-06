/** Единая ширина «мобильного» интерфейса; CSS @media должен использовать то же значение (см. комментарий в index.css). */
export const MOBILE_MAX_WIDTH_PX = 768

export const mediaQueryMaxWidthMobile = `(max-width: ${MOBILE_MAX_WIDTH_PX}px)` as const
