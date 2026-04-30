import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const supabaseUrlDirect = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/$/, '') ?? ''

function resolveSupabaseUrl(): string {
  if (!supabaseUrlDirect || !supabaseAnonKey) {
    throw new Error('VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY должны быть заданы в .env')
  }
  return supabaseUrlDirect
}

export let supabase: SupabaseClient = createClient(resolveSupabaseUrl(), supabaseAnonKey)
