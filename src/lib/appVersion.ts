import { supabase } from './supabase'

export async function fetchAppVersion(): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('get_app_version')
    if (error) return null
    if (typeof data === 'string' && data.trim()) return data.trim()
    return null
  } catch {
    return null
  }
}

