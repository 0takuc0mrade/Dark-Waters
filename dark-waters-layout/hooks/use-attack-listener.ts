"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { RpcProvider } from "starknet"
import { useAccount } from "@starknet-react/core"

import { useGameActions } from "@/src/hooks/useGameActions"
import { BoardMerkle, type Ship } from "@/src/utils/merkle"
import { useToast } from "@/hooks/use-toast"
import { SEPOLIA_CONFIG } from "@/src/config/sepolia-config"

// ── localStorage keys ────────────────────────────────────────────────

const LS_GAME_ID = "dark-waters-gameId"
const LS_BOARD = "dark-waters-board"
const LS_SALT = "dark-waters-salt"

// ── Dojo World contract ──────────────────────────────────────────────
// All Dojo events are emitted from the WORLD contract, NOT the Actions contract.

const WORLD_ADDRESS = SEPOLIA_CONFIG.WORLD_ADDRESS

// Dojo wraps custom events in "EventEmitted":
//   keys[0] = EventEmitted selector
//   keys[1] = Poseidon(event_namespace, event_name) — unique per event type
//   keys[2] = emitting contract address
//   data[]  = [key_count, ...key_fields, data_count, ...data_fields]

const EVENT_EMITTED_SELECTOR =
  "0x1c93f6e4703ae90f75338f29bffbe9c1662200cee981f49afeec26e892debcd"

// keys[1] hashes — determined empirically from tx receipts
const ATTACK_MADE_EVENT_HASH =
  "0x5548cce77b1d5547ae403fe1c999eb6b5b6deec203bb41d643f1ce0745141dd"

// ── Types ────────────────────────────────────────────────────────────

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
  x: number
  y: number
  isHit: boolean
}

export interface UseAttackListenerOptions {
  /** Poll interval in milliseconds (default: 4000) */
  pollInterval?: number
  /** Whether the listener is active */
  enabled?: boolean
  /** Active game id; falls back to localStorage if omitted */
  gameId?: number | null
}

export interface UseAttackListenerResult {
  /** Attacks made against my board (that I need to reveal) */
  incomingAttacks: AttackMadeEvent[]
  /** Reveals for attacks I made (to update target grid) */
  myRevealedAttacks: AttackRevealedEvent[]
  /** Reveals for attacks enemy made on me (to update player grid + fleet) */
  enemyRevealedAttacks: AttackRevealedEvent[]
  /** Whether auto-reveal is currently processing */
  isRevealing: boolean
  /** The last error, if any */
  lastError: string | null
}

// ── Known event hashes (verified from on-chain) ─────────────────────

const ATTACK_REVEALED_EVENT_HASH =
  "0x2b1e1c82d7adc6a31dcfd63a739314b26b4319934d854c9906d1039b62d8d91"

function sameAddress(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b)
  } catch {
    return a.toLowerCase() === b.toLowerCase()
  }
}

function getBoardKey(gameId: number, address: string) {
  return `${LS_BOARD}:${gameId}:${address.toLowerCase()}`
}

function getSaltKey(gameId: number, address: string) {
  return `${LS_SALT}:${gameId}:${address.toLowerCase()}`
}

async function fetchAllWorldEvents(provider: RpcProvider) {
  const events: any[] = []
  let continuationToken: string | undefined

  do {
    const page = await provider.getEvents({
      address: WORLD_ADDRESS,
      keys: [[EVENT_EMITTED_SELECTOR]],
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

// ── Hook ─────────────────────────────────────────────────────────────

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

  // Track which attacks we've already auto-revealed to avoid duplicates
  const revealedSetRef = useRef<Set<string>>(new Set())
  const incomingSeenRef = useRef<Set<string>>(new Set())
  const myRevealSeenRef = useRef<Set<string>>(new Set())
  const enemyRevealSeenRef = useRef<Set<string>>(new Set())

  const provider = useRef(
    new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.RPC_URL })
  )

  useEffect(() => {
    setIncomingAttacks([])
    setMyRevealedAttacks([])
    setEnemyRevealedAttacks([])
    setLastError(null)
    revealedSetRef.current.clear()
    incomingSeenRef.current.clear()
    myRevealSeenRef.current.clear()
    enemyRevealSeenRef.current.clear()
  }, [optionGameId, address])

  // ── Auto-reveal logic ──────────────────────────────────────────────

  const handleAutoReveal = useCallback(
    async (event: AttackMadeEvent) => {
      if (!address) return
      const key = event.id
      if (revealedSetRef.current.has(key)) return
      revealedSetRef.current.add(key)

      // Load board and salt from localStorage
      const boardJson =
        localStorage.getItem(getBoardKey(event.gameId, address)) ??
        localStorage.getItem(LS_BOARD)
      const saltHex =
        localStorage.getItem(getSaltKey(event.gameId, address)) ??
        localStorage.getItem(LS_SALT)

      if (!boardJson || !saltHex) {
        console.warn("Cannot auto-reveal: board/salt not found in localStorage")
        revealedSetRef.current.delete(key)
        return
      }

      try {
        setIsRevealing(true)
        const board: Ship[] = JSON.parse(boardJson)
        const salt = BigInt(saltHex)

        // Rebuild the Merkle tree
        const merkle = new BoardMerkle(board, salt)

        // Check if the attacked cell is a ship
        const cell = board.find(
          (s) => s.x === event.x && s.y === event.y
        )
        const isShip = cell?.is_ship ?? false

        // Generate proof
        const proof = merkle.getProof(event.x, event.y)
        const proofHex = proof.map((p) => "0x" + p.toString(16))

        // Submit reveal transaction
        await reveal(
          event.gameId,
          event.x,
          event.y,
          saltHex,
          isShip,
          proofHex
        )
      } catch (err: any) {
        const msg = err?.message || ""

        // Ignore errors that mean "already handled" or "invalid context"
        if (
          msg.includes("no recorded attack") ||
          msg.includes("Attacker cannot reveal") ||
          msg.includes("Game not active")
        ) {
          console.log(`[AutoReveal] Skipped (already handled/invalid): ${msg}`)
          return
        }

        console.error("Auto-reveal failed:", err)
        setLastError(msg || "Auto-reveal failed")

        // Remove from set so we can retry if it was a genuine transient error
        revealedSetRef.current.delete(key)

        toast({
          title: "Auto-Reveal Failed",
          description: msg || "Could not reveal attack.",
          variant: "destructive",
        })
      } finally {
        setIsRevealing(false)
      }
    },
    [address, reveal, toast]
  )

  // ── Polling effect ─────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !address || !account) return

    const localGameId = localStorage.getItem(LS_GAME_ID)
    const gameId = optionGameId ?? (localGameId ? Number(localGameId) : null)
    if (!gameId) return
    let cancelled = false

    const poll = async () => {
      if (cancelled) return

      try {
        const events = await fetchAllWorldEvents(provider.current)

        if (cancelled) return

        const pendingByCoordinate = new Map<string, AttackMadeEvent[]>()
        let attackIndex = 0
        let revealIndex = 0

        for (const event of events) {
          if (!event.keys || event.keys.length < 2) continue
          if (!event.data || event.data.length < 6) continue

          const eventNameHash = event.keys[1]

          if (eventNameHash.toLowerCase() === ATTACK_MADE_EVENT_HASH.toLowerCase()) {
            const evGameId = Number(event.data[1])
            if (evGameId !== gameId) continue

            const attacker = event.data[3]
            const x = Number(event.data[4])
            const y = Number(event.data[5])
            if (x < 0 || x > 9 || y < 0 || y > 9) continue

            const isMe = sameAddress(attacker, address)
            const id = `${evGameId}:attack:${attackIndex}:${attacker}:${x}:${y}`
            attackIndex += 1
            const attackEvent: AttackMadeEvent = { id, gameId: evGameId, attacker, x, y }
            const coordKey = `${x},${y}`
            const queue = pendingByCoordinate.get(coordKey) ?? []
            queue.push(attackEvent)
            pendingByCoordinate.set(coordKey, queue)

            if (!isMe) {
              if (!incomingSeenRef.current.has(id)) {
                incomingSeenRef.current.add(id)
                setIncomingAttacks((prev) => [...prev, attackEvent])
              }
              // Retry-safe: handleAutoReveal is internally deduped by revealedSetRef.
              handleAutoReveal(attackEvent)
            }
          }

          if (eventNameHash.toLowerCase() === ATTACK_REVEALED_EVENT_HASH.toLowerCase()) {
            const evGameId = Number(event.data[1])
            if (evGameId !== gameId) continue

            const x = Number(event.data[3])
            const y = Number(event.data[4])
            const isHit = Number(event.data[5]) === 1

            if (x < 0 || x > 9 || y < 0 || y > 9) continue

            const coordKey = `${x},${y}`
            const queue = pendingByCoordinate.get(coordKey)
            const matchedAttack = queue?.shift()
            if (!matchedAttack) continue
            if (queue && queue.length === 0) pendingByCoordinate.delete(coordKey)

            const revealId = `${evGameId}:reveal:${revealIndex}:${matchedAttack.attacker}:${x}:${y}`
            revealIndex += 1
            const revealEvent: AttackRevealedEvent = {
              id: revealId,
              gameId: evGameId,
              x,
              y,
              isHit,
            }

            if (sameAddress(matchedAttack.attacker, address)) {
              if (myRevealSeenRef.current.has(revealId)) continue
              myRevealSeenRef.current.add(revealId)
              setMyRevealedAttacks((prev) => [...prev, revealEvent])
            } else {
              if (enemyRevealSeenRef.current.has(revealId)) continue
              enemyRevealSeenRef.current.add(revealId)
              setEnemyRevealedAttacks((prev) => [...prev, revealEvent])
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Event polling error:", err)
        }
      }
    }

    // Initial fetch
    poll()

    // Set up interval
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
  }
}
