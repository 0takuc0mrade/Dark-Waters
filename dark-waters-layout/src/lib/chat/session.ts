import type { NextRequest } from "next/server"

import { normalizeAddress, sameAddress } from "@/src/lib/chat/addresses"
import { getChatServerEnv } from "@/src/lib/chat/env"
import { issueChatToken, verifyChatToken } from "@/src/lib/chat/token"
import type { ChatTokenPayload } from "@/src/lib/chat/types"

export interface ChatSession {
  token: string
  payload: ChatTokenPayload
}

export function createChatSession(address: string, gameId: number, ttlSeconds = 60 * 15): ChatSession {
  const normalizedAddress = normalizeAddress(address)
  if (!normalizedAddress) {
    throw new Error("Invalid address")
  }

  const now = Math.floor(Date.now() / 1000)
  const payload: ChatTokenPayload = {
    sub: normalizedAddress,
    gameId,
    iat: now,
    exp: now + ttlSeconds,
    aud: "dark-waters-chat",
    iss: "dark-waters-api",
  }

  const { chatAuthSecret } = getChatServerEnv()
  const token = issueChatToken(payload, chatAuthSecret)
  return { token, payload }
}

export function readChatSessionFromRequest(request: NextRequest): ChatTokenPayload | null {
  const authorization = request.headers.get("authorization") ?? ""
  const [scheme, token] = authorization.split(" ")

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null
  }

  const { chatAuthSecret } = getChatServerEnv()
  return verifyChatToken(token, chatAuthSecret)
}

export function validateSessionScope(
  payload: ChatTokenPayload,
  expectedGameId: number,
  expectedAddress?: string
): boolean {
  if (payload.gameId !== expectedGameId) return false
  if (!expectedAddress) return true
  return sameAddress(payload.sub, expectedAddress)
}
