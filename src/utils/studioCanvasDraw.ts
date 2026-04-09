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

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  if (parts.length === 0) return '?'
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'
}

export function drawStudioParticipantPlaceholder(
  ctx: CanvasRenderingContext2D,
  name: string,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  ctx.save()
  ctx.fillStyle = '#111214'
  ctx.fillRect(dx, dy, dw, dh)

  const ringSize = Math.min(dw, dh) * 0.26
  const cx = dx + dw / 2
  const cy = dy + dh * 0.42

  ctx.fillStyle = '#26282d'
  ctx.beginPath()
  ctx.arc(cx, cy, ringSize, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#f4f4f5'
  ctx.font = `600 ${Math.max(16, ringSize * 0.7)}px Inter, Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initialsFromName(name), cx, cy + 1)

  ctx.fillStyle = '#ffffff'
  ctx.font = `600 ${Math.max(16, Math.min(dw * 0.06, 34))}px Inter, Arial, sans-serif`
  ctx.fillText(name, dx + dw / 2, dy + dh * 0.76)
  ctx.restore()
}
