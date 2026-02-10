"use client"

import { useCallback, useMemo } from "react"
import { cn } from "@/lib/utils"
import { GRID_SIZE, ROW_LABELS, type CellState } from "./types"

const COL_LABELS = Array.from({ length: GRID_SIZE }, (_, i) =>
  String(i + 1)
)

// Ship color map for placed ships
const SHIP_COLORS: Record<string, string> = {
  carrier: "bg-primary/30 border-primary/50",
  battleship: "bg-primary/25 border-primary/40",
  cruiser: "bg-primary/20 border-primary/35",
  submarine: "bg-primary/22 border-primary/38",
  destroyer: "bg-primary/18 border-primary/30",
}

interface PlacementGridProps {
  grid: CellState[][]
  previewCells: { row: number; col: number }[]
  previewValid: boolean
  hasSelectedShip: boolean
  onCellHover: (row: number, col: number) => void
  onCellLeave: () => void
  onCellClick: (row: number, col: number) => void
}

export function PlacementGrid({
  grid,
  previewCells,
  previewValid,
  hasSelectedShip,
  onCellHover,
  onCellLeave,
  onCellClick,
}: PlacementGridProps) {
  const previewSet = useMemo(() => {
    const set = new Set<string>()
    for (const c of previewCells) {
      set.add(`${c.row}-${c.col}`)
    }
    return set
  }, [previewCells])

  const getCellClass = useCallback(
    (row: number, col: number) => {
      const key = `${row}-${col}`
      const cellData = grid[row]?.[col]
      const isPreview = previewSet.has(key)
      const isOccupied = cellData?.shipId !== null

      if (isPreview) {
        if (previewValid) {
          return "bg-accent/25 border-accent/60 shadow-[inset_0_0_8px_hsl(150_60%_44%/0.15)]"
        }
        return "bg-destructive/20 border-destructive/50 shadow-[inset_0_0_8px_hsl(0_72%_50%/0.15)]"
      }

      if (isOccupied && cellData?.shipId) {
        return SHIP_COLORS[cellData.shipId] ?? "bg-primary/20 border-primary/30"
      }

      return "bg-secondary/30 border-border/60 hover:bg-secondary/50"
    },
    [grid, previewSet, previewValid]
  )

  const handlePointerEnter = useCallback(
    (row: number, col: number) => {
      if (hasSelectedShip) onCellHover(row, col)
    },
    [hasSelectedShip, onCellHover]
  )

  return (
    <div className="flex flex-col items-center">
      {/* Column headers */}
      <div className="mb-1 flex">
        <div className="h-6 w-6 shrink-0 md:h-7 md:w-7" />
        {COL_LABELS.map((label) => (
          <div
            key={label}
            className="flex h-6 w-8 shrink-0 items-center justify-center text-xs font-medium text-muted-foreground md:w-10 lg:w-11"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Grid rows */}
      <div className="flex flex-col gap-px">
        {Array.from({ length: GRID_SIZE }, (_, row) => (
          <div key={row} className="flex items-center gap-px">
            {/* Row label */}
            <div className="flex h-8 w-6 shrink-0 items-center justify-center text-xs font-medium text-muted-foreground md:h-10 md:w-7 lg:h-11">
              {ROW_LABELS[row]}
            </div>

            {/* Cells */}
            {Array.from({ length: GRID_SIZE }, (_, col) => {
              const cellShipId = grid[row]?.[col]?.shipId
              const isPreview = previewSet.has(`${row}-${col}`)

              return (
                <button
                  key={col}
                  type="button"
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border transition-all duration-100 md:h-10 md:w-10 lg:h-11 lg:w-11",
                    getCellClass(row, col),
                    hasSelectedShip && "cursor-crosshair",
                    !hasSelectedShip && !cellShipId && "cursor-default"
                  )}
                  onPointerEnter={() => handlePointerEnter(row, col)}
                  onPointerLeave={onCellLeave}
                  onClick={() => onCellClick(row, col)}
                  aria-label={`Cell ${ROW_LABELS[row]}${col + 1}${
                    cellShipId ? `, occupied by ${cellShipId}` : ""
                  }${isPreview ? ", preview" : ""}`}
                >
                  {cellShipId && !isPreview && (
                    <div className="h-2 w-2 rounded-full bg-primary/70 md:h-2.5 md:w-2.5" />
                  )}
                  {isPreview && (
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full md:h-2.5 md:w-2.5",
                        previewValid ? "bg-accent/80" : "bg-destructive/80"
                      )}
                    />
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
