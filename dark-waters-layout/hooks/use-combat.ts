"use client"

import React from "react"

import { useState, useCallback, useRef } from "react"
import type {
  CombatCell,
  BattleLogEntry,
  ShipHealth,
} from "@/components/combat/types"
import { GRID_SIZE } from "@/components/combat/types"

function createEmptyGrid(): CombatCell[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ state: "empty" as const }))
  )
}

function createPlayerFleetGrid(): CombatCell[][] {
  const grid = createEmptyGrid()
  // Pre-placed fleet for demo
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

// Hidden enemy ship positions (unknown to player)
const ENEMY_SHIP_CELLS: Record<string, [number, number][]> = {
  "e-carrier": [[1,0],[1,1],[1,2],[1,3],[1,4]],
  "e-battleship": [[3,6],[4,6],[5,6],[6,6]],
  "e-cruiser": [[6,1],[6,2],[6,3]],
  "e-submarine": [[8,4],[8,5],[8,6]],
  "e-destroyer": [[9,8],[9,9]],
}

function getCoordinateLabel(row: number, col: number): string {
  return `${String.fromCharCode(65 + row)}${col + 1}`
}

export function useCombat() {
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

  const checkSunk = useCallback(
    (
      shipId: string,
      ships: ShipHealth[],
      setShips: React.Dispatch<React.SetStateAction<ShipHealth[]>>
    ): boolean => {
      const ship = ships.find((s) => s.id === shipId)
      if (!ship) return false
      const newHits = ship.hits + 1
      const isSunk = newHits >= ship.size
      setShips((prev) =>
        prev.map((s) =>
          s.id === shipId ? { ...s, hits: newHits, sunk: isSunk } : s
        )
      )
      return isSunk
    },
    []
  )

  // Resolve the attack after the transaction modal succeeds
  const resolveAttack = useCallback(
    (row: number, col: number) => {
      const newTargetGrid = targetGrid.map((r) => r.map((c) => ({ ...c })))
      const coord = getCoordinateLabel(row, col)
      let hitShipId: string | null = null

      for (const [shipId, cells] of Object.entries(ENEMY_SHIP_CELLS)) {
        if (cells.some(([r, c]) => r === row && c === col)) {
          hitShipId = shipId
          break
        }
      }

      const isHit = hitShipId !== null
      newTargetGrid[row][col] = {
        state: isHit ? "hit" : "miss",
        shipId: hitShipId ?? undefined,
      }
      setTargetGrid(newTargetGrid)
      setPendingCell(null)

      let result: "hit" | "miss" | "sunk" = isHit ? "hit" : "miss"
      if (isHit && hitShipId) {
        const wasSunk = checkSunk(hitShipId, enemyShips, setEnemyShips)
        if (wasSunk) result = "sunk"
      }
      addLogEntry("player", coord, result)

      const updatedEnemyShips = enemyShips.map((s) => {
        if (s.id === hitShipId)
          return { ...s, hits: s.hits + 1, sunk: s.hits + 1 >= s.size }
        return s
      })
      if (updatedEnemyShips.every((s) => s.sunk)) {
        setGameOver("win")
        return
      }

      setIsPlayerTurn(false)

      setTimeout(() => {
        const eRow = Math.floor(Math.random() * GRID_SIZE)
        const eCol = Math.floor(Math.random() * GRID_SIZE)
        const eCoord = getCoordinateLabel(eRow, eCol)
        const playerCell = playerGrid[eRow][eCol]

        const newPlayerGrid = playerGrid.map((r) => r.map((c) => ({ ...c })))
        if (playerCell.state === "ship") {
          newPlayerGrid[eRow][eCol] = {
            state: "hit",
            shipId: playerCell.shipId,
          }
          let eResult: "hit" | "miss" | "sunk" = "hit"
          if (playerCell.shipId) {
            const wasSunk = checkSunk(
              playerCell.shipId,
              playerShips,
              setPlayerShips
            )
            if (wasSunk) eResult = "sunk"
          }
          addLogEntry("enemy", eCoord, eResult)

          const updatedPlayerShips = playerShips.map((s) => {
            if (s.id === playerCell.shipId)
              return { ...s, hits: s.hits + 1, sunk: s.hits + 1 >= s.size }
            return s
          })
          if (updatedPlayerShips.every((s) => s.sunk)) {
            setGameOver("lose")
            setPlayerGrid(newPlayerGrid)
            return
          }
        } else if (playerCell.state === "empty") {
          newPlayerGrid[eRow][eCol] = { state: "miss" }
          addLogEntry("enemy", eCoord, "miss")
        } else {
          addLogEntry("enemy", eCoord, "miss")
        }

        setPlayerGrid(newPlayerGrid)
        setIsPlayerTurn(true)
      }, 1800)
    },
    [
      targetGrid,
      playerGrid,
      enemyShips,
      playerShips,
      addLogEntry,
      checkSunk,
    ]
  )

  // Opens the transaction modal and sets up pending state on the grid
  const fireAtTarget = useCallback(
    (row: number, col: number) => {
      if (!isPlayerTurn || gameOver) return
      const cell = targetGrid[row][col]
      if (cell.state !== "empty") return

      setPendingCell({ row, col })
      const newTargetGrid = targetGrid.map((r) => r.map((c) => ({ ...c })))
      newTargetGrid[row][col] = { state: "pending" }
      setTargetGrid(newTargetGrid)

      const coord = getCoordinateLabel(row, col)

      setTxModal({
        open: true,
        coordinate: coord,
        onResolve: () => resolveAttack(row, col),
      })
    },
    [isPlayerTurn, gameOver, targetGrid, resolveAttack]
  )

  // Close the transaction modal (cancel)
  const closeTxModal = useCallback(() => {
    // If cancelled during processing, revert the pending cell
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
  }
}
