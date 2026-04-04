import { useEffect, useRef, useState } from 'react'

export type TileAspect = '16:9' | '4:3' | 'free'

const GAP = 6
const PAD = 6

export interface TileLayout {
  cols:   number
  tileW:  number
  tileH:  number
}

function aspectRatio(a: TileAspect): number {
  if (a === '16:9') return 16 / 9
  if (a === '4:3')  return 4  / 3
  return 0  // 0 = free (fill grid cell)
}

function bestLayout(n: number, W: number, H: number, aspect: TileAspect): TileLayout {
  const AR = aspectRatio(aspect)

  // free mode — just pick N columns, let CSS handle height
  if (AR === 0) {
    const cols = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 2 : n <= 6 ? 3 : 3
    return { cols, tileW: 0, tileH: 0 }
  }

  let best: TileLayout = { cols: 1, tileW: 0, tileH: 0 }

  for (let cols = 1; cols <= n; cols++) {
    const rows   = Math.ceil(n / cols)
    const availW = (W - PAD * 2 - GAP * (cols - 1)) / cols
    const availH = (H - PAD * 2 - GAP * (rows - 1)) / rows

    let tileW = availW
    let tileH = tileW / AR
    if (tileH > availH) { tileH = availH; tileW = tileH * AR }

    if (tileW * tileH > best.tileW * best.tileH) {
      best = { cols, tileW: Math.floor(tileW), tileH: Math.floor(tileH) }
    }
  }
  return best
}

export function useTileLayout(count: number, aspect: TileAspect = '16:9') {
  const containerRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<TileLayout>({ cols: 1, tileW: 0, tileH: 0 })

  const recalc = () => {
    const el = containerRef.current
    if (!el) return
    const { width: W, height: H } = el.getBoundingClientRect()
    if (W > 0 && H > 0) setLayout(bestLayout(count, W, H, aspect))
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => recalc())
    ro.observe(el)
    recalc()
    return () => ro.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, aspect])

  return { containerRef, layout }
}
