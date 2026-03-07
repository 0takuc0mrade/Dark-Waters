import { randomBytes } from "crypto"

import { NextResponse } from "next/server"

import { normalizeAddress } from "@/src/lib/chat/addresses"
import { requireGameParticipant } from "@/src/lib/chat/dojo-access"
import { getServiceSupabaseClient } from "@/src/lib/chat/supabase-server"
import { buildChatAuthTypedData } from "@/src/lib/chat/typed-data"
import type { ChatChallengePayload } from "@/src/lib/chat/types"

export const runtime = "nodejs"

interface ChallengeRequestBody {
  gameId: number | string
  address: string
}

function parseGameId(value: number | string): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.floor(parsed)
}

function makeNonce(): string {
  return `0x${randomBytes(31).toString("hex")}`
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ChallengeRequestBody>
    const gameId = parseGameId(body.gameId ?? "")
    const normalizedAddress = normalizeAddress(body.address ?? "")

    if (!gameId || !normalizedAddress) {
      return NextResponse.json(
        { error: "Invalid request. Expected { gameId, address }." },
        { status: 400 }
      )
    }

    await requireGameParticipant(gameId, normalizedAddress)

    const supabase = getServiceSupabaseClient()
    const windowStartIso = new Date(Date.now() - 60_000).toISOString()
    const { count: recentChallengeCount, error: rateError } = await supabase
      .from("chat_nonces")
      .select("id", { head: true, count: "exact" })
      .eq("game_id", gameId)
      .eq("address", normalizedAddress)
      .gte("created_at", windowStartIso)

    if (rateError) {
      return NextResponse.json(
        { error: "Challenge rate-check failed", details: rateError.message },
        { status: 500 }
      )
    }

    if ((recentChallengeCount ?? 0) >= 8) {
      return NextResponse.json(
        { error: "Too many auth attempts. Please wait a minute and try again." },
        { status: 429 }
      )
    }

    const issuedAt = Math.floor(Date.now() / 1000)
    const expiresAt = issuedAt + 60 * 5
    const nonce = makeNonce()

    const { error } = await supabase.from("chat_nonces").insert({
      game_id: gameId,
      address: normalizedAddress,
      nonce,
      issued_at: new Date(issuedAt * 1000).toISOString(),
      expires_at: new Date(expiresAt * 1000).toISOString(),
      used: false,
    })

    if (error) {
      return NextResponse.json(
        { error: "Failed to create auth challenge", details: error.message },
        { status: 500 }
      )
    }

    const challenge: ChatChallengePayload = {
      gameId,
      nonce,
      issuedAt,
      expiresAt,
    }

    return NextResponse.json({
      challenge,
      typedData: buildChatAuthTypedData(challenge),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Challenge request failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
