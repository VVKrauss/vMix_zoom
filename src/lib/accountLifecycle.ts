import { supabase } from './supabase'

export async function deleteMyAccount(): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('delete_my_account')
  if (error) return { ok: false, error: error.message }
  const row = data as { ok?: boolean; error?: string; detail?: string } | null
  if (!row || row.ok !== true) {
    return {
      ok: false,
      error: row?.error === 'delete_failed' && row.detail ? row.detail : row?.error ?? 'delete_failed',
    }
  }
  return { ok: true }
}
