import { useState, useEffect, useRef, useCallback } from "react"
import { RpcProvider } from "starknet"
import { useAccount } from "@starknet-react/core"
import { SEPOLIA_CONFIG } from "@/src/config/sepolia-config"
import {
  computeEventId,
  eventBlockNumber,
  loadCheckpoint,
  saveCheckpoint,
} from "@/src/utils/event-checkpoint"
import { ERROR_CODES, logEvent } from "@/src/utils/logger"

const WORLD_ADDRESS = SEPOLIA_CONFIG.WORLD_ADDRESS
const EVENT_EMITTED_SELECTOR =
  "0x1c93f6e4703ae90f75338f29bffbe9c1662200cee981f49afeec26e892debcd"

const GAME_SPAWNED_EVENT_HASH =
  "0x7003ad3d04ce3b53a28689df967350b9610b921088b7e4c6fa97cb34e892798"
const BOARD_COMMITTED_EVENT_HASH =
  "0x575b6f66dbb5b17fb1631bcf236f4a0328f93190da5ce469732b822e40671e3"
const ATTACK_REVEALED_EVENT_HASH =
  "0x2b1e1c82d7adc6a31dcfd63a739314b26b4319934d854c9906d1039b62d8d91"
const CACHE_SCHEMA = "v2"
const DEPLOYMENT_SCOPE = `${SEPOLIA_CONFIG.WORLD_ADDRESS.toLowerCase()}:${SEPOLIA_CONFIG.DEPLOYED_BLOCK}`

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

interface ParsedReveal {
  id: string
  attacker: string
  isHit: boolean
}

interface ParsedGameCache {
  spawn: { player1: string; player2: string } | null
  commits: string[]
  reveals: ParsedReveal[]
}

function sameAddress(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b)
  } catch {
    return a.toLowerCase() === b.toLowerCase()
  }
}

async function fetchEventsSince(
  provider: RpcProvider,
  eventHash: string,
  fromBlock: number
): Promise<any[]> {
  const events: any[] = []
  let continuationToken: string | undefined

  do {
    const page = await provider.getEvents({
      address: WORLD_ADDRESS,
      keys: [[EVENT_EMITTED_SELECTOR], [eventHash]],
      from_block: { block_number: fromBlock },
      to_block: "latest",
      chunk_size: 500,
      continuation_token: continuationToken,
    })
    events.push(...page.events)
    continuationToken = page.continuation_token ?? undefined
  } while (continuationToken)

  return events
}

function cacheKey(gameId: number, address: string): string {
  return `dark-waters-game-cache:${CACHE_SCHEMA}:${DEPLOYMENT_SCOPE}:${gameId}:${address.toLowerCase()}`
}

function loadCache(gameId: number, address: string): ParsedGameCache {
  const raw = localStorage.getItem(cacheKey(gameId, address))
  if (!raw) {
    return { spawn: null, commits: [], reveals: [] }
  }
  try {
    const parsed = JSON.parse(raw) as ParsedGameCache
    return {
      spawn: parsed.spawn ?? null,
      commits: Array.isArray(parsed.commits) ? parsed.commits : [],
      reveals: Array.isArray(parsed.reveals) ? parsed.reveals : [],
    }
  } catch {
    return { spawn: null, commits: [], reveals: [] }
  }
}

function saveCache(gameId: number, address: string, cache: ParsedGameCache): void {
  localStorage.setItem(cacheKey(gameId, address), JSON.stringify(cache))
}

function deriveState(
  gameId: number,
  address: string,
  cache: ParsedGameCache
): GameState | null {
  if (!cache.spawn) return null

  const { player1, player2 } = cache.spawn
  const isPlayer1 = sameAddress(address, player1)
  const isPlayer2 = sameAddress(address, player2)
  const isMyCommit = cache.commits.some((committer) => sameAddress(committer, address))

  const p1Committed = cache.commits.some((committer) => sameAddress(committer, player1))
  const p2Committed = cache.commits.some((committer) => sameAddress(committer, player2))

  let phase: GamePhase = p1Committed && p2Committed ? "Playing" : "Setup"
  let isActive = true
  let winner: string | null = null
  let currentTurn = player1
  let p1Hits = 0
  let p2Hits = 0

  for (const reveal of cache.reveals) {
    if (reveal.isHit) {
      if (sameAddress(reveal.attacker, player1)) p1Hits += 1
      else p2Hits += 1
    }

    currentTurn = sameAddress(reveal.attacker, player1) ? player2 : player1

    if (p1Hits >= 10) {
      winner = player1
      phase = "Finished"
      isActive = false
      break
    }
    if (p2Hits >= 10) {
      winner = player2
      phase = "Finished"
      isActive = false
      break
    }
  }

  if (cache.reveals.length > 0 && phase !== "Finished") {
    phase = "Playing"
  }

  return {
    gameId,
    player1,
    player2,
    isPlayer1,
    isPlayer2,
    isMyTurn: isActive ? sameAddress(currentTurn, address) : false,
    isActive,
    winner,
    phase,
    isMyCommit,
  }
}

export const useGameState = (gameId: number | null) => {
  const { address } = useAccount()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const provider = useRef(new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.RPC_URL }))

  useEffect(() => {
    if (!gameId || !address) {
      setGameState(null)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)
    const cache = loadCache(gameId, address)
    const fromCache = deriveState(gameId, address, cache)
    if (fromCache) setGameState(fromCache)

    const syncOne = async (eventHash: string, handler: (event: any, id: string) => void) => {
      const scope = `game-state:${CACHE_SCHEMA}:${DEPLOYMENT_SCOPE}:${gameId}:${address.toLowerCase()}:${eventHash}`
      const checkpoint = loadCheckpoint(scope, SEPOLIA_CONFIG.DEPLOYED_BLOCK)
      const events = await fetchEventsSince(provider.current, eventHash, checkpoint.fromBlock)

      let maxBlock = checkpoint.fromBlock
      const seen = new Set(checkpoint.seenEventIds)

      for (const event of events) {
        maxBlock = Math.max(maxBlock, eventBlockNumber(event, checkpoint.fromBlock))
        const id = computeEventId(event)
        if (seen.has(id)) continue
        seen.add(id)
        handler(event, id)
      }

      saveCheckpoint(scope, { fromBlock: maxBlock, seenEventIds: Array.from(seen) })
    }

    const poll = async () => {
      try {
        await syncOne(GAME_SPAWNED_EVENT_HASH, (event) => {
          if (!event.data || Number(event.data[1]) !== gameId) return
          cache.spawn = {
            player1: event.data[3],
            player2: event.data[4],
          }
        })

        await syncOne(BOARD_COMMITTED_EVENT_HASH, (event) => {
          if (!event.data || Number(event.data[1]) !== gameId) return
          const committer = event.data[3]
          if (!cache.commits.some((entry) => sameAddress(entry, committer))) {
            cache.commits.push(committer)
          }
        })

        await syncOne(ATTACK_REVEALED_EVENT_HASH, (event, id) => {
          if (!event.data || event.data.length < 7 || Number(event.data[1]) !== gameId) return
          const attacker = event.data[3]
          const isHit = Number(event.data[6]) === 1
          if (!cache.reveals.some((reveal) => reveal.id === id)) {
            cache.reveals.push({ id, attacker, isHit })
          }
        })

        saveCache(gameId, address, cache)
        if (cancelled) return
        setGameState(deriveState(gameId, address, cache))
      } catch (error) {
        logEvent("error", {
          code: ERROR_CODES.EVENT_POLL_FAILED,
          message: "Failed to sync game state",
          metadata: { gameId, error: error instanceof Error ? error.message : String(error) },
        })
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    poll()
    const interval = setInterval(poll, 5000)
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

    const scope = `my-games:${CACHE_SCHEMA}:${DEPLOYMENT_SCOPE}:${address.toLowerCase()}`
    const checkpoint = loadCheckpoint(scope, SEPOLIA_CONFIG.DEPLOYED_BLOCK)
    const seen = new Set(checkpoint.seenEventIds)
    const existing = new Map<number, GameSummary>()

    const gamesCacheKey = `dark-waters-my-games:${CACHE_SCHEMA}:${DEPLOYMENT_SCOPE}:${address.toLowerCase()}`
    const raw = localStorage.getItem(gamesCacheKey)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as GameSummary[]
        parsed.forEach((game) => existing.set(game.gameId, game))
      } catch {
        localStorage.removeItem(gamesCacheKey)
      }
    }

    try {
      const events = await fetchEventsSince(
        provider.current,
        GAME_SPAWNED_EVENT_HASH,
        checkpoint.fromBlock
      )
      let maxBlock = checkpoint.fromBlock

      for (const event of events) {
        maxBlock = Math.max(maxBlock, eventBlockNumber(event, checkpoint.fromBlock))
        const id = computeEventId(event)
        if (seen.has(id)) continue
        seen.add(id)

        if (!event.data || event.data.length < 5) continue
        const gameId = Number(event.data[1])
        const p1 = event.data[3]
        const p2 = event.data[4]
        const isP1 = sameAddress(p1, address)
        const isP2 = sameAddress(p2, address)
        if (!isP1 && !isP2) continue
        existing.set(gameId, {
          gameId,
          opponent: isP1 ? p2 : p1,
          isTurn: false,
        })
      }

      const nextGames = Array.from(existing.values()).sort((a, b) => b.gameId - a.gameId)
      localStorage.setItem(gamesCacheKey, JSON.stringify(nextGames))
      saveCheckpoint(scope, { fromBlock: maxBlock, seenEventIds: Array.from(seen) })
      setGames(nextGames)
    } catch (error) {
      logEvent("error", {
        code: ERROR_CODES.EVENT_POLL_FAILED,
        message: "Failed to fetch games",
        metadata: { error: error instanceof Error ? error.message : String(error) },
      })
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
