import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { getChatServerEnv } from "@/src/lib/chat/env"

let cachedClient: SupabaseClient | null = null

export function getServiceSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient

  const env = getChatServerEnv()
  cachedClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  return cachedClient
}
