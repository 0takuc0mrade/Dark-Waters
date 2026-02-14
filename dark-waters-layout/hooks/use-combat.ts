"use client"

import React from "react"

import { useState, useCallback, useRef, useEffect } from "react"
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

function createEmptyGrid(): CombatCell[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ state: "empty" as const }))
  )
}

function createPlayerFleetGrid(): CombatCell[][] {
  // Try to load the actual board from localStorage
  if (typeof window !== "undefined") {
    const boardJson = localStorage.getItem(LS_BOARD)
    if (boardJson) {
      try {
        const board: Ship[] = JSON.parse(boardJson)
        const grid = createEmptyGrid()
        for (const cell of board) {
          if (cell.is_ship && cell.x >= 0 && cell.x < GRID_SIZE && cell.y >= 0 && cell.y < GRID_SIZE) {
            // Grid uses [row][col] where row = y, col = x
            grid[cell.y][cell.x] = { state: "ship", shipId: "fleet" }
          }
        }
        return grid
      } catch {
        // fallback to default
      }
    }
  }

  // Fallback: pre-placed fleet for demo
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

export function useCombat() {
  const { address } = useAccount()
  const { attack, isLoading: txLoading } = useGameActions()
  const { toast } = useToast()

  const [isPlayerTurn, setIsPlayerTurn] = useState(true)
  const [playerGrid, setPlayerGrid] = useState<CombatCell[][]>(createPlayerFleetGrid)
  const [targetGrid, setTargetGrid] = useState<CombatCell[][]>(createEmptyGrid)
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([])
  const [playerShips, setPlayerShips] = useState<ShipHealth[]>(
    INITIAL_PLAYER_SHIPS.map((s) => ({ ...s }))
  )
  const [enemyShips, setEnemyShips] = useState<ShipHealth[]>(
    INITIAL_ENEMY_SHIPS.map((s) => ({ ...s }))
  )
  const [pendingCell, setPendingCell] = useState<{ row: number; col: number } | null>(null)
  const [gameOver, setGameOver] = useState<"win" | "lose" | null>(null)
  const [txModal, setTxModal] = useState<{
    open: boolean
    coordinate: string
    onResolve: (() => void) | null
  }>({ open: false, coordinate: "", onResolve: null })
  const logIdRef = useRef(0)

  // Read gameId from localStorage
  const [gameId, setGameId] = useState<number | null>(null)
  useEffect(() => {
    const stored = localStorage.getItem(LS_GAME_ID)
    if (stored) setGameId(Number(stored))
  }, [])

  // ── Game State Sync ────────────────────────────────────────────────
  const { gameState } = useGameState(gameId)

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
        }
    }
  }, [gameState, address]);

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
      if (!isPlayerTurn || gameOver) return
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

      // Show transaction modal
      setTxModal({
        open: true,
        coordinate: coord,
        onResolve: null, // Will be set after tx completes
      })

      try {
        // Submit attack on-chain
        // Note: in the grid, row = y, col = x
        const result = await attack(gameId, col, row)

        if (result) {
          toast({
            title: "Attack Submitted!",
            description: `Strike at ${coord} confirmed on-chain. Awaiting reveal...`,
          })

          addLogEntry("player", coord, "miss") // We won't know hit/miss until reveal

          // Close modal on success
          setTxModal({ open: false, coordinate: "", onResolve: null })

          // After attacking, it's the opponent's turn to reveal, then they attack
          setIsPlayerTurn(false)

          // The attack_revealed event listener (useAttackListener) will
          // update the cell state when the opponent reveals
        }
      } catch (err) {
        console.error("Attack failed:", err)

        // Revert the pending cell
        const reverted = targetGrid.map((r) => r.map((c) => ({ ...c })))
        reverted[row][col] = { state: "empty" }
        setTargetGrid(reverted)
        setPendingCell(null)

        setTxModal({ open: false, coordinate: "", onResolve: null })

        toast({
          title: "Attack Failed",
          description: err instanceof Error ? err.message : "Transaction failed.",
          variant: "destructive",
        })
      }
    },
    [isPlayerTurn, gameOver, targetGrid, gameId, attack, toast, addLogEntry]
  )

  // ── Update grid from revealed events ───────────────────────────────

  const applyRevealedAttack = useCallback(
    (x: number, y: number, isHit: boolean) => {
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

      // After reveal, it may become our turn again
      setIsPlayerTurn(true)
    },
    [addLogEntry]
  )

  // ── Apply incoming attack on our board ─────────────────────────────

  const applyIncomingAttack = useCallback(
    (x: number, y: number, isHit: boolean) => {
      setPlayerGrid((prev) => {
        const updated = prev.map((r) => r.map((c) => ({ ...c })))
        if (updated[y] && updated[y][x]) {
          updated[y][x] = { state: isHit ? "hit" : "miss" }
        }
        return updated
      })

      const coord = getCoordinateLabel(y, x)
      addLogEntry("enemy", coord, isHit ? "hit" : "miss")
    },
    [addLogEntry]
  )

  // Close the transaction modal (cancel)
  const closeTxModal = useCallback(() => {
    if (pendingCell) {
      const reverted = targetGrid.map((r) => r.map((c) => ({ ...c })))
      reverted[pendingCell.row][pendingCell.col] = { state: "empty" }
      setTargetGrid(reverted)
      setPendingCell(null)
    }
    setTxModal({ open: false, coordinate: "", onResolve: null })
  }, [pendingCell, targetGrid])

  // Complete the transaction modal (success path)
  const completeTxModal = useCallback(() => {
    txModal.onResolve?.()
    setTxModal({ open: false, coordinate: "", onResolve: null })
  }, [txModal])

  return {
    isPlayerTurn,
    playerGrid,
    targetGrid,
    battleLog,
    playerShips,
    enemyShips,
    pendingCell,
    gameOver,
    fireAtTarget,
    txModal,
    closeTxModal,
    completeTxModal,
    applyRevealedAttack,
    applyIncomingAttack,
    gameId,
  }
}
