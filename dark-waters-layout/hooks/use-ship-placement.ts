"use client"

import { useState, useCallback, useMemo } from "react"
import {
  type Ship,
  type Orientation,
  type PlacedShip,
  type CellState,
  GRID_SIZE,
  SHIPS,
} from "@/components/placement/types"

function createEmptyGrid(): CellState[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ shipId: null }))
  )
}

export function useShipPlacement() {
  const [ships, setShips] = useState<Ship[]>(
    SHIPS.map((s) => ({ ...s, placed: false }))
  )
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>([])
  const [grid, setGrid] = useState<CellState[][]>(createEmptyGrid)
  const [selectedShipId, setSelectedShipId] = useState<string | null>(
    SHIPS[0].id
  )
  const [orientation, setOrientation] = useState<Orientation>("horizontal")
  const [hoverCell, setHoverCell] = useState<{
    row: number
    col: number
  } | null>(null)

  const selectedShip = useMemo(
    () => ships.find((s) => s.id === selectedShipId && !s.placed) ?? null,
    [ships, selectedShipId]
  )

  const getPreviewCells = useCallback(
    (row: number, col: number) => {
      if (!selectedShip) return []
      const cells: { row: number; col: number }[] = []
      for (let i = 0; i < selectedShip.size; i++) {
        const r = orientation === "vertical" ? row + i : row
        const c = orientation === "horizontal" ? col + i : col
        cells.push({ row: r, col: c })
      }
      return cells
    },
    [selectedShip, orientation]
  )

  const isValidPlacement = useCallback(
    (row: number, col: number) => {
      if (!selectedShip) return false
      const cells = getPreviewCells(row, col)
      return cells.every(
        (c) =>
          c.row >= 0 &&
          c.row < GRID_SIZE &&
          c.col >= 0 &&
          c.col < GRID_SIZE &&
          grid[c.row][c.col].shipId === null
      )
    },
    [selectedShip, getPreviewCells, grid]
  )

  const previewState = useMemo(() => {
    if (!hoverCell || !selectedShip) return { cells: [], valid: false }
    const cells = getPreviewCells(hoverCell.row, hoverCell.col)
    const valid = isValidPlacement(hoverCell.row, hoverCell.col)
    return { cells, valid }
  }, [hoverCell, selectedShip, getPreviewCells, isValidPlacement])

  const placeShip = useCallback(
    (row: number, col: number) => {
      if (!selectedShip || !isValidPlacement(row, col)) return

      const cells = getPreviewCells(row, col)
      const newGrid = grid.map((r) => r.map((c) => ({ ...c })))
      for (const cell of cells) {
        newGrid[cell.row][cell.col].shipId = selectedShip.id
      }
      setGrid(newGrid)

      setPlacedShips((prev) => [
        ...prev,
        { shipId: selectedShip.id, row, col, orientation },
      ])

      setShips((prev) =>
        prev.map((s) => (s.id === selectedShip.id ? { ...s, placed: true } : s))
      )

      // Auto-select next unplaced ship
      const nextShip = ships.find(
        (s) => !s.placed && s.id !== selectedShip.id
      )
      setSelectedShipId(nextShip?.id ?? null)
      setHoverCell(null)
    },
    [selectedShip, isValidPlacement, getPreviewCells, grid, orientation, ships]
  )

  const resetBoard = useCallback(() => {
    setGrid(createEmptyGrid())
    setPlacedShips([])
    setShips(SHIPS.map((s) => ({ ...s, placed: false })))
    setSelectedShipId(SHIPS[0].id)
    setOrientation("horizontal")
    setHoverCell(null)
  }, [])

  const toggleOrientation = useCallback(() => {
    setOrientation((prev) =>
      prev === "horizontal" ? "vertical" : "horizontal"
    )
  }, [])

  const selectShip = useCallback(
    (shipId: string) => {
      const ship = ships.find((s) => s.id === shipId)
      if (ship && !ship.placed) {
        setSelectedShipId(shipId)
      }
    },
    [ships]
  )

  const allPlaced = ships.every((s) => s.placed)

  const instructionText = useMemo(() => {
    if (allPlaced) return "All ships deployed. Ready for battle!"
    if (!selectedShip) return "Select a ship to place."

    const placedCount = ships.filter((s) => s.placed).length
    const prefix =
      placedCount === 0
        ? "Select your"
        : placedCount === ships.length - 1
          ? "Last one! Place your"
          : "Great! Now place your"

    return `${prefix} ${selectedShip.name} (${selectedShip.size} cells)`
  }, [allPlaced, selectedShip, ships])

  return {
    ships,
    grid,
    selectedShip,
    selectedShipId,
    orientation,
    hoverCell,
    previewState,
    allPlaced,
    instructionText,
    placedShips,
    setHoverCell,
    placeShip,
    resetBoard,
    toggleOrientation,
    selectShip,
  }
}
