"use client"

import { useAccount } from "@starknet-react/core"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { normalizeAddress, sameAddress } from "@/src/lib/chat/addresses"
import { getBrowserSupabaseClient } from "@/src/lib/chat/supabase-browser"
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
  const channelRef = useRef<RealtimeChannel | null>(null)

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
    return () => {
      const channel = channelRef.current
      if (channel) {
        const supabase = getBrowserSupabaseClient()
        void supabase.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [])

  useEffect(() => {
    const channel = channelRef.current
    if (channel) {
      const supabase = getBrowserSupabaseClient()
      void supabase.removeChannel(channel)
      channelRef.current = null
    }

    setMessages([])
    setSessionToken(null)

    if (!gameId || !normalizedAddress || !account) {
      setIsBootstrapping(false)
      return
    }

    const connectedAccount = account
    let cancelled = false

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
        setSessionToken(authJson.token)

        const historyResponse = await fetch(`/api/chat/history?gameId=${gameId}`, {
          headers: {
            Authorization: `Bearer ${authJson.token}`,
          },
        })

        const historyJson = (await parseJson(historyResponse)) as Partial<HistoryResponse> | null

        if (!historyResponse.ok) {
          const message =
            historyJson && typeof (historyJson as Record<string, unknown>).error === "string"
              ? String((historyJson as Record<string, unknown>).error)
              : "Failed to load chat history"
          throw new Error(message)
        }

        if (cancelled) return

        const parsedHistory = Array.isArray(historyJson?.messages)
          ? historyJson.messages
              .map((item) => toChatMessage(item))
              .filter((entry): entry is ChatMessage => Boolean(entry))
          : []

        setMessages(parsedHistory)

        const supabase = getBrowserSupabaseClient()
        const channel = supabase
          .channel(`game-chat:${gameId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "chat_messages",
              filter: `game_id=eq.${gameId}`,
            },
            (payload: { new: Record<string, unknown> }) => {
              const mapped = toChatMessage({
                id: payload.new.id,
                gameId: payload.new.game_id,
                sender: payload.new.sender,
                message: payload.new.message,
                clientMessageId: payload.new.client_msg_id,
                createdAt: payload.new.created_at,
              })

              if (!mapped) return
              appendMessage(mapped)
            }
          )

        channelRef.current = channel
        await channel.subscribe()
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
      const channel = channelRef.current
      if (channel) {
        const supabase = getBrowserSupabaseClient()
        void supabase.removeChannel(channel)
        channelRef.current = null
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
