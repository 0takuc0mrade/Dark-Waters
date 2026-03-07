interface ChatPublicEnv {
  supabaseUrl: string
  supabaseAnonKey: string
}

interface ChatServerEnv extends ChatPublicEnv {
  supabaseServiceRoleKey: string
  chatAuthSecret: string
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value.trim()
}

export function getChatPublicEnv(): ChatPublicEnv {
  return {
    supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  }
}

export function getChatServerEnv(): ChatServerEnv {
  const publicEnv = getChatPublicEnv()
  return {
    ...publicEnv,
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    chatAuthSecret: requireEnv("CHAT_AUTH_SECRET"),
  }
}
