import { createHmac, timingSafeEqual } from "crypto"

import type { ChatTokenPayload } from "@/src/lib/chat/types"

function toBase64Url(input: Buffer | string): string {
  const source = typeof input === "string" ? Buffer.from(input, "utf8") : input
  return source
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, "base64")
}

function sign(unsignedToken: string, secret: string): string {
  return toBase64Url(createHmac("sha256", secret).update(unsignedToken).digest())
}

export function issueChatToken(payload: ChatTokenPayload, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" }
  const encodedHeader = toBase64Url(JSON.stringify(header))
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const unsignedToken = `${encodedHeader}.${encodedPayload}`
  return `${unsignedToken}.${sign(unsignedToken, secret)}`
}

export function verifyChatToken(token: string, secret: string): ChatTokenPayload | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const unsignedToken = `${encodedHeader}.${encodedPayload}`
  const expectedSignature = sign(unsignedToken, secret)

  const expectedBuffer = Buffer.from(expectedSignature, "utf8")
  const providedBuffer = Buffer.from(encodedSignature, "utf8")

  if (expectedBuffer.length !== providedBuffer.length) return null
  if (!timingSafeEqual(expectedBuffer, providedBuffer)) return null

  try {
    const payloadJson = fromBase64Url(encodedPayload).toString("utf8")
    const parsed = JSON.parse(payloadJson) as Partial<ChatTokenPayload>
    if (
      typeof parsed.sub !== "string" ||
      typeof parsed.gameId !== "number" ||
      typeof parsed.iat !== "number" ||
      typeof parsed.exp !== "number" ||
      parsed.aud !== "dark-waters-chat" ||
      parsed.iss !== "dark-waters-api"
    ) {
      return null
    }

    const now = Math.floor(Date.now() / 1000)
    if (parsed.exp <= now) return null

    return parsed as ChatTokenPayload
  } catch {
    return null
  }
}
