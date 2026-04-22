/**
 * UI terminology for the virtual "program ingest" peer (SRT / внешний поток).
 * Сервер может прислать устаревшее отображаемое имя; см. `PROGRAM_INGEST_LEGACY_NAMES`.
 */
export const PROGRAM_INGEST_DISPLAY_NAME = 'SRT'

/** Имена, которые считаем одним и тем же виртуальным участником входа программы. */
export const PROGRAM_INGEST_LEGACY_NAMES = new Set<string>(['vMix', 'VMix', 'vmix'])

export function isProgramIngestPeerDisplayName(name: string | null | undefined): boolean {
  const n = name?.trim()
  if (!n) return false
  if (n === PROGRAM_INGEST_DISPLAY_NAME) return true
  return PROGRAM_INGEST_LEGACY_NAMES.has(n)
}
