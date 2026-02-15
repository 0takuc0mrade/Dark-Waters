"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { useShipPlacement } from "@/hooks/use-ship-placement"
import { useGameActions } from "@/src/hooks/useGameActions"
import { useToast } from "@/hooks/use-toast"
import { useWallet } from "@/components/wallet-provider"
import { BoardMerkle, type Ship as MerkleShip } from "@/src/utils/merkle"
import { PlacementGrid } from "./placement-grid"
import { ShipControls } from "./ship-controls"

// ── localStorage keys ────────────────────────────────────────────────

const LS_GAME_ID = "dark-waters-gameId"
const LS_BOARD = "dark-waters-board"
const LS_SALT = "dark-waters-salt"

function getBoardKey(gameId: number, address: string): string {
  return `${LS_BOARD}:${gameId}:${address.toLowerCase()}`
}

function getSaltKey(gameId: number, address: string): string {
  return `${LS_SALT}:${gameId}:${address.toLowerCase()}`
}

export function ShipPlacement() {
  const router = useRouter()

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

  const { commitBoard } = useGameActions()
  const { toast } = useToast()
  const { address } = useWallet()
  const [isCommitting, setIsCommitting] = useState(false)

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

  // ── Confirm & Commit Board On-Chain ────────────────────────────────

  const handleConfirm = useCallback(async () => {
    const gameIdStr = typeof window !== "undefined" ? localStorage.getItem(LS_GAME_ID) : null
    if (!gameIdStr) {
      toast({
        title: "No Game Found",
        description: "Create a game from the lobby first.",
        variant: "destructive",
      })
      return
    }

    const gameId = Number(gameIdStr)

    // Build the 10×10 board array for the Merkle tree
    // grid[row][col] where row = y, col = x
    const board: MerkleShip[] = []
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const cell = grid[y][x]
        board.push({
          x,
          y,
          is_ship: cell.shipId !== null,
        })
      }
    }

    // Generate a random salt
    const saltBytes = new Uint8Array(16)
    crypto.getRandomValues(saltBytes)
    const saltHex =
      "0x" +
      Array.from(saltBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")

    // Build Merkle tree
    const merkle = new BoardMerkle(board, saltHex)
    const root = merkle.getRoot()
    const rootHex = "0x" + root.toString(16)

    // Save to localStorage BEFORE submitting tx (so auto-reveal works)
    localStorage.setItem(LS_BOARD, JSON.stringify(board))
    localStorage.setItem(LS_SALT, saltHex)
    if (address) {
      localStorage.setItem(getBoardKey(gameId, address), JSON.stringify(board))
      localStorage.setItem(getSaltKey(gameId, address), saltHex)
    }

    setIsCommitting(true)
    toast({
      title: "Committing Board…",
      description: "Encrypting your fleet positions on-chain.",
    })

    try {
      const result = await commitBoard(gameId, rootHex)
      if (result) {
        toast({
          title: "Board Committed!",
          description: "Fleet positions secured on-chain. Preparing for battle…",
        })

        // Navigate to home to let the main logic handle phase routing
        setTimeout(() => {
          router.push("/")
        }, 1500)
      }
    } catch (err) {
      console.error("Board commit failed:", err)
      toast({
        title: "Commit Failed",
        description: err instanceof Error ? err.message : "Transaction failed.",
        variant: "destructive",
      })
    } finally {
      setIsCommitting(false)
    }
  }, [grid, commitBoard, toast, router, address])

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

      {/* Committing overlay */}
      {isCommitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm font-medium text-foreground">
              Encrypting fleet positions…
            </p>
            <p className="text-xs text-muted-foreground">
              Submitting Merkle root on-chain
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
