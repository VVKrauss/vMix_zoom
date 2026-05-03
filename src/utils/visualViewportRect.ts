/** Границы видимой области (учёт visualViewport на мобильных с адресной строкой / клавиатурой). */
export function readVisualViewportRect(): { ox: number; oy: number; vw: number; vh: number } {
  const vv = window.visualViewport
  if (!vv) {
    return { ox: 0, oy: 0, vw: window.innerWidth, vh: window.innerHeight }
  }
  return {
    ox: vv.offsetLeft,
    oy: vv.offsetTop,
    vw: vv.width,
    vh: vv.height,
  }
}
