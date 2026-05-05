/** Экспорт квадратной обложки: letterbox и кроп по pan/zoom (cover). */

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const im = new Image()
    im.onload = () => {
      URL.revokeObjectURL(url)
      resolve(im)
    }
    im.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image_load_failed'))
    }
    im.src = url
  })
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.88): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('canvas_to_blob_failed'))
      },
      'image/jpeg',
      quality,
    )
  })
}

export function isApproxSquare(naturalWidth: number, naturalHeight: number, eps = 0.02): boolean {
  if (!naturalWidth || !naturalHeight) return false
  const a = Math.abs(naturalWidth - naturalHeight)
  return a / Math.max(naturalWidth, naturalHeight) <= eps
}

/** Вся картинка внутри квадрата с «полями» (letterbox / pillarbox). */
export async function letterboxToSquareJpegBlob(
  img: HTMLImageElement,
  options?: { maxEdgePx?: number; fillStyle?: string },
): Promise<Blob> {
  const nw = img.naturalWidth || img.width
  const nh = img.naturalHeight || img.height
  const maxEdge = Math.min(options?.maxEdgePx ?? 1080, 2160)
  const fill = options?.fillStyle ?? '#141518'

  const canvas = document.createElement('canvas')
  canvas.width = maxEdge
  canvas.height = maxEdge
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  ctx.fillStyle = fill
  ctx.fillRect(0, 0, maxEdge, maxEdge)

  const scale = Math.min(maxEdge / nw, maxEdge / nh)
  const dw = nw * scale
  const dh = nh * scale
  const dx = (maxEdge - dw) / 2
  const dy = (maxEdge - dh) / 2
  ctx.drawImage(img, 0, 0, nw, nh, dx, dy, dw, dh)
  return canvasToJpegBlob(canvas)
}

export type PanZoomCoverParams = {
  /** Сторона viewport превью (px), та же модель, что в редакторе. */
  viewportPx: number
  /** zoom >= 1 */
  zoom: number
  /** Левый верх изображения в координатах viewport (может быть отрицательным). */
  offsetX: number
  offsetY: number
}

/**
 * Кроп «object-fit: cover» + смещение: какая область исходника попадает в квадрат viewport.
 * baseScale = max(V/nw, V/nh), disp = nw*baseScale*zoom × nh*baseScale*zoom.
 */
export async function exportCoverCropPanZoomJpegBlob(
  img: HTMLImageElement,
  params: PanZoomCoverParams,
  maxOutputPx = 1080,
): Promise<Blob> {
  const nw = img.naturalWidth || img.width
  const nh = img.naturalHeight || img.height
  const V = params.viewportPx
  const z = Math.max(1, params.zoom)
  const baseScale = Math.max(V / nw, V / nh)
  const dispW = nw * baseScale * z
  const dispH = nh * baseScale * z
  const ox = params.offsetX
  const oy = params.offsetY

  let srcX = ((0 - ox) / dispW) * nw
  let srcY = ((0 - oy) / dispH) * nh
  let srcW = (V / dispW) * nw
  let srcH = (V / dispH) * nh

  if (srcX < 0) {
    srcW += srcX
    srcX = 0
  }
  if (srcY < 0) {
    srcH += srcY
    srcY = 0
  }
  if (srcX + srcW > nw) srcW = nw - srcX
  if (srcY + srcH > nh) srcH = nh - srcY

  srcW = Math.max(0, srcW)
  srcH = Math.max(0, srcH)

  const out = Math.min(Math.max(320, maxOutputPx), 2160)
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  if (srcW <= 0 || srcH <= 0) {
    ctx.fillStyle = '#141518'
    ctx.fillRect(0, 0, out, out)
    return canvasToJpegBlob(canvas)
  }
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, out, out)
  return canvasToJpegBlob(canvas)
}

/** Уже квадрат: только даунскейл до maxEdge. */
export async function squareResizeOnlyJpegBlob(img: HTMLImageElement, maxEdgePx = 1080): Promise<Blob> {
  const nw = img.naturalWidth || img.width
  const nh = img.naturalHeight || img.height
  const side = Math.min(nw, nh)
  const out = Math.min(side, maxEdgePx)
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  const sx = Math.floor((nw - side) / 2)
  const sy = Math.floor((nh - side) / 2)
  ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out)
  return canvasToJpegBlob(canvas)
}
