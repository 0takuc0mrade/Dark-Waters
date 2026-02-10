"use client"

import {
  Check,
  RotateCw,
  Trash2,
  Anchor,
  ArrowRight,
  Info,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import type { Ship, Orientation } from "./types"

interface ShipControlsProps {
  ships: Ship[]
  selectedShipId: string | null
  orientation: Orientation
  allPlaced: boolean
  instructionText: string
  onSelectShip: (id: string) => void
  onToggleOrientation: () => void
  onReset: () => void
  onConfirm: () => void
}

export function ShipControls({
  ships,
  selectedShipId,
  orientation,
  allPlaced,
  instructionText,
  onSelectShip,
  onToggleOrientation,
  onReset,
  onConfirm,
}: ShipControlsProps) {
  return (
    <TooltipProvider>
      <div className="flex w-full flex-col gap-4 lg:w-72 xl:w-80">
        {/* Instruction text */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm font-medium leading-relaxed text-foreground">
              {instructionText}
            </p>
          </CardContent>
        </Card>

        {/* Ship list */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Anchor className="h-4 w-4 text-primary" />
              Fleet Roster
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0">
            {ships.map((ship) => {
              const isSelected = selectedShipId === ship.id && !ship.placed
              return (
                <button
                  key={ship.id}
                  type="button"
                  onClick={() => onSelectShip(ship.id)}
                  disabled={ship.placed}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all",
                    ship.placed
                      ? "cursor-default border-border/50 bg-secondary/20 opacity-60"
                      : isSelected
                        ? "border-primary/50 bg-primary/10 shadow-[0_0_12px_hsl(187_70%_48%/0.1)]"
                        : "border-border bg-secondary/30 hover:border-primary/30 hover:bg-secondary/50"
                  )}
                  aria-label={`${ship.name}, ${ship.size} cells${ship.placed ? ", placed" : ""}`}
                >
                  {/* Ship size visualization */}
                  <div className="flex gap-0.5">
                    {Array.from({ length: ship.size }, (_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-3 w-3 rounded-sm border transition-colors",
                          ship.placed
                            ? "border-muted-foreground/30 bg-muted-foreground/20"
                            : isSelected
                              ? "border-primary/60 bg-primary/30"
                              : "border-border bg-secondary/50"
                        )}
                      />
                    ))}
                  </div>

                  {/* Ship info */}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        ship.placed
                          ? "text-muted-foreground"
                          : "text-foreground"
                      )}
                    >
                      {ship.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {ship.size} cells
                    </span>
                  </div>

                  {/* Status */}
                  {ship.placed ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15">
                      <Check className="h-3.5 w-3.5 text-accent" />
                    </div>
                  ) : isSelected ? (
                    <ArrowRight className="h-4 w-4 text-primary" />
                  ) : null}
                </button>
              )
            })}
          </CardContent>
        </Card>

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                className="w-full gap-2"
                onClick={onToggleOrientation}
                disabled={allPlaced}
              >
                <RotateCw className="h-4 w-4" />
                Rotate
                <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  {orientation === "horizontal" ? "H" : "V"}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Toggle between horizontal and vertical placement (currently{" "}
              {orientation})
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="w-full gap-2 text-muted-foreground hover:text-destructive bg-transparent"
                onClick={onReset}
              >
                <Trash2 className="h-4 w-4" />
                Clear Board
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove all ships and start over</TooltipContent>
          </Tooltip>

          {allPlaced && (
            <Button
              className="mt-2 w-full gap-2 animate-pulse-glow"
              size="lg"
              onClick={onConfirm}
            >
              <Anchor className="h-4 w-4" />
              Confirm Deployment
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
