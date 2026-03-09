import { RpcProvider } from "starknet"

import { normalizeAddress, sameAddress } from "@/src/lib/chat/addresses"
import { SEPOLIA_CONFIG } from "@/src/config/sepolia-config"

export interface GameParticipants {
  player1: string
  player2: string
}

// ── On-chain event constants (same as useGameState) ──────────────────

const EVENT_EMITTED_SELECTOR =
  "0x1c93f6e4703ae90f75338f29bffbe9c1662200cee981f49afeec26e892debcd"

const GAME_SPAWNED_EVENT_HASH =
  "0x7003ad3d04ce3b53a28689df967350b9610b921088b7e4c6fa97cb34e892798"

/**
 * Verify that `address` is a participant (player1 or player2) in `gameId`
 * by scanning on-chain game_spawned events via Starknet RPC.
 *
 * This avoids the Dojo SDK/Torii gRPC dependency which fails on Slot
 * deployments with content-type mismatches.
 */
export async function requireGameParticipant(gameId: number, address: string): Promise<GameParticipants> {
  const normalizedAddress = normalizeAddress(address)
  if (!normalizedAddress) {
    throw new Error("Invalid address")
  }

  const provider = new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.RPC_URL })

  const result = await provider.getEvents({
    address: SEPOLIA_CONFIG.WORLD_ADDRESS,
    keys: [[EVENT_EMITTED_SELECTOR]],
    from_block: { block_number: SEPOLIA_CONFIG.DEPLOYED_BLOCK },
    to_block: "latest",
    chunk_size: 200,
    continuation_token: undefined,
  })

  // Scan game_spawned events to find the game
  for (const event of result.events) {
    if (!event.keys || event.keys.length < 2) continue
    if (!event.data || event.data.length < 5) continue

    const eventNameHash = event.keys[1]
    if (eventNameHash.toLowerCase() !== GAME_SPAWNED_EVENT_HASH.toLowerCase()) continue

    // game_spawned data layout: [key_count, game_id, data_count, player1, player2]
    const evGameId = Number(event.data[1])
    if (evGameId !== gameId) continue

    const player1 = event.data[3]
    const player2 = event.data[4]

    if (!sameAddress(normalizedAddress, player1) && !sameAddress(normalizedAddress, player2)) {
      throw new Error("Address is not a participant in this game")
    }

    return { player1, player2 }
  }

  throw new Error(`Game ${gameId} not found`)
}
