import { queryGameByIdFromDojo } from "@/src/dojo/sdk-client"
import { normalizeAddress, sameAddress } from "@/src/lib/chat/addresses"

export interface GameParticipants {
  player1: string
  player2: string
}

export async function requireGameParticipant(gameId: number, address: string): Promise<GameParticipants> {
  const normalizedAddress = normalizeAddress(address)
  if (!normalizedAddress) {
    throw new Error("Invalid address")
  }

  const game = await queryGameByIdFromDojo(gameId)
  if (!game) {
    throw new Error(`Game ${gameId} not found`)
  }

  if (!sameAddress(normalizedAddress, game.player1) && !sameAddress(normalizedAddress, game.player2)) {
    throw new Error("Address is not a participant in this game")
  }

  return {
    player1: game.player1,
    player2: game.player2,
  }
}
