"use client"

import { useCallback } from "react"
import { Flame, Droplets, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { GRID_SIZE, ROW_LABELS, type CombatCell } from "./types"

const COL_LABELS = Array.from({ length: GRID_SIZE }, (_, i) => String(i + 1))

interface CombatGridProps {
  grid: CombatCell[][]
  label: string
  isInteractive: boolean
  locked: boolean
  showShips: boolean
  onCellClick?: (row: number, col: number) => void
}

export function CombatGrid({
  grid,
  label,
  isInteractive,
  locked,
  showShips,
  onCellClick,
}: CombatGridProps) {
  const handleClick = useCallback(
    (row: number, col: number) => {
      if (!isInteractive || locked) return
      const cell = grid[row]?.[col]
      if (!cell) return
      if (cell.state !== "empty") return
      onCellClick?.(row, col)
    },
    [isInteractive, locked, grid, onCellClick]
  )

  const renderCellContent = useCallback((cell: CombatCell) => {
    switch (cell.state) {
      case "hit":
        return (
          <div className="animate-explosion flex items-center justify-center">
            <Flame className="h-4 w-4 text-destructive drop-shadow-[0_0_6px_hsl(0_72%_50%/0.6)] md:h-5 md:w-5" />
          </div>
        )
      case "miss":
        return (
          <div className="relative flex items-center justify-center">
            <Droplets className="h-4 w-4 text-primary/60 md:h-5 md:w-5" />
            <div className="absolute inset-0 animate-ripple rounded-full border border-primary/20" />
          </div>
        )
      case "pending":
        return (
          <div className="flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-foreground/70 md:h-5 md:w-5" />
          </div>
        )
      case "ship":
        return null
      default:
        return null
    }
  }, [])

  return (
    <div className="flex flex-col">
      {/* Grid label */}
      <div className="mb-2 flex items-center gap-2">
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            label === "Your Fleet" ? "bg-primary" : "bg-destructive"
          )}
        />
        <h2 className="text-xs font-semibold tracking-wide text-foreground uppercase">
          {label}
        </h2>
      </div>

      {/* Grid container */}
      <div
        className={cn(
          "rounded-lg border bg-card p-2 shadow-sm transition-opacity md:p-3",
          locked && "opacity-60"
        )}
      >
        {/* Column headers */}
        <div className="mb-px flex">
          <div className="h-5 w-5 shrink-0 md:h-6 md:w-6" />
          {COL_LABELS.map((col) => (
            <div
              key={col}
              className="flex h-5 w-7 shrink-0 items-center justify-center text-[10px] font-medium text-muted-foreground md:w-8 lg:w-9"
            >
              {col}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        <div className="flex flex-col gap-px">
          {Array.from({ length: GRID_SIZE }, (_, row) => (
            <div key={row} className="flex items-center gap-px">
              {/* Row label */}
              <div className="flex h-7 w-5 shrink-0 items-center justify-center text-[10px] font-medium text-muted-foreground md:h-8 md:w-6 lg:h-9">
                {ROW_LABELS[row]}
              </div>

              {/* Cells */}
              {Array.from({ length: GRID_SIZE }, (_, col) => {
                const cell = grid[row]?.[col] ?? { state: "empty" as const }
                const isClickable =
                  isInteractive && !locked && cell.state === "empty"

                return (
                  <button
                    key={col}
                    type="button"
                    disabled={!isClickable}
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border transition-all duration-150 md:h-8 md:w-8 lg:h-9 lg:w-9",
                      cell.state === "empty" && isClickable &&
                        "cursor-crosshair border-border/60 bg-secondary/20 hover:border-primary/50 hover:bg-primary/10",
                      cell.state === "empty" && !isClickable &&
                        "cursor-default border-border/40 bg-secondary/20",
                      cell.state === "ship" && showShips &&
                        "border-primary/30 bg-primary/15",
                      cell.state === "ship" && !showShips &&
                        "border-border/40 bg-secondary/20",
                      cell.state === "hit" &&
                        "border-destructive/40 bg-destructive/10",
                      cell.state === "miss" &&
                        "border-primary/20 bg-primary/5",
                      cell.state === "pending" &&
                        "border-foreground/30 bg-foreground/5",
                      locked && "pointer-events-none"
                    )}
                    onClick={() => handleClick(row, col)}
                    aria-label={`${ROW_LABELS[row]}${col + 1}: ${
                      cell.state === "hit"
                        ? "Hit"
                        : cell.state === "miss"
                          ? "Miss"
                          : cell.state === "pending"
                            ? "Awaiting confirmation"
                            : cell.state === "ship" && showShips
                              ? "Your ship"
                              : "Unknown"
                    }`}
                  >
                    {renderCellContent(cell)}
                    {cell.state === "ship" && showShips && (
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/50 md:h-2 md:w-2" />
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Grid locked overlay text */}
      {locked && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Grid locked during enemy turn
        </p>
      )}
    </div>
  )
}
