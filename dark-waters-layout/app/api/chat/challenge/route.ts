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

    const issuedAt = Math.floor(Date.now() / 1000)
    const expiresAt = issuedAt + 60 * 5
    const nonce = makeNonce()

    const supabase = getServiceSupabaseClient()
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
