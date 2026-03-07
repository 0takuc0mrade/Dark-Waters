import { NextResponse, type NextRequest } from "next/server"

import { readChatSessionFromRequest, validateSessionScope } from "@/src/lib/chat/session"
import { getServiceSupabaseClient } from "@/src/lib/chat/supabase-server"
import type { ChatMessage } from "@/src/lib/chat/types"

export const runtime = "nodejs"

function parseGameId(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.floor(parsed)
}

function parseLimit(value: string | null): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 50
  return Math.min(Math.floor(parsed), 100)
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

export async function GET(request: NextRequest) {
  try {
    const gameId = parseGameId(request.nextUrl.searchParams.get("gameId"))
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"))
    const before = request.nextUrl.searchParams.get("before")

    if (!gameId) {
      return NextResponse.json({ error: "Missing or invalid gameId" }, { status: 400 })
    }

    const session = readChatSessionFromRequest(request)
    if (!session || !validateSessionScope(session, gameId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = getServiceSupabaseClient()
    let query = supabase
      .from("chat_messages")
      .select("id, game_id, sender, message, client_msg_id, created_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (before) {
      query = query.lt("created_at", before)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { error: "Failed to load history", details: error.message },
        { status: 500 }
      )
    }

    const messages = (data ?? [])
      .map((row: Record<string, unknown>) => mapMessageRow(row))
      .reverse()
    return NextResponse.json({ messages })
  } catch (error) {
    return NextResponse.json(
      {
        error: "History fetch failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
