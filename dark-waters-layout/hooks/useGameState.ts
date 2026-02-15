import { useState, useEffect, useRef, useCallback } from "react"
import { RpcProvider } from "starknet"
import { useAccount } from "@starknet-react/core"
import { SEPOLIA_CONFIG } from "@/src/config/sepolia-config"

const WORLD_ADDRESS = SEPOLIA_CONFIG.WORLD_ADDRESS
const EVENT_EMITTED_SELECTOR =
  "0x1c93f6e4703ae90f75338f29bffbe9c1662200cee981f49afeec26e892debcd"

// Event Hashes — extracted from actual on-chain events
const GAME_SPAWNED_EVENT_HASH =
  "0x7003ad3d04ce3b53a28689df967350b9610b921088b7e4c6fa97cb34e892798"
const BOARD_COMMITTED_EVENT_HASH =
  "0x575b6f66dbb5b17fb1631bcf236f4a0328f93190da5ce469732b822e40671e3"
const ATTACK_REVEALED_EVENT_HASH =
  "0x2b1e1c82d7adc6a31dcfd63a739314b26b4319934d854c9906d1039b62d8d91"

export type GamePhase = "Setup" | "Playing" | "Finished"

export interface GameState {
  gameId: number
  player1: string
  player2: string
  isPlayer1: boolean
  isPlayer2: boolean
  isMyTurn: boolean
  isActive: boolean
  winner: string | null
  phase: GamePhase
  isMyCommit: boolean
}

function sameAddress(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b)
  } catch {
    return a.toLowerCase() === b.toLowerCase()
  }
}

async function fetchAllEvents(provider: RpcProvider, eventHash: string) {
  const events: any[] = []
  let continuationToken: string | undefined

  do {
    const page = await provider.getEvents({
      address: WORLD_ADDRESS,
      keys: [[EVENT_EMITTED_SELECTOR], [eventHash]],
      from_block: { block_number: SEPOLIA_CONFIG.DEPLOYED_BLOCK },
      to_block: "latest",
      chunk_size: 500,
      continuation_token: continuationToken,
    })
    events.push(...page.events)
    continuationToken = page.continuation_token ?? undefined
  } while (continuationToken)

  return events
}

export const useGameState = (gameId: number | null) => {
  const { address } = useAccount()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const provider = useRef(new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.RPC_URL }))
  const hasLoaded = useRef(false)

  useEffect(() => {
    if (!gameId || !address) {
      setGameState(null)
      setIsLoading(false)
      hasLoaded.current = false
      return
    }

    hasLoaded.current = false
    let cancelled = false

    const fetchState = async () => {
      if (!hasLoaded.current) setIsLoading(true)

      try {
        const [spawnEvents, commitEvents, revealEvents] = await Promise.all([
          fetchAllEvents(provider.current, GAME_SPAWNED_EVENT_HASH),
          fetchAllEvents(provider.current, BOARD_COMMITTED_EVENT_HASH),
          fetchAllEvents(provider.current, ATTACK_REVEALED_EVENT_HASH),
        ])

        if (cancelled) return

        const spawnEvent = spawnEvents.find(
          (event) => event.data && Number(event.data[1]) === gameId
        )

        if (!spawnEvent || !spawnEvent.data || spawnEvent.data.length < 5) {
          console.warn(`Game ${gameId} not found on-chain`)
          setGameState((previous) =>
            previous && previous.gameId === gameId ? previous : null
          )
          return
        }

        const player1 = spawnEvent.data[3]
        const player2 = spawnEvent.data[4]
        const isPlayer1 = sameAddress(address, player1)
        const isPlayer2 = sameAddress(address, player2)

        let phase: GamePhase = "Setup"
        let isActive = true
        let winner: string | null = null

        const gameCommits = commitEvents.filter(
          (event) => event.data && Number(event.data[1]) === gameId
        )
        const p1Committed = gameCommits.some(
          (event) =>
            event.data &&
            event.data[3] &&
            sameAddress(event.data[3], player1)
        )
        const p2Committed = gameCommits.some(
          (event) =>
            event.data &&
            event.data[3] &&
            sameAddress(event.data[3], player2)
        )
        const isMyCommit = gameCommits.some(
          (event) =>
            event.data &&
            event.data[3] &&
            sameAddress(event.data[3], address)
        )

        if (p1Committed && p2Committed) {
          phase = "Playing"
        }

        let currentTurn = player1
        let p1Hits = 0
        let p2Hits = 0

        const gameReveals = revealEvents.filter(
          (event) => event.data && Number(event.data[1]) === gameId
        )
        if (gameReveals.length > 0) {
          phase = "Playing"
        }

        for (const reveal of gameReveals) {
          if (!reveal.data || reveal.data.length < 6) continue
          const isHit = Number(reveal.data[5]) === 1

          if (isHit) {
            if (sameAddress(currentTurn, player1)) p1Hits += 1
            else p2Hits += 1

            if (p1Hits >= 10) {
              winner = player1
              isActive = false
              phase = "Finished"
            } else if (p2Hits >= 10) {
              winner = player2
              isActive = false
              phase = "Finished"
            } else {
              currentTurn =
                currentTurn === player1 ? player2 : player1
            }
          } else {
            currentTurn = currentTurn === player1 ? player2 : player1
          }
        }

        const nextState: GameState = {
          gameId,
          player1,
          player2,
          isPlayer1,
          isPlayer2,
          isMyTurn: sameAddress(currentTurn, address),
          isActive,
          winner,
          phase,
          isMyCommit,
        }

        setGameState(nextState)
      } catch (error) {
        console.error("Failed to sync game state:", error)
      } finally {
        hasLoaded.current = true
        setIsLoading(false)
      }
    }

    fetchState()
    const interval = setInterval(fetchState, 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [gameId, address])

  return { gameState, isLoading }
}

export interface GameSummary {
  gameId: number
  opponent: string
  isTurn: boolean
}

export const useMyGames = () => {
  const { address } = useAccount()
  const [games, setGames] = useState<GameSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const provider = useRef(new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.RPC_URL }))

  const fetchGames = useCallback(async () => {
    if (!address) return

    setIsLoading(true)

    try {
      const events = await fetchAllEvents(provider.current, GAME_SPAWNED_EVENT_HASH)
      const myGames: GameSummary[] = []

      for (const event of events) {
        if (!event.data || event.data.length < 5) continue

        const spawnedGameId = Number(event.data[1])
        const p1 = event.data[3]
        const p2 = event.data[4]
        const isP1 = sameAddress(p1, address)
        const isP2 = sameAddress(p2, address)

        if (isP1 || isP2) {
          myGames.push({
            gameId: spawnedGameId,
            opponent: isP1 ? p2 : p1,
            isTurn: false,
          })
        }
      }

      setGames(myGames.sort((a, b) => b.gameId - a.gameId))
    } catch (error) {
      console.error("Failed to fetch my games", error)
    } finally {
      setIsLoading(false)
    }
  }, [address])

  useEffect(() => {
    if (!address) {
      setGames([])
      setIsLoading(false)
      return
    }

    fetchGames()
    const interval = setInterval(fetchGames, 10000)
    return () => clearInterval(interval)
  }, [address, fetchGames])

  return { games, isLoading, refresh: fetchGames }
}
