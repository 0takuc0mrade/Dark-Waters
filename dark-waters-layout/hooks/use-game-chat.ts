"use client"

import { useAccount } from "@starknet-react/core"
import { useCallback, useEffect, useMemo, useState } from "react"

import { normalizeAddress, sameAddress } from "@/src/lib/chat/addresses"
import type { ChatMessage, ChatChallengePayload } from "@/src/lib/chat/types"

interface ChallengeResponse {
  challenge: ChatChallengePayload
  typedData: Record<string, unknown>
}

interface AuthResponse {
  token: string
  gameId: number
  address: string
  expiresAt: number
}

interface HistoryResponse {
  messages: ChatMessage[]
}

interface SendResponse {
  message: ChatMessage
}

const POLL_INTERVAL_MS = 3_000

function toChatMessage(input: unknown): ChatMessage | null {
  if (!input || typeof input !== "object") return null
  const row = input as Record<string, unknown>

  const id = Number(row.id)
  const gameId = Number(row.gameId)
  const sender = typeof row.sender === "string" ? row.sender : ""
  const message = typeof row.message === "string" ? row.message : ""
  const clientMessageId = typeof row.clientMessageId === "string" ? row.clientMessageId : ""
  const createdAt = typeof row.createdAt === "string" ? row.createdAt : ""

  if (!Number.isFinite(id) || !Number.isFinite(gameId) || !sender || !message || !createdAt) {
    return null
  }

  return {
    id,
    gameId,
    sender,
    message,
    clientMessageId,
    createdAt,
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function useGameChat(gameId: number | null) {
  const { account, address } = useAccount()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const normalizedAddress = useMemo(() => normalizeAddress(address ?? ""), [address])

  const appendMessage = useCallback((incoming: ChatMessage) => {
    setMessages((previous) => {
      if (previous.some((item) => item.id === incoming.id)) {
        return previous
      }
      const next = [...previous, incoming]
      return next.slice(-200)
    })
  }, [])

  useEffect(() => {
    setMessages([])
    setSessionToken(null)

    if (!gameId || !normalizedAddress || !account) {
      setIsBootstrapping(false)
      return
    }

    const connectedAccount = account
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null

    async function pollHistory(token: string, cursor: string | null): Promise<string | null> {
      const params = new URLSearchParams({ gameId: String(gameId), limit: "50" })
      if (cursor) {
        params.set("after", cursor)
      }

      const response = await fetch(`/api/chat/history?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const historyJson = (await parseJson(response)) as Partial<HistoryResponse> | null
      if (!response.ok) {
        const message =
          historyJson && typeof (historyJson as Record<string, unknown>).error === "string"
            ? String((historyJson as Record<string, unknown>).error)
            : "Failed to sync chat history"
        throw new Error(message)
      }

      const parsedMessages = Array.isArray(historyJson?.messages)
        ? historyJson.messages
            .map((entry) => toChatMessage(entry))
            .filter((entry): entry is ChatMessage => Boolean(entry))
        : []

      for (const entry of parsedMessages) {
        appendMessage(entry)
      }

      if (parsedMessages.length === 0) {
        return cursor
      }

      return parsedMessages[parsedMessages.length - 1]?.createdAt ?? cursor
    }

    async function bootstrap() {
      setIsBootstrapping(true)
      setError(null)

      try {
        const challengeResponse = await fetch("/api/chat/challenge", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ gameId, address: normalizedAddress }),
        })

        const challengeJson = (await parseJson(challengeResponse)) as Partial<ChallengeResponse> | null
        if (!challengeResponse.ok || !challengeJson?.challenge || !challengeJson.typedData) {
          const message =
            challengeJson && typeof (challengeJson as Record<string, unknown>).error === "string"
              ? String((challengeJson as Record<string, unknown>).error)
              : "Failed to request chat challenge"
          throw new Error(message)
        }

        const signature = await connectedAccount.signMessage(challengeJson.typedData as any)

        const authResponse = await fetch("/api/chat/auth", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            gameId,
            address: normalizedAddress,
            nonce: challengeJson.challenge.nonce,
            signature,
          }),
        })

        const authJson = (await parseJson(authResponse)) as Partial<AuthResponse> | null
        if (!authResponse.ok || !authJson?.token) {
          const message =
            authJson && typeof (authJson as Record<string, unknown>).error === "string"
              ? String((authJson as Record<string, unknown>).error)
              : "Failed to authenticate chat"
          throw new Error(message)
        }

        if (cancelled) return
        const token = authJson.token
        setSessionToken(token)

        let cursor: string | null = null
        cursor = await pollHistory(token, cursor)

        const schedulePoll = () => {
          if (cancelled) return
          pollTimer = setTimeout(async () => {
            try {
              cursor = await pollHistory(token, cursor)
            } catch (pollError) {
              if (!cancelled) {
                setError(pollError instanceof Error ? pollError.message : String(pollError))
              }
            } finally {
              schedulePoll()
            }
          }, POLL_INTERVAL_MS)
        }

        schedulePoll()
      } catch (bootstrapError) {
        if (cancelled) return
        setError(bootstrapError instanceof Error ? bootstrapError.message : String(bootstrapError))
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false)
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
      if (pollTimer) {
        clearTimeout(pollTimer)
      }
    }
  }, [account, appendMessage, gameId, normalizedAddress])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !gameId || !sessionToken || !normalizedAddress) return false

      setIsSending(true)
      setError(null)

      try {
        const response = await fetch("/api/chat/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            gameId,
            message: trimmed,
            clientMessageId: crypto.randomUUID(),
          }),
        })

        const json = (await parseJson(response)) as Partial<SendResponse> | null
        if (!response.ok || !json?.message) {
          const message =
            json && typeof (json as Record<string, unknown>).error === "string"
              ? String((json as Record<string, unknown>).error)
              : "Failed to send message"
          throw new Error(message)
        }

        const mapped = toChatMessage(json.message)
        if (mapped) {
          appendMessage(mapped)
        }

        return true
      } catch (sendError) {
        setError(sendError instanceof Error ? sendError.message : String(sendError))
        return false
      } finally {
        setIsSending(false)
      }
    },
    [appendMessage, gameId, normalizedAddress, sessionToken]
  )

  return {
    messages,
    error,
    isBootstrapping,
    isSending,
    canChat: Boolean(gameId && normalizedAddress && sessionToken),
    isMine: (sender: string) => Boolean(normalizedAddress && sameAddress(sender, normalizedAddress)),
    sendMessage,
  }
}
