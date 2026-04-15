import { useEffect, useState } from 'react'
import { fetchAdminHostMetrics, type AdminHostMetrics } from '../../api/adminStatsApi'

/** Compute Pressure API (Chrome); не во всех lib.dom есть типы. */
type PressureObserverCtor = {
  new (callback: (records: { state?: string }[]) => void): {
    observe(source: 'cpu' | 'gpu', opts?: { sampleInterval?: number }): Promise<void>
    disconnect(): void
  }
  readonly knownSources: readonly string[]
}

function pressureStateToApproxPercent(state: string): number {
  switch (state) {
    case 'nominal':
      return 14
    case 'fair':
      return 38
    case 'serious':
      return 71
    case 'critical':
      return 93
    default:
      return 48
  }
}

function ramPercentFromMb(used: number | null, total: number | null): number | null {
  if (used == null || total == null || total <= 0) return null
  return Math.min(100, Math.round((used / total) * 100))
}

export function useStudioSystemMetrics(open: boolean): {
  cpuPercent: number | null
  gpuPercent: number | null
  ramPercent: number | null
} {
  const [server, setServer] = useState<AdminHostMetrics | null>(null)
  const [clientCpu, setClientCpu] = useState<number | null>(null)
  const [clientGpu, setClientGpu] = useState<number | null>(null)
  const [clientRam, setClientRam] = useState<number | null>(null)

  useEffect(() => {
    if (!open) {
      setServer(null)
      return
    }
    let alive = true
    const tick = async () => {
      const h = await fetchAdminHostMetrics()
      if (!alive) return
      setServer(h)
    }
    void tick()
    const id = window.setInterval(() => void tick(), 2500)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const PO = (globalThis as unknown as { PressureObserver?: PressureObserverCtor }).PressureObserver
    if (!PO) return

    let cpuObs: InstanceType<PressureObserverCtor> | null = null
    let gpuObs: InstanceType<PressureObserverCtor> | null = null

    try {
      cpuObs = new PO((records) => {
        const last = records[records.length - 1]
        const st = last?.state
        if (st) setClientCpu(pressureStateToApproxPercent(st))
      })
      void cpuObs.observe('cpu', { sampleInterval: 1000 })
    } catch {
      /* unsupported */
    }

    try {
      const known = [...PO.knownSources]
      if (known.includes('gpu')) {
        gpuObs = new PO((records) => {
          const last = records[records.length - 1]
          const st = last?.state
          if (st) setClientGpu(pressureStateToApproxPercent(st))
        })
        void gpuObs.observe('gpu', { sampleInterval: 1000 })
      }
    } catch {
      /* unsupported */
    }

    return () => {
      cpuObs?.disconnect()
      gpuObs?.disconnect()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => {
      const mem = (performance as Performance & {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number }
      }).memory
      if (mem && mem.jsHeapSizeLimit > 0) {
        setClientRam(Math.min(100, Math.round((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100)))
      }
    }, 1500)
    return () => window.clearInterval(id)
  }, [open])

  const serverRam = ramPercentFromMb(server?.memoryUsedMb ?? null, server?.memoryTotalMb ?? null)

  return {
    cpuPercent: server?.cpuPercent ?? clientCpu,
    gpuPercent: server?.gpuPercent ?? clientGpu,
    ramPercent: serverRam ?? clientRam,
  }
}

export function StudioSystemMetricsRow({
  cpuPercent,
  gpuPercent,
  ramPercent,
}: {
  cpuPercent: number | null
  gpuPercent: number | null
  ramPercent: number | null
}) {
  const fmt = (n: number | null) => (n == null ? '—' : `${Math.round(n)}%`)
  return (
    <div className="studio-chrome__metrics" aria-label="Загрузка системы">
      <span className="studio-chrome__metric">
        <span className="studio-chrome__metric-k">ЦП</span> {fmt(cpuPercent)}
      </span>
      <span className="studio-chrome__metric-sep" aria-hidden>
        ·
      </span>
      <span className="studio-chrome__metric">
        <span className="studio-chrome__metric-k">GPU</span> {fmt(gpuPercent)}
      </span>
      <span className="studio-chrome__metric-sep" aria-hidden>
        ·
      </span>
      <span className="studio-chrome__metric">
        <span className="studio-chrome__metric-k">ОЗУ</span> {fmt(ramPercent)}
      </span>
    </div>
  )
}
