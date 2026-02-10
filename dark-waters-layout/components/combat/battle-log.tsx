"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { BattleLogEntry } from "./types"
import { Flame, Droplets, Anchor } from "lucide-react"

interface BattleLogProps {
  entries: BattleLogEntry[]
}

export function BattleLog({ entries }: BattleLogProps) {
  return (
    <div className="flex flex-col rounded-lg border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Anchor className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-semibold tracking-wide text-foreground uppercase">
          Battle Log
        </h2>
        {entries.length > 0 && (
          <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
            {entries.length}
          </span>
        )}
      </div>

      <ScrollArea className="h-56 lg:h-72">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 py-10">
            <p className="text-xs text-muted-foreground">
              No activity yet. Fire at the target sector to begin.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {entries.map((entry, index) => (
              <div
                key={entry.id}
                className={cn(
                  "animate-slide-up-fade flex gap-2",
                  entry.type === "player" ? "justify-start" : "justify-end"
                )}
                style={{ animationDelay: index === 0 ? "0ms" : "0ms" }}
              >
                <div
                  className={cn(
                    "flex max-w-[85%] items-start gap-2 rounded-lg px-3 py-2",
                    entry.type === "player"
                      ? "rounded-tl-none bg-secondary/60"
                      : "rounded-tr-none bg-destructive/10"
                  )}
                >
                  {/* Icon */}
                  <div className="mt-0.5 shrink-0">
                    {entry.result === "miss" ? (
                      <Droplets className="h-3.5 w-3.5 text-primary/50" />
                    ) : (
                      <Flame
                        className={cn(
                          "h-3.5 w-3.5",
                          entry.result === "sunk"
                            ? "text-amber-400"
                            : "text-destructive"
                        )}
                      />
                    )}
                  </div>

                  {/* Message */}
                  <div className="flex flex-col gap-0.5">
                    <p
                      className={cn(
                        "text-xs leading-relaxed",
                        entry.type === "player"
                          ? "text-foreground"
                          : "text-destructive-foreground"
                      )}
                    >
                      {entry.message}
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
