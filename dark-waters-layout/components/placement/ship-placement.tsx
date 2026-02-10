"use client"

import { useCallback } from "react"
import { useShipPlacement } from "@/hooks/use-ship-placement"
import { useToast } from "@/hooks/use-toast"
import { PlacementGrid } from "./placement-grid"
import { ShipControls } from "./ship-controls"

export function ShipPlacement() {
  const {
    ships,
    grid,
    selectedShip,
    selectedShipId,
    orientation,
    previewState,
    allPlaced,
    instructionText,
    setHoverCell,
    placeShip,
    resetBoard,
    toggleOrientation,
    selectShip,
  } = useShipPlacement()

  const { toast } = useToast()

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (!selectedShip) return
      if (!previewState.valid) {
        toast({
          title: "Invalid Placement",
          description:
            "Ship overlaps another vessel or extends beyond the grid.",
          variant: "destructive",
        })
        return
      }
      placeShip(row, col)
      toast({
        title: `${selectedShip.name} Deployed`,
        description: `Positioned at sector ${String.fromCharCode(65 + row)}${col + 1}.`,
      })
    },
    [selectedShip, previewState.valid, placeShip, toast]
  )

  const handleCellHover = useCallback(
    (row: number, col: number) => {
      setHoverCell({ row, col })
    },
    [setHoverCell]
  )

  const handleCellLeave = useCallback(() => {
    setHoverCell(null)
  }, [setHoverCell])

  const handleReset = useCallback(() => {
    resetBoard()
    toast({
      title: "Board Cleared",
      description: "All ships have been recalled to port.",
    })
  }, [resetBoard, toast])

  const handleConfirm = useCallback(() => {
    toast({
      title: "Fleet Deployed",
      description: "All vessels in position. Awaiting enemy contact...",
    })
  }, [toast])

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6 lg:py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Deploy Your Fleet
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Position your ships on the grid. Click to place, rotate to change
          orientation.
        </p>
      </div>

      {/* Main layout: grid + controls */}
      <div className="flex flex-col items-start gap-6 lg:flex-row lg:gap-8">
        {/* Grid area */}
        <div className="flex-1">
          <div className="rounded-lg border border-border bg-card p-3 shadow-sm md:p-4">
            <PlacementGrid
              grid={grid}
              previewCells={previewState.cells}
              previewValid={previewState.valid}
              hasSelectedShip={selectedShip !== null}
              onCellHover={handleCellHover}
              onCellLeave={handleCellLeave}
              onCellClick={handleCellClick}
            />
          </div>

          {/* Mobile orientation shortcut */}
          <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted-foreground lg:hidden">
            <kbd className="rounded border border-border bg-secondary px-2 py-1 font-mono text-xs">
              Tap
            </kbd>
            <span>to place ship</span>
          </div>
        </div>

        {/* Controls panel */}
        <ShipControls
          ships={ships}
          selectedShipId={selectedShipId}
          orientation={orientation}
          allPlaced={allPlaced}
          instructionText={instructionText}
          onSelectShip={selectShip}
          onToggleOrientation={toggleOrientation}
          onReset={handleReset}
          onConfirm={handleConfirm}
        />
      </div>
    </div>
  )
}
