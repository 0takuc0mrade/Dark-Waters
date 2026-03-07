"use client"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { getChatPublicEnv } from "@/src/lib/chat/env"

let browserClient: SupabaseClient | null = null

export function getBrowserSupabaseClient(): SupabaseClient {
  if (browserClient) return browserClient

  const env = getChatPublicEnv()
  browserClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  return browserClient
}
