type LogLevel = "debug" | "info" | "warn" | "error"

interface LogPayload {
  code: string
  message: string
  metadata?: Record<string, unknown>
}

const ENABLED = process.env.NODE_ENV !== "production"

export function logEvent(level: LogLevel, payload: LogPayload): void {
  if (!ENABLED) return
  const line = {
    ts: new Date().toISOString(),
    level,
    ...payload,
  }
  const serialized = JSON.stringify(line)

  if (level === "error") {
    console.error(serialized)
    return
  }
  if (level === "warn") {
    console.warn(serialized)
    return
  }
  if (level === "info") {
    console.info(serialized)
    return
  }
  console.log(serialized)
}

export const ERROR_CODES = {
  ATTACK_COMMIT_FAILED: "E_ATTACK_COMMIT_FAILED",
  ATTACK_REVEAL_FAILED: "E_ATTACK_REVEAL_FAILED",
  SECRET_LOCKED: "E_SECRET_LOCKED",
  SECRET_DECRYPT_FAILED: "E_SECRET_DECRYPT_FAILED",
  EVENT_POLL_FAILED: "E_EVENT_POLL_FAILED",
  EVENT_PARSE_FAILED: "E_EVENT_PARSE_FAILED",
} as const
