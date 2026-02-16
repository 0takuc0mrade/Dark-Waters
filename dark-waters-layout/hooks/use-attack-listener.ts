"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { RpcProvider } from "starknet"
import { useAccount } from "@starknet-react/core"

import { useGameActions } from "@/src/hooks/useGameActions"
import { BoardMerkle, type Ship } from "@/src/utils/merkle"
import { useToast } from "@/hooks/use-toast"
import { SEPOLIA_CONFIG } from "@/src/config/sepolia-config"
import {
  importRecoveryPackage,
  loadBoardSecrets,
  type BoardSecrets,
} from "@/src/utils/secret-storage"
import {
  computeEventId,
  eventBlockNumber,
  loadCheckpoint,
  saveCheckpoint,
} from "@/src/utils/event-checkpoint"
import { ERROR_CODES, logEvent } from "@/src/utils/logger"

const LS_GAME_ID = "dark-waters-gameId"

const WORLD_ADDRESS = SEPOLIA_CONFIG.WORLD_ADDRESS
const EVENT_EMITTED_SELECTOR =
  "0x1c93f6e4703ae90f75338f29bffbe9c1662200cee981f49afeec26e892debcd"

const ATTACK_MADE_EVENT_HASH =
  "0x5548cce77b1d5547ae403fe1c999eb6b5b6deec203bb41d643f1ce0745141dd"
const ATTACK_REVEALED_EVENT_HASH =
  "0x2b1e1c82d7adc6a31dcfd63a739314b26b4319934d854c9906d1039b62d8d91"
const CACHE_SCHEMA = "v2"
const DEPLOYMENT_SCOPE = `${SEPOLIA_CONFIG.WORLD_ADDRESS.toLowerCase()}:${SEPOLIA_CONFIG.DEPLOYED_BLOCK}`

interface AttackMadeEvent {
  id: string
  gameId: number
  attacker: string
  x: number
  y: number
}

interface AttackRevealedEvent {
  id: string
  gameId: number
  attacker: string
  x: number
  y: number
  isHit: boolean
}

interface SyncHealth {
  lastSyncedAt: number | null
  cursorBlock: number
  processedEvents: number
  pollErrors: number
}

export interface UseAttackListenerOptions {
  pollInterval?: number
  enabled?: boolean
  gameId?: number | null
}

export interface UseAttackListenerResult {
  incomingAttacks: AttackMadeEvent[]
  myRevealedAttacks: AttackRevealedEvent[]
  enemyRevealedAttacks: AttackRevealedEvent[]
  isRevealing: boolean
  lastError: string | null
  syncHealth: SyncHealth
  restoreSecrets: (recoveryPackageJson: string) => boolean
}

function sameAddress(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b)
  } catch {
    return a.toLowerCase() === b.toLowerCase()
  }
}

async function fetchWorldEventsSince(provider: RpcProvider, fromBlock: number): Promise<any[]> {
  const events: any[] = []
  let continuationToken: string | undefined

  do {
    const page = await provider.getEvents({
      address: WORLD_ADDRESS,
      keys: [[EVENT_EMITTED_SELECTOR]],
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

function findShip(board: Ship[], x: number, y: number): boolean {
  const matched = board.find((cell) => cell.x === x && cell.y === y)
  return matched?.is_ship ?? false
}

export function useAttackListener(
  options: UseAttackListenerOptions = {}
): UseAttackListenerResult {
  const { pollInterval = 4000, enabled = true, gameId: optionGameId = null } = options

  const { account, address } = useAccount()
  const { reveal } = useGameActions()
  const { toast } = useToast()

  const [incomingAttacks, setIncomingAttacks] = useState<AttackMadeEvent[]>([])
  const [myRevealedAttacks, setMyRevealedAttacks] = useState<AttackRevealedEvent[]>([])
  const [enemyRevealedAttacks, setEnemyRevealedAttacks] = useState<AttackRevealedEvent[]>([])
  const [isRevealing, setIsRevealing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [syncHealth, setSyncHealth] = useState<SyncHealth>({
    lastSyncedAt: null,
    cursorBlock: SEPOLIA_CONFIG.DEPLOYED_BLOCK,
    processedEvents: 0,
    pollErrors: 0,
  })

  const provider = useRef(new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.RPC_URL }))

  const autoRevealInFlightRef = useRef<Set<string>>(new Set())
  const seenEventIdsRef = useRef<Set<string>>(new Set())
  const cursorBlockRef = useRef<number>(SEPOLIA_CONFIG.DEPLOYED_BLOCK)

  const restoreSecrets = useCallback((recoveryPackageJson: string): boolean => {
    const restored = importRecoveryPackage(recoveryPackageJson)
    if (!restored) return false
    setLastError(null)
    return true
  }, [])

  const tryLoadSecrets = useCallback(
    async (gameId: number): Promise<BoardSecrets | null> => {
      if (!address) return null
      return loadBoardSecrets(gameId, address)
    },
    [address]
  )

  const handleAutoReveal = useCallback(
    async (event: AttackMadeEvent) => {
      if (!address) return
      if (autoRevealInFlightRef.current.has(event.id)) return
      autoRevealInFlightRef.current.add(event.id)

      try {
        const secrets = await tryLoadSecrets(event.gameId)
        if (!secrets) {
          setLastError(ERROR_CODES.SECRET_LOCKED)
          autoRevealInFlightRef.current.delete(event.id)
          return
        }

        setIsRevealing(true)
        const merkle = new BoardMerkle(secrets.board, secrets.masterSecret)
        const isShip = findShip(secrets.board, event.x, event.y)
        const proofHex = merkle.getProof(event.x, event.y).map((p) => `0x${p.toString(16)}`)
        const cellNonce = merkle.getCellNonceHex(event.x, event.y)

        await reveal(event.gameId, event.x, event.y, cellNonce, isShip, proofHex)
        setLastError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setLastError(message || ERROR_CODES.SECRET_DECRYPT_FAILED)
        autoRevealInFlightRef.current.delete(event.id)
        logEvent("error", {
          code: ERROR_CODES.EVENT_PARSE_FAILED,
          message: "Auto-reveal failed.",
          metadata: { error: message, gameId: event.gameId, x: event.x, y: event.y },
        })
        toast({
          title: "Auto-Reveal Failed",
          description: message || "Could not reveal attack.",
          variant: "destructive",
        })
      } finally {
        setIsRevealing(false)
      }
    },
    [address, reveal, toast, tryLoadSecrets]
  )

  useEffect(() => {
    if (!enabled || !address || !account) return

    const localGameId = localStorage.getItem(LS_GAME_ID)
    const gameId = optionGameId ?? (localGameId ? Number(localGameId) : null)
    if (!gameId) return

    const scope = `attack-listener:${CACHE_SCHEMA}:${DEPLOYMENT_SCOPE}:${gameId}:${address.toLowerCase()}`
    const checkpoint = loadCheckpoint(scope, SEPOLIA_CONFIG.DEPLOYED_BLOCK)
    seenEventIdsRef.current = new Set(checkpoint.seenEventIds)
    cursorBlockRef.current = checkpoint.fromBlock

    setIncomingAttacks([])
    setMyRevealedAttacks([])
    setEnemyRevealedAttacks([])
    setSyncHealth((prev) => ({
      ...prev,
      cursorBlock: cursorBlockRef.current,
      processedEvents: 0,
    }))

    let cancelled = false

    const poll = async () => {
      if (cancelled) return

      try {
        const events = await fetchWorldEventsSince(provider.current, cursorBlockRef.current)
        if (cancelled) return

        let processed = 0
        let maxBlock = cursorBlockRef.current

        for (const event of events) {
          maxBlock = Math.max(maxBlock, eventBlockNumber(event, cursorBlockRef.current))

          if (!event.keys || event.keys.length < 2) continue
          if (!event.data || event.data.length < 6) continue

          const id = computeEventId(event)
          if (seenEventIdsRef.current.has(id)) continue
          seenEventIdsRef.current.add(id)

          const eventNameHash = String(event.keys[1]).toLowerCase()
          if (eventNameHash === ATTACK_MADE_EVENT_HASH.toLowerCase()) {
            const evGameId = Number(event.data[1])
            if (evGameId !== gameId) continue
            const attacker = event.data[3]
            const x = Number(event.data[4])
            const y = Number(event.data[5])
            if (x < 0 || x > 9 || y < 0 || y > 9) continue

            processed += 1
            const attackEvent: AttackMadeEvent = { id, gameId: evGameId, attacker, x, y }
            if (!sameAddress(attacker, address)) {
              setIncomingAttacks((prev) => [...prev, attackEvent])
              handleAutoReveal(attackEvent)
            }
            continue
          }

          if (eventNameHash === ATTACK_REVEALED_EVENT_HASH.toLowerCase()) {
            if (event.data.length < 7) continue
            const evGameId = Number(event.data[1])
            if (evGameId !== gameId) continue
            const attacker = event.data[3]
            const x = Number(event.data[4])
            const y = Number(event.data[5])
            const isHit = Number(event.data[6]) === 1
            if (x < 0 || x > 9 || y < 0 || y > 9) continue

            processed += 1
            const revealEvent: AttackRevealedEvent = {
              id,
              gameId: evGameId,
              attacker,
              x,
              y,
              isHit,
            }

            if (sameAddress(attacker, address)) {
              setMyRevealedAttacks((prev) => [...prev, revealEvent])
            } else {
              setEnemyRevealedAttacks((prev) => [...prev, revealEvent])
            }
          }
        }

        cursorBlockRef.current = maxBlock
        saveCheckpoint(scope, {
          fromBlock: cursorBlockRef.current,
          seenEventIds: Array.from(seenEventIdsRef.current),
        })

        setSyncHealth((prev) => ({
          lastSyncedAt: Date.now(),
          cursorBlock: cursorBlockRef.current,
          processedEvents: prev.processedEvents + processed,
          pollErrors: prev.pollErrors,
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setSyncHealth((prev) => ({ ...prev, pollErrors: prev.pollErrors + 1 }))
        logEvent("error", {
          code: ERROR_CODES.EVENT_POLL_FAILED,
          message: "Event polling failed.",
          metadata: { error: message, cursorBlock: cursorBlockRef.current },
        })
      }
    }

    poll()
    const intervalId = setInterval(poll, pollInterval)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [enabled, address, account, pollInterval, optionGameId, handleAutoReveal])

  return {
    incomingAttacks,
    myRevealedAttacks,
    enemyRevealedAttacks,
    isRevealing,
    lastError,
    syncHealth,
    restoreSecrets,
  }
}
