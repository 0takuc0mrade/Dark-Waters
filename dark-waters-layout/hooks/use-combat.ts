"use client"

import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { useAccount } from "@starknet-react/core"
import { useGameActions } from "@/src/hooks/useGameActions"
import { useGameState } from "@/hooks/useGameState"
import { useToast } from "@/hooks/use-toast"
import type { CombatCell, BattleLogEntry, ShipHealth } from "@/components/combat/types"
import { GRID_SIZE } from "@/components/combat/types"
import {
  computeAttackCommitmentHash,
  randomFeltHex,
  type Ship,
} from "@/src/utils/merkle"
import { loadBoardSecrets } from "@/src/utils/secret-storage"
import { ERROR_CODES, logEvent } from "@/src/utils/logger"

const LS_GAME_ID = "dark-waters-gameId"

interface PersistedCombatState {
  playerGrid: CombatCell[][]
  targetGrid: CombatCell[][]
  battleLog: BattleLogEntry[]
  playerRevealIds: string[]
  enemyRevealIds: string[]
  logCounter: number
}

function getCombatStateKey(gameId: number, address: string): string {
  return `dark-waters-combat-state:${gameId}:${address.toLowerCase()}`
}

function createEmptyGrid(): CombatCell[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ state: "empty" as const }))
  )
}

function createFallbackFleetGrid(): CombatCell[][] {
  const grid = createEmptyGrid()
  const placements = [
    { shipId: "carrier", cells: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]] },
    { shipId: "battleship", cells: [[2, 3], [3, 3], [4, 3], [5, 3]] },
    { shipId: "cruiser", cells: [[4, 7], [4, 8], [4, 9]] },
    { shipId: "submarine", cells: [[7, 0], [7, 1], [7, 2]] },
    { shipId: "destroyer", cells: [[9, 5], [9, 6]] },
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

export function useCombat() {
  const { address } = useAccount()
  const { commitAttack, revealAttack } = useGameActions()
  const { toast } = useToast()

  const [isPlayerTurn, setIsPlayerTurn] = useState(true)
  const [playerGrid, setPlayerGrid] = useState<CombatCell[][]>(createFallbackFleetGrid)
  const [targetGrid, setTargetGrid] = useState<CombatCell[][]>(createEmptyGrid)
  const [battleLog, setBattleLog] = useState<BattleLogEntry[]>([])
  const [pendingCell, setPendingCell] = useState<{ row: number; col: number } | null>(null)
  const [gameOver, setGameOver] = useState<"win" | "lose" | null>(null)
  const [isAwaitingTurnHandoff, setIsAwaitingTurnHandoff] = useState(false)

  const logIdRef = useRef(0)
  const processedPlayerRevealRef = useRef<Set<string>>(new Set())
  const processedEnemyRevealRef = useRef<Set<string>>(new Set())

  const [gameId, setGameId] = useState<number | null>(null)
  useEffect(() => {
    const stored = localStorage.getItem(LS_GAME_ID)
    if (stored) setGameId(Number(stored))
  }, [])

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
    let cancelled = false

    setPlayerGrid(createFallbackFleetGrid())
    setTargetGrid(createEmptyGrid())
    setBattleLog([])
    setPendingCell(null)
    setGameOver(null)
    setIsPlayerTurn(true)
    setIsAwaitingTurnHandoff(false)
    processedPlayerRevealRef.current.clear()
    processedEnemyRevealRef.current.clear()
    logIdRef.current = 0

    if (!gameId || !address) return

    let loadedPersistedState = false
    const persistedRaw = localStorage.getItem(getCombatStateKey(gameId, address))
    if (persistedRaw) {
      try {
        const parsed = JSON.parse(persistedRaw) as PersistedCombatState
        if (!cancelled) {
          loadedPersistedState = true
          setPlayerGrid(parsed.playerGrid)
          setTargetGrid(parsed.targetGrid)
          setBattleLog(parsed.battleLog ?? [])
          logIdRef.current = parsed.logCounter ?? 0
          processedPlayerRevealRef.current = new Set(parsed.playerRevealIds ?? [])
          processedEnemyRevealRef.current = new Set(parsed.enemyRevealIds ?? [])
        }
      } catch {
        localStorage.removeItem(getCombatStateKey(gameId, address))
      }
    }

    ;(async () => {
      const secrets = await loadBoardSecrets(gameId, address)
      if (cancelled || !secrets || loadedPersistedState) return
      setPlayerGrid(createFleetGridFromBoard(secrets.board))
    })()

    return () => {
      cancelled = true
    }
  }, [gameId, address])

  useEffect(() => {
    if (!gameId || !address) return
    const snapshot: PersistedCombatState = {
      playerGrid,
      targetGrid,
      battleLog: battleLog.slice(0, 80),
      playerRevealIds: Array.from(processedPlayerRevealRef.current).slice(-2000),
      enemyRevealIds: Array.from(processedEnemyRevealRef.current).slice(-2000),
      logCounter: logIdRef.current,
    }
    localStorage.setItem(getCombatStateKey(gameId, address), JSON.stringify(snapshot))
  }, [gameId, address, playerGrid, targetGrid, battleLog])

  useEffect(() => {
    if (!gameState) return
    if (!gameState.isActive && gameState.winner) {
      const isWin = BigInt(gameState.winner) === BigInt(address || "0x0")
      setGameOver(isWin ? "win" : "lose")
    }

    if (gameState.isActive) {
      setIsPlayerTurn(gameState.isMyTurn)
      if (isAwaitingTurnHandoff && !gameState.isMyTurn) {
        setIsAwaitingTurnHandoff(false)
      }
    }
  }, [gameState, address, isAwaitingTurnHandoff])

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
      setBattleLog((prev) => [
        {
          id: String(logIdRef.current),
          type,
          message: messageMap[type][result],
          coordinate,
          result,
          timestamp: Date.now(),
        },
        ...prev,
      ])
    },
    []
  )

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

      setPendingCell({ row, col })
      const optimisticGrid = targetGrid.map((r) => r.map((c) => ({ ...c })))
      optimisticGrid[row][col] = { state: "pending" }
      setTargetGrid(optimisticGrid)

      const coord = getCoordinateLabel(row, col)
      const revealNonce = randomFeltHex(16)
      const attackHash = computeAttackCommitmentHash(col, row, revealNonce)

      try {
        await commitAttack(gameId, attackHash)
        await revealAttack(gameId, col, row, revealNonce)

        toast({
          title: "Attack Committed",
          description: `Strike at ${coord} submitted as commit/reveal. Awaiting defender proof...`,
        })

        setIsPlayerTurn(false)
        setIsAwaitingTurnHandoff(true)
        setPendingCell(null)
      } catch (err) {
        logEvent("error", {
          code: ERROR_CODES.ATTACK_REVEAL_FAILED,
          message: "Attack commit/reveal failed.",
          metadata: { gameId, x: col, y: row, error: err instanceof Error ? err.message : err },
        })

        const reverted = targetGrid.map((r) => r.map((c) => ({ ...c })))
        reverted[row][col] = { state: "empty" }
        setTargetGrid(reverted)
        setPendingCell(null)
        setIsAwaitingTurnHandoff(false)
        if (gameState) setIsPlayerTurn(gameState.isMyTurn)

        toast({
          title: "Attack Failed",
          description: err instanceof Error ? err.message : "Transaction failed.",
          variant: "destructive",
        })
      }
    },
    [
      canFire,
      gameOver,
      targetGrid,
      gameId,
      commitAttack,
      revealAttack,
      toast,
      gameState,
    ]
  )

  const applyRevealedAttack = useCallback(
    (revealId: string, x: number, y: number, isHit: boolean) => {
      if (processedPlayerRevealRef.current.has(revealId)) return
      processedPlayerRevealRef.current.add(revealId)

      setTargetGrid((prev) => {
        const updated = prev.map((r) => r.map((c) => ({ ...c })))
        if (updated[y] && updated[y][x]) {
          updated[y][x] = { state: isHit ? "hit" : "miss" }
        }
        return updated
      })

      addLogEntry("player", getCoordinateLabel(y, x), isHit ? "hit" : "miss")
    },
    [addLogEntry]
  )

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

      addLogEntry("enemy", getCoordinateLabel(y, x), isHit ? "hit" : "miss")
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
