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
  gameId: number
  attacker: string
  x: number
  y: number
}

interface AttackRevealedEvent {
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
}

export interface UseAttackListenerResult {
  /** Attacks made against my board (that I need to reveal) */
  incomingAttacks: AttackMadeEvent[]
  /** Revealed attack results (to update target grid) */
  revealedAttacks: AttackRevealedEvent[]
  /** Whether auto-reveal is currently processing */
  isRevealing: boolean
  /** The last error, if any */
  lastError: string | null
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useAttackListener(
  options: UseAttackListenerOptions = {}
): UseAttackListenerResult {
  const { pollInterval = 4000, enabled = true } = options

  const { account, address } = useAccount()
  const { reveal } = useGameActions()
  const { toast } = useToast()

  const [incomingAttacks, setIncomingAttacks] = useState<AttackMadeEvent[]>([])
  const [revealedAttacks, setRevealedAttacks] = useState<AttackRevealedEvent[]>(
    []
  )
  const [isRevealing, setIsRevealing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  // Track which attacks we've already auto-revealed to avoid duplicates
  const revealedSetRef = useRef<Set<string>>(new Set())

  const provider = useRef(
    new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.RPC_URL })
  )

  // ── Auto-reveal logic ──────────────────────────────────────────────

  const handleAutoReveal = useCallback(
    async (event: AttackMadeEvent) => {
      const key = `${event.gameId}-${event.x}-${event.y}`
      if (revealedSetRef.current.has(key)) return
      revealedSetRef.current.add(key)

      // Load board and salt from localStorage
      const boardJson = localStorage.getItem(LS_BOARD)
      const saltHex = localStorage.getItem(LS_SALT)

      if (!boardJson || !saltHex) {
        console.warn("Cannot auto-reveal: board/salt not found in localStorage")
        // Don't set lastError to avoid UI noise
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

        toast({
          title: isShip ? "Hit Revealed! 💥" : "Miss Revealed 🌊",
          description: `Auto-revealed attack at (${event.x}, ${event.y}).`,
        })
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
    [reveal, toast]
  )

  // ── Polling effect ─────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !address || !account) return

    const gameIdStr = localStorage.getItem(LS_GAME_ID)
    if (!gameIdStr) return

    const gameId = Number(gameIdStr)
    let cancelled = false

    const poll = async () => {
      if (cancelled) return

      try {
        // Fetch all EventEmitted events from the WORLD contract
        const result = await provider.current.getEvents({
          address: WORLD_ADDRESS,
          keys: [[EVENT_EMITTED_SELECTOR]],
          from_block: { block_number: SEPOLIA_CONFIG.DEPLOYED_BLOCK },
          to_block: "latest",
          chunk_size: 200,
          continuation_token: undefined,
        })

        if (cancelled) return

        for (const event of result.events) {
          if (!event.keys || event.keys.length < 2) continue
          if (!event.data || event.data.length < 4) continue

          const eventNameHash = event.keys[1]

          // ── attack_made (hash matches) ────────────────────────────────────────
          if (eventNameHash.toLowerCase() === ATTACK_MADE_EVENT_HASH.toLowerCase()) {
            const keyCount = Number(event.data[0])
            if (keyCount !== 1 || event.data.length < 6) continue

            const evGameId = Number(event.data[1])
            if (evGameId !== gameId) continue

            const attacker = event.data[3]
            const x = Number(event.data[4])
            const y = Number(event.data[5])

            // Robust address comparison using BigInt to handle padding/case
            let isMe = false
            try {
              isMe = BigInt(attacker) === BigInt(address)
            } catch (e) {
              // fallback if parsing fails
              isMe = attacker.toLowerCase() === address.toLowerCase()
            }

            if (!isMe) {
              const attackEvent: AttackMadeEvent = {
                gameId: evGameId,
                attacker,
                x,
                y,
              }

              setIncomingAttacks((prev) => {
                const exists = prev.some(
                  (a) =>
                    a.gameId === evGameId &&
                    a.x === x &&
                    a.y === y
                )
                if (exists) return prev
                return [...prev, attackEvent]
              })

              // Trigger auto-reveal
              handleAutoReveal(attackEvent)
            }
            continue
          }

          // ── attack_revealed (fallback match) ───────────────────────────
          {
            const keyCount = Number(event.data[0])
            if (keyCount !== 1) continue

            const evGameId = Number(event.data[1])
            if (evGameId !== gameId) continue

            const dataCount = Number(event.data[2])
            if (dataCount !== 3) continue

            // Distinguish from attack_made: data[3] is x coordinate (small number)
            const possibleX = Number(event.data[3])
            if (!isNaN(possibleX) && possibleX >= 0 && possibleX <= 9) {
              const x = possibleX
              const y = Number(event.data[4])
              const isHit = Number(event.data[5]) === 1

              if (y >= 0 && y <= 9) {
                setRevealedAttacks((prev) => {
                  const exists = prev.some(
                    (a) => a.gameId === evGameId && a.x === x && a.y === y
                  )
                  if (exists) return prev
                  return [...prev, { gameId: evGameId, x, y, isHit }]
                })
              }
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
  }, [enabled, address, account, pollInterval, handleAutoReveal])

  return {
    incomingAttacks,
    revealedAttacks,
    isRevealing,
    lastError,
  }
}
