import { NextResponse } from "next/server"
import { RpcProvider } from "starknet"

import { SEPOLIA_CONFIG } from "@/src/config/sepolia-config"
import { normalizeAddress } from "@/src/lib/chat/addresses"
import { requireGameParticipant } from "@/src/lib/chat/dojo-access"
import { createChatSession } from "@/src/lib/chat/session"
import { getServiceSupabaseClient } from "@/src/lib/chat/supabase-server"
import { buildChatAuthTypedData } from "@/src/lib/chat/typed-data"
import type { ChatChallengePayload } from "@/src/lib/chat/types"

export const runtime = "nodejs"

interface AuthRequestBody {
  gameId: number | string
  address: string
  nonce: string
  signature: string[]
}

function parseGameId(value: number | string): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.floor(parsed)
}

function normalizeSignature(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const signature = value.filter((entry): entry is string => typeof entry === "string")
  if (signature.length < 2) return null
  return signature
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AuthRequestBody>
    const gameId = parseGameId(body.gameId ?? "")
    const normalizedAddress = normalizeAddress(body.address ?? "")
    const signature = normalizeSignature(body.signature)
    const nonce = typeof body.nonce === "string" ? body.nonce.trim() : ""

    if (!gameId || !normalizedAddress || !signature || !nonce) {
      return NextResponse.json(
        { error: "Invalid request. Expected { gameId, address, nonce, signature }." },
        { status: 400 }
      )
    }

    await requireGameParticipant(gameId, normalizedAddress)

    const supabase = getServiceSupabaseClient()
    const { data: nonceRow, error: nonceError } = await supabase
      .from("chat_nonces")
      .select("id, game_id, address, nonce, issued_at, expires_at, used")
      .eq("game_id", gameId)
      .eq("address", normalizedAddress)
      .eq("nonce", nonce)
      .eq("used", false)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (nonceError) {
      return NextResponse.json(
        { error: "Challenge lookup failed", details: nonceError.message },
        { status: 500 }
      )
    }

    if (!nonceRow) {
      return NextResponse.json({ error: "Challenge not found or already used" }, { status: 401 })
    }

    const issuedAt = Math.floor(new Date(nonceRow.issued_at).getTime() / 1000)
    const expiresAt = Math.floor(new Date(nonceRow.expires_at).getTime() / 1000)
    const now = Math.floor(Date.now() / 1000)

    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= now) {
      return NextResponse.json({ error: "Challenge expired" }, { status: 401 })
    }

    const challenge: ChatChallengePayload = {
      gameId,
      nonce,
      issuedAt,
      expiresAt,
    }

    const provider = new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.RPC_URL })
    const isValid = await provider.verifyMessageInStarknet(
      buildChatAuthTypedData(challenge),
      signature,
      normalizedAddress
    )

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const { error: markUsedError } = await supabase
      .from("chat_nonces")
      .update({ used: true })
      .eq("id", nonceRow.id)

    if (markUsedError) {
      return NextResponse.json(
        { error: "Failed to finalize challenge", details: markUsedError.message },
        { status: 500 }
      )
    }

    const { token, payload } = createChatSession(normalizedAddress, gameId)

    return NextResponse.json({
      token,
      expiresAt: payload.exp,
      gameId,
      address: normalizedAddress,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Auth failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
