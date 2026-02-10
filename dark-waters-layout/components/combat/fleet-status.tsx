"use client"

import { cn } from "@/lib/utils"
import type { ShipHealth } from "./types"

interface FleetStatusProps {
  ships: ShipHealth[]
  label: string
}

export function FleetStatus({ ships, label }: FleetStatusProps) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      <div className="flex flex-col gap-1.5">
        {ships.map((ship) => (
          <div key={ship.id} className="flex items-center gap-2">
            <span
              className={cn(
                "w-20 truncate text-xs font-medium",
                ship.sunk ? "text-muted-foreground line-through" : "text-foreground"
              )}
            >
              {ship.name}
            </span>
            <div className="flex gap-0.5">
              {Array.from({ length: ship.size }, (_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-2 w-4 rounded-sm transition-colors",
                    i < ship.hits
                      ? "bg-destructive/70"
                      : ship.sunk
                        ? "bg-muted-foreground/20"
                        : "bg-primary/40"
                  )}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
