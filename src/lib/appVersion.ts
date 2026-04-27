import { v1GetAppVersion } from '../api/miscApi'

export async function fetchAppVersion(): Promise<string | null> {
  try {
    const r = await v1GetAppVersion()
    const v = r.data
    return typeof v === 'string' && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

