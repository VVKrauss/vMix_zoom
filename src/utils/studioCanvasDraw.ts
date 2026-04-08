/**
 * Рисует кадр видео в прямоугольник с обрезкой по центру (object-fit: cover).
 */
export function drawVideoCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return

  const scale = Math.max(dw / vw, dh / vh)
  const sw = dw / scale
  const sh = dh / scale
  const sx = (vw - sw) / 2
  const sy = (vh - sh) / 2

  ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh)
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}
