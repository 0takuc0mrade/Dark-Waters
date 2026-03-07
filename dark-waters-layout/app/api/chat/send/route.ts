import { randomUUID } from "crypto"

import { NextResponse, type NextRequest } from "next/server"

import { readChatSessionFromRequest, validateSessionScope } from "@/src/lib/chat/session"
import { getServiceSupabaseClient } from "@/src/lib/chat/supabase-server"
import type { ChatMessage } from "@/src/lib/chat/types"

export const runtime = "nodejs"

interface SendRequestBody {
  gameId: number | string
  message: string
  clientMessageId?: string
}

function parseGameId(value: number | string): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.floor(parsed)
}

function mapMessageRow(row: Record<string, unknown>): ChatMessage {
  return {
    id: Number(row.id),
    gameId: Number(row.game_id),
    sender: String(row.sender ?? ""),
    message: String(row.message ?? ""),
    clientMessageId: String(row.client_msg_id ?? ""),
    createdAt: String(row.created_at ?? ""),
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = readChatSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json()) as Partial<SendRequestBody>
    const gameId = parseGameId(body.gameId ?? "")
    const message = typeof body.message === "string" ? body.message.trim() : ""

    if (!gameId || !validateSessionScope(session, gameId)) {
      return NextResponse.json({ error: "Unauthorized scope" }, { status: 401 })
    }

    if (message.length === 0 || message.length > 280) {
      return NextResponse.json({ error: "Message must be between 1 and 280 chars" }, { status: 400 })
    }

    const clientMessageId =
      typeof body.clientMessageId === "string" && body.clientMessageId.trim().length > 0
        ? body.clientMessageId.trim()
        : randomUUID()

    const supabase = getServiceSupabaseClient()
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({
        game_id: gameId,
        sender: session.sub,
        message,
        client_msg_id: clientMessageId,
      })
      .select("id, game_id, sender, message, client_msg_id, created_at")
      .single()

    if (error) {
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("chat_messages")
          .select("id, game_id, sender, message, client_msg_id, created_at")
          .eq("game_id", gameId)
          .eq("client_msg_id", clientMessageId)
          .maybeSingle()

        if (existing) {
          return NextResponse.json({ message: mapMessageRow(existing) })
        }
      }

      return NextResponse.json(
        { error: "Failed to send message", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ message: mapMessageRow(data) })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Send failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
