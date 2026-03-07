import { NextResponse } from "next/server"

export const runtime = "nodejs"

const CARTRIDGE_LOOKUP_URL = "https://api.cartridge.gg/lookup"

interface ResolveRequestBody {
  username?: string
}

interface CartridgeLookupResult {
  username?: string
  addresses?: string[]
}

interface CartridgeLookupResponse {
  results?: CartridgeLookupResult[]
}

function normalizeUsername(value: string): string {
  const trimmed = value.trim()
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed
}

function isHexAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]+$/.test(value)
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ResolveRequestBody
    const inputUsername = typeof body.username === "string" ? normalizeUsername(body.username) : ""

    if (!inputUsername) {
      return NextResponse.json(
        { error: "Invalid request. Expected { username }." },
        { status: 400 }
      )
    }

    const lookupResponse = await fetch(CARTRIDGE_LOOKUP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [inputUsername] }),
      cache: "no-store",
    })

    if (!lookupResponse.ok) {
      return NextResponse.json(
        {
          error: "Cartridge lookup failed",
          details: `HTTP ${lookupResponse.status}`,
        },
        { status: 502 }
      )
    }

    const payload = (await lookupResponse.json()) as CartridgeLookupResponse
    const match =
      payload.results?.find((entry) => entry.username?.toLowerCase() === inputUsername.toLowerCase()) ??
      payload.results?.[0]

    const resolvedAddress = match?.addresses?.[0]
    if (!resolvedAddress || !isHexAddress(resolvedAddress)) {
      return NextResponse.json(
        { error: "Cartridge username not found." },
        { status: 404 }
      )
    }

    return NextResponse.json({
      username: match?.username ?? inputUsername,
      address: resolvedAddress,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to resolve Cartridge username.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
