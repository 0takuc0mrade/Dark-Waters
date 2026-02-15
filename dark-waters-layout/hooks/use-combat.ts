"use client"

import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { useAccount } from "@starknet-react/core"
import { useGameActions } from "@/src/hooks/useGameActions"
import { useGameState } from "@/hooks/useGameState"
import { useToast } from "@/hooks/use-toast"
import type {
  CombatCell,
  BattleLogEntry,
  ShipHealth,
} from "@/components/combat/types"
import { GRID_SIZE } from "@/components/combat/types"
import type { Ship } from "@/src/utils/merkle"

// ── localStorage keys ────────────────────────────────────────────────

const LS_GAME_ID = "dark-waters-gameId"
const LS_BOARD = "dark-waters-board"

// ── Helpers ──────────────────────────────────────────────────────────

function getBoardKey(gameId: number, address: string): string {
  return `${LS_BOARD}:${gameId}:${address.toLowerCase()}`
}

function createEmptyGrid(): CombatCell[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ state: "empty" as const }))
  )
}

function createFallbackFleetGrid(): CombatCell[][] {
  const grid = createEmptyGrid()
  const placements = [
    { shipId: "carrier", cells: [[0,1],[0,2],[0,3],[0,4],[0,5]] },
    { shipId: "battleship", cells: [[2,3],[3,3],[4,3],[5,3]] },
    { shipId: "cruiser", cells: [[4,7],[4,8],[4,9]] },
    { shipId: "submarine", cells: [[7,0],[7,1],[7,2]] },
    { shipId: "destroyer", cells: [[9,5],[9,6]] },
  ]
  for (const ship of placements) {
    for (const [r, c] of ship.cells) {
      grid[r][c] = { state: "ship", shipId: ship.shipId }
    }
  }
  return grid
}

function createFleetGridFromBoard(board: Ship[]): CombatCell[][] {
  const grid = createEmptyGrid()
  for (const cell of board) {
    if (!cell.is_ship) continue
    if (cell.x < 0 || cell.x >= GRID_SIZE || cell.y < 0 || cell.y >= GRID_SIZE) continue
    grid[cell.y][cell.x] = { state: "ship", shipId: "fleet" }
  }
  return grid
}

function getPlayerFleetGrid(gameId: number | null, address?: string): CombatCell[][] {
  if (typeof window === "undefined") return createFallbackFleetGrid()
  if (!gameId || !address) return createFallbackFleetGrid()

  const boardJson =
    localStorage.getItem(getBoardKey(gameId, address)) ??
    localStorage.getItem(LS_BOARD)
  if (!boardJson) return createFallbackFleetGrid()

  try {
    const board: Ship[] = JSON.parse(boardJson)
    return createFleetGridFromBoard(board)
  } catch {
    return createFallbackFleetGrid()
  }
}

const INITIAL_PLAYER_SHIPS: ShipHealth[] = [
  { id: "carrier", name: "Carrier", size: 5, hits: 0, sunk: false },
  { id: "battleship", name: "Battleship", size: 4, hits: 0, sunk: false },
  { id: "cruiser", name: "Cruiser", size: 3, hits: 0, sunk: false },
  { id: "submarine", name: "Submarine", size: 3, hits: 0, sunk: false },
  { id: "destroyer", name: "Destroyer", size: 2, hits: 0, sunk: false },
]

const INITIAL_ENEMY_SHIPS: ShipHealth[] = [
  { id: "e-carrier", name: "Carrier", size: 5, hits: 0, sunk: false },
  { id: "e-battleship", name: "Battleship", size: 4, hits: 0, sunk: false },
  { id: "e-cruiser", name: "Cruiser", size: 3, hits: 0, sunk: false },
  { id: "e-submarine", name: "Submarine", size: 3, hits: 0, sunk: false },
  { id: "e-destroyer", name: "Destroyer", size: 2, hits: 0, sunk: false },
]

function getCoordinateLabel(row: number, col: number): string {
  return `${String.fromCharCode(65 + row)}${col + 1}`
}

function countHitCells(grid: CombatCell[][]): number {
  let hits = 0
  for (const row of grid) {
    for (const cell of row) {
      if (cell.state === "hit") hits += 1
    }
  }
  return hits
}

function buildFleetHealth(template: ShipHealth[], hitCount: number): ShipHealth[] {
  let remainingHits = hitCount
  return template.map((ship) => {
    const hits = Math.min(ship.size, Math.max(0, remainingHits))
    remainingHits -= hits
    return {
      ...ship,
      hits,
      sunk: hits >= ship.size,
    }
  })
}

export function useCombat() {
  const { address } = useAccount()
  const { attack } = useGameActions()
  const { toast } = useToast()

  const [isPlayerTurn, setIsPlayerTurn] = useState(true)
  const [playerGrid, setPlayerGrid] = useState<CombatCell[][]>(() =>
    getPlayerFleetGrid(null, address)
  )
  const [targetGrid, setTargetGrid] = useState<CombatCell[][]>(createEmptyGrid)
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([])
  const [pendingCell, setPendingCell] = useState<{ row: number; col: number } | null>(null)
  const [gameOver, setGameOver] = useState<"win" | "lose" | null>(null)
  const [isAwaitingTurnHandoff, setIsAwaitingTurnHandoff] = useState(false)
  const logIdRef = useRef(0)
  const processedPlayerRevealRef = useRef<Set<string>>(new Set())
  const processedEnemyRevealRef = useRef<Set<string>>(new Set())

  // Read gameId from localStorage
  const [gameId, setGameId] = useState<number | null>(null)
  useEffect(() => {
    const stored = localStorage.getItem(LS_GAME_ID)
    if (stored) setGameId(Number(stored))
  }, [])

  // ── Game State Sync ────────────────────────────────────────────────
  const { gameState } = useGameState(gameId)

  const canFire = isPlayerTurn && !isAwaitingTurnHandoff
  const playerShips = useMemo(
    () => buildFleetHealth(INITIAL_PLAYER_SHIPS, countHitCells(playerGrid)),
    [playerGrid]
  )
  const enemyShips = useMemo(
    () => buildFleetHealth(INITIAL_ENEMY_SHIPS, countHitCells(targetGrid)),
    [targetGrid]
  )

  useEffect(() => {
    setPlayerGrid(getPlayerFleetGrid(gameId, address))
    setTargetGrid(createEmptyGrid())
    setBattleLog([])
    setPendingCell(null)
    setGameOver(null)
    setIsPlayerTurn(true)
    setIsAwaitingTurnHandoff(false)
    processedPlayerRevealRef.current.clear()
    processedEnemyRevealRef.current.clear()
    logIdRef.current = 0
  }, [gameId, address])

  // Sync turn state with blockchain events
  useEffect(() => {
    if (gameState) {
        // If game is over, set game over state
        if (!gameState.isActive && gameState.winner) {
            const isWin = BigInt(gameState.winner) === BigInt(address || "0x0");
            setGameOver(isWin ? "win" : "lose");
        }

        // Update turn if not game over
        // We only update if the turn has CHANGED to avoid jitter/loops if we have local optimistic updates
        if (gameState.isActive) {
            setIsPlayerTurn(gameState.isMyTurn);
            if (isAwaitingTurnHandoff && !gameState.isMyTurn) {
              setIsAwaitingTurnHandoff(false);
            }
        }
    }
  }, [gameState, address, isAwaitingTurnHandoff]);

  const addLogEntry = useCallback(
    (type: "player" | "enemy", coordinate: string, result: "hit" | "miss" | "sunk") => {
      const messageMap = {
        player: {
          hit: `You fired at ${coordinate}... It's a HIT!`,
          miss: `You fired at ${coordinate}... MISS.`,
          sunk: `You fired at ${coordinate}... HIT! Enemy ship SUNK!`,
        },
        enemy: {
          hit: `Enemy fired at ${coordinate}... HIT!`,
          miss: `Enemy fired at ${coordinate}... MISS.`,
          sunk: `Enemy fired at ${coordinate}... HIT! Your ship has been SUNK!`,
        },
      }
      logIdRef.current += 1
      const entry: BattleLogEntry = {
        id: String(logIdRef.current),
        type,
        message: messageMap[type][result],
        coordinate,
        result,
        timestamp: Date.now(),
      }
      setBattleLog((prev) => [entry, ...prev])
    },
    []
  )

  // ── Fire at target: submit attack on-chain ─────────────────────────

  const fireAtTarget = useCallback(
    async (row: number, col: number) => {
      if (!canFire || gameOver) return
      const cell = targetGrid[row][col]
      if (cell.state !== "empty") return

      if (!gameId) {
        toast({
          title: "No Game",
          description: "No active game found. Create one from the lobby.",
          variant: "destructive",
        })
        return
      }

      // Mark cell as pending
      setPendingCell({ row, col })
      const newTargetGrid = targetGrid.map((r) => r.map((c) => ({ ...c })))
      newTargetGrid[row][col] = { state: "pending" }
      setTargetGrid(newTargetGrid)

      const coord = getCoordinateLabel(row, col)

      try {
        // Submit attack on-chain (row = y, col = x)
        const result = await attack(gameId, col, row)

        if (result) {
          toast({
            title: "Attack Submitted!",
            description: `Strike at ${coord} confirmed on-chain. Awaiting reveal...`,
          })

          // After attacking, it's the opponent's turn to reveal
          setIsPlayerTurn(false)
          setIsAwaitingTurnHandoff(true)
          setPendingCell(null)
        }
      } catch (err) {
        console.error("Attack failed:", err)

        // Revert the pending cell
        const reverted = targetGrid.map((r) => r.map((c) => ({ ...c })))
        reverted[row][col] = { state: "empty" }
        setTargetGrid(reverted)
        setPendingCell(null)
        setIsAwaitingTurnHandoff(false)
        if (gameState) {
          setIsPlayerTurn(gameState.isMyTurn)
        }

        toast({
          title: "Attack Failed",
          description: err instanceof Error ? err.message : "Transaction failed.",
          variant: "destructive",
        })
      }
    },
    [canFire, gameOver, targetGrid, gameId, attack, toast, gameState]
  )

  // ── Update grid from revealed events ───────────────────────────────

  const applyRevealedAttack = useCallback(
    (revealId: string, x: number, y: number, isHit: boolean) => {
      if (processedPlayerRevealRef.current.has(revealId)) return
      processedPlayerRevealRef.current.add(revealId)

      // Update the target grid (attacks I made)
      setTargetGrid((prev) => {
        const updated = prev.map((r) => r.map((c) => ({ ...c })))
        if (updated[y] && updated[y][x]) {
          updated[y][x] = { state: isHit ? "hit" : "miss" }
        }
        return updated
      })

      const coord = getCoordinateLabel(y, x)
      addLogEntry("player", coord, isHit ? "hit" : "miss")

      // Turn is now managed by useGameState sync (not set here)
    },
    [addLogEntry]
  )

  // ── Apply incoming attack on our board ─────────────────────────────

  const applyIncomingAttack = useCallback(
    (revealId: string, x: number, y: number, isHit: boolean) => {
      if (processedEnemyRevealRef.current.has(revealId)) return
      processedEnemyRevealRef.current.add(revealId)

      setPlayerGrid((prev) => {
        const updated = prev.map((r) => r.map((c) => ({ ...c })))
        if (updated[y] && updated[y][x]) {
          updated[y][x] = {
            state: isHit ? "hit" : "miss",
            shipId: updated[y][x].shipId,
          }
        }
        return updated
      })

      const coord = getCoordinateLabel(y, x)
      addLogEntry("enemy", coord, isHit ? "hit" : "miss")
    },
    [addLogEntry]
  )

  return {
    isPlayerTurn: canFire,
    playerGrid,
    targetGrid,
    battleLog,
    playerShips,
    enemyShips,
    pendingCell,
    gameOver,
    fireAtTarget,
    applyRevealedAttack,
    applyIncomingAttack,
    gameId,
  }
}
