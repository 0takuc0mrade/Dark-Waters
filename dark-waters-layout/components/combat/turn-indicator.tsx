"use client"

import { Shield, AlertTriangle, Trophy, Skull } from "lucide-react"
import { cn } from "@/lib/utils"

interface TurnIndicatorProps {
  isPlayerTurn: boolean
  gameOver: "win" | "lose" | null
}

export function TurnIndicator({ isPlayerTurn, gameOver }: TurnIndicatorProps) {
  if (gameOver) {
    const isWin = gameOver === "win"
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-3 rounded-lg border px-4 py-3 font-mono text-sm font-bold tracking-widest uppercase transition-colors",
          isWin
            ? "border-accent/40 bg-accent/15 text-accent"
            : "border-destructive/40 bg-destructive/15 text-destructive"
        )}
        role="status"
        aria-live="assertive"
      >
        {isWin ? (
          <Trophy className="h-5 w-5" />
        ) : (
          <Skull className="h-5 w-5" />
        )}
        <span>{isWin ? "VICTORY: ALL ENEMY VESSELS DESTROYED" : "DEFEAT: YOUR FLEET HAS BEEN SUNK"}</span>
        {isWin ? (
          <Trophy className="h-5 w-5" />
        ) : (
          <Skull className="h-5 w-5" />
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 rounded-lg border px-4 py-3 font-mono text-sm font-bold tracking-widest uppercase transition-colors",
        isPlayerTurn
          ? "border-accent/40 bg-accent/15 text-accent"
          : "animate-scanner border-destructive/40 bg-destructive/10 text-destructive"
      )}
      role="status"
      aria-live="polite"
    >
      {isPlayerTurn ? (
        <>
          <Shield className="h-5 w-5" />
          <span>Command Authorized: Select Target</span>
          <Shield className="h-5 w-5" />
        </>
      ) : (
        <>
          <AlertTriangle className="h-5 w-5 animate-pulse" />
          <span>Warning: Enemy Scanning...</span>
          <AlertTriangle className="h-5 w-5 animate-pulse" />
        </>
      )}
    </div>
  )
}
