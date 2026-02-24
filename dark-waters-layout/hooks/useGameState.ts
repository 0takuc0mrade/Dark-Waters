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
const GAME_ENDED_EVENT_HASH =
  "0x0259ed609484026ce0d7af132cae5944310770b975655365e632f144607da0ea"
const STAKE_LOCKED_EVENT_HASH =
  "0x04071e5a6e765d679c678e233f496bbbe680e170f9a1c3cef2be0e88359bb27d"
const STAKE_SETTLED_EVENT_HASH =
  "0x078d7ac564c19c64b99ad685db3d561db171163e89bbcb6d9b2d822711d74701"
const CACHE_SCHEMA = "v5"
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
  opponentCommitted: boolean
  isStakedMatch: boolean
  stakeToken: string | null
  stakeAmount: string
  myStakeLocked: boolean
  opponentStakeLocked: boolean
  stakeSettled: boolean
}

interface ParsedReveal {
  id: string
  attacker: string
  isHit: boolean
  blockNumber: number
  eventIndex: number
}

interface ParsedEndState {
  winner: string
  reason: string
  blockNumber: number
  eventIndex: number
}

interface ParsedSpawnState {
  player1: string
  player2: string
  stakeToken: string | null
  stakeAmount: string
  stakeLockedP1: boolean
  stakeLockedP2: boolean
  stakeSettled: boolean
}

interface ParsedGameCache {
  spawn: ParsedSpawnState | null
  commits: string[]
  reveals: ParsedReveal[]
  ended: ParsedEndState | null
  stakeLockedPlayers: string[]
  stakeSettled: boolean
}

function sameAddress(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b)
  } catch {
    return a.toLowerCase() === b.toLowerCase()
  }
}

function parseBool(value: unknown): boolean {
  try {
    return BigInt(String(value ?? "0")) === BigInt(1)
  } catch {
    return Number(value) === 1
  }
}

function parseBigIntString(value: unknown, fallback = "0"): string {
  try {
    return BigInt(String(value ?? fallback)).toString()
  } catch {
    return fallback
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
    return {
      spawn: null,
      commits: [],
      reveals: [],
      ended: null,
      stakeLockedPlayers: [],
      stakeSettled: false,
    }
  }
  try {
    const parsed = JSON.parse(raw) as ParsedGameCache
    const normalizedReveals = Array.isArray(parsed.reveals)
      ? parsed.reveals.map((reveal) => ({
          id: reveal.id,
          attacker: reveal.attacker,
          isHit: reveal.isHit,
          blockNumber:
            typeof reveal.blockNumber === "number" && Number.isFinite(reveal.blockNumber)
              ? reveal.blockNumber
              : 0,
          eventIndex:
            typeof reveal.eventIndex === "number" && Number.isFinite(reveal.eventIndex)
              ? reveal.eventIndex
              : 0,
        }))
      : []

    const spawn = parsed.spawn
      ? {
          player1: parsed.spawn.player1,
          player2: parsed.spawn.player2,
          stakeToken: parsed.spawn.stakeToken ?? null,
          stakeAmount: parseBigIntString(parsed.spawn.stakeAmount, "0"),
          stakeLockedP1: Boolean(parsed.spawn.stakeLockedP1),
          stakeLockedP2: Boolean(parsed.spawn.stakeLockedP2),
          stakeSettled: Boolean(parsed.spawn.stakeSettled),
        }
      : null

    const ended = parsed.ended
      ? {
          winner: parsed.ended.winner,
          reason: parsed.ended.reason,
          blockNumber:
            typeof parsed.ended.blockNumber === "number" && Number.isFinite(parsed.ended.blockNumber)
              ? parsed.ended.blockNumber
              : 0,
          eventIndex:
            typeof parsed.ended.eventIndex === "number" && Number.isFinite(parsed.ended.eventIndex)
              ? parsed.ended.eventIndex
              : 0,
        }
      : null

    return {
      spawn,
      commits: Array.isArray(parsed.commits) ? parsed.commits : [],
      reveals: normalizedReveals,
      ended,
      stakeLockedPlayers: Array.isArray(parsed.stakeLockedPlayers) ? parsed.stakeLockedPlayers : [],
      stakeSettled: Boolean(parsed.stakeSettled),
    }
  } catch {
    return {
      spawn: null,
      commits: [],
      reveals: [],
      ended: null,
      stakeLockedPlayers: [],
      stakeSettled: false,
    }
  }
}

function saveCache(gameId: number, address: string, cache: ParsedGameCache): void {
  localStorage.setItem(cacheKey(gameId, address), JSON.stringify(cache))
}

function deriveState(gameId: number, address: string, cache: ParsedGameCache): GameState | null {
  if (!cache.spawn) return null

  const { player1, player2 } = cache.spawn
  const isPlayer1 = sameAddress(address, player1)
  const isPlayer2 = sameAddress(address, player2)
  const isMyCommit = cache.commits.some((committer) => sameAddress(committer, address))

  const p1Committed = cache.commits.some((committer) => sameAddress(committer, player1))
  const p2Committed = cache.commits.some((committer) => sameAddress(committer, player2))
  const opponentCommitted = isPlayer1 ? p2Committed : isPlayer2 ? p1Committed : false

  let phase: GamePhase = p1Committed && p2Committed ? "Playing" : "Setup"
  let isActive = true
  let winner: string | null = null
  let currentTurn = player1
  let p1Hits = 0
  let p2Hits = 0

  const orderedReveals = [...cache.reveals].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
    if (a.eventIndex !== b.eventIndex) return a.eventIndex - b.eventIndex
    return a.id.localeCompare(b.id)
  })

  for (const reveal of orderedReveals) {
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

  if (cache.ended) {
    winner = cache.ended.winner
    phase = "Finished"
    isActive = false
  }

  const stakeAmountRaw = parseBigIntString(cache.spawn.stakeAmount, "0")
  const stakeAmount = BigInt(stakeAmountRaw)
  const hasStakeToken =
    cache.spawn.stakeToken !== null && cache.spawn.stakeToken !== "" && !sameAddress(cache.spawn.stakeToken, "0x0")
  const isStakedMatch = hasStakeToken && stakeAmount > BigInt(0)

  let p1StakeLocked = cache.spawn.stakeLockedP1
  let p2StakeLocked = cache.spawn.stakeLockedP2
  for (const player of cache.stakeLockedPlayers) {
    if (sameAddress(player, player1)) p1StakeLocked = true
    else if (sameAddress(player, player2)) p2StakeLocked = true
  }

  const myStakeLocked = !isStakedMatch || (isPlayer1 ? p1StakeLocked : p2StakeLocked)
  const opponentStakeLocked = !isStakedMatch || (isPlayer1 ? p2StakeLocked : p1StakeLocked)
  const stakeSettled = !isStakedMatch || cache.spawn.stakeSettled || cache.stakeSettled

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
    opponentCommitted,
    isStakedMatch,
    stakeToken: isStakedMatch ? cache.spawn.stakeToken : null,
    stakeAmount: stakeAmountRaw,
    myStakeLocked,
    opponentStakeLocked,
    stakeSettled,
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

    const syncOne = async (
      eventHash: string,
      handler: (event: any, id: string, blockNumber: number, eventIndex: number) => void
    ) => {
      const scope = `game-state:${CACHE_SCHEMA}:${DEPLOYMENT_SCOPE}:${gameId}:${address.toLowerCase()}:${eventHash}`
      const checkpoint = loadCheckpoint(scope, SEPOLIA_CONFIG.DEPLOYED_BLOCK)
      const events = await fetchEventsSince(provider.current, eventHash, checkpoint.fromBlock)

      let maxBlock = checkpoint.fromBlock
      const seen = new Set(checkpoint.seenEventIds)

      for (const event of events) {
        const blockNumber = eventBlockNumber(event, checkpoint.fromBlock)
        const rawEventIndex = event.event_index ?? event.index
        const eventIndex =
          typeof rawEventIndex === "number" && Number.isFinite(rawEventIndex)
            ? rawEventIndex
            : 0

        maxBlock = Math.max(maxBlock, blockNumber)
        const id = computeEventId(event)
        if (seen.has(id)) continue
        seen.add(id)
        handler(event, id, blockNumber, eventIndex)
      }

      saveCheckpoint(scope, { fromBlock: maxBlock, seenEventIds: Array.from(seen) })
    }

    const poll = async () => {
      try {
        await syncOne(GAME_SPAWNED_EVENT_HASH, (event) => {
          if (!event.data || Number(event.data[1]) !== gameId) return

          const spawn: ParsedSpawnState = {
            player1: event.data[3],
            player2: event.data[4],
            stakeToken: event.data.length > 10 ? event.data[10] : null,
            stakeAmount: event.data.length > 11 ? parseBigIntString(event.data[11], "0") : "0",
            stakeLockedP1: event.data.length > 12 ? parseBool(event.data[12]) : false,
            stakeLockedP2: event.data.length > 13 ? parseBool(event.data[13]) : false,
            stakeSettled: event.data.length > 14 ? parseBool(event.data[14]) : false,
          }

          if (spawn.stakeToken && sameAddress(spawn.stakeToken, "0x0")) {
            spawn.stakeToken = null
          }
          cache.spawn = spawn
        })

        await syncOne(BOARD_COMMITTED_EVENT_HASH, (event) => {
          if (!event.data || Number(event.data[1]) !== gameId) return
          const committer = event.data[3]
          if (!cache.commits.some((entry) => sameAddress(entry, committer))) {
            cache.commits.push(committer)
          }
        })

        await syncOne(ATTACK_REVEALED_EVENT_HASH, (event, id, blockNumber, eventIndex) => {
          if (!event.data || event.data.length < 7 || Number(event.data[1]) !== gameId) return
          const attacker = event.data[3]
          const isHit = Number(event.data[6]) === 1
          if (!cache.reveals.some((reveal) => reveal.id === id)) {
            cache.reveals.push({ id, attacker, isHit, blockNumber, eventIndex })
          }
        })

        await syncOne(GAME_ENDED_EVENT_HASH, (event, _id, blockNumber, eventIndex) => {
          if (!event.data || event.data.length < 5 || Number(event.data[1]) !== gameId) return
          const winner = event.data[3]
          const reason = event.data[4]
          const prev = cache.ended
          const shouldReplace =
            !prev ||
            blockNumber > prev.blockNumber ||
            (blockNumber === prev.blockNumber && eventIndex >= prev.eventIndex)

          if (shouldReplace) {
            cache.ended = { winner, reason, blockNumber, eventIndex }
          }
        })

        await syncOne(STAKE_LOCKED_EVENT_HASH, (event) => {
          if (!event.data || event.data.length < 6 || Number(event.data[1]) !== gameId) return
          const player = event.data[3]
          if (!cache.stakeLockedPlayers.some((entry) => sameAddress(entry, player))) {
            cache.stakeLockedPlayers.push(player)
          }
        })

        await syncOne(STAKE_SETTLED_EVENT_HASH, (event) => {
          if (!event.data || event.data.length < 6 || Number(event.data[1]) !== gameId) return
          cache.stakeSettled = true
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
        const parsedGameId = Number(event.data[1])
        const p1 = event.data[3]
        const p2 = event.data[4]
        const isP1 = sameAddress(p1, address)
        const isP2 = sameAddress(p2, address)
        if (!isP1 && !isP2) continue
        existing.set(parsedGameId, {
          gameId: parsedGameId,
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
