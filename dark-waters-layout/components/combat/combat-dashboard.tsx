"use client"

import { useEffect, useState } from "react"
import { useCombat } from "@/hooks/use-combat"
import { useAttackListener } from "@/hooks/use-attack-listener"
import { TurnIndicator } from "./turn-indicator"
import { CombatGrid } from "./combat-grid"
import { BattleLog } from "./battle-log"
import { FleetStatus } from "./fleet-status"
import { ERROR_CODES } from "@/src/utils/logger"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function CombatDashboard() {
  const {
    isPlayerTurn,
    playerGrid,
    targetGrid,
    battleLog,
    playerShips,
    enemyShips,
    gameOver,
    fireAtTarget,
    gameId,
    applyRevealedAttack,
    applyIncomingAttack,
  } = useCombat()
  const [recoveryPackage, setRecoveryPackage] = useState("")

  // ── Event listener for auto-reveal + grid updates ──────────────────

  const {
    myRevealedAttacks,
    enemyRevealedAttacks,
    isRevealing,
    lastError,
    syncHealth,
    restoreSecrets,
  } = useAttackListener({
    enabled: gameId !== null,
    gameId,
    pollInterval: 4000,
  })

  // Apply MY attack reveals to the target grid (attacks I made, now revealed)
  useEffect(() => {
    for (const revealed of myRevealedAttacks) {
      applyRevealedAttack(revealed.id, revealed.x, revealed.y, revealed.isHit)
    }
  }, [myRevealedAttacks, applyRevealedAttack])

  // Apply ENEMY attack reveals to the player grid (attacks against me, now revealed)
  useEffect(() => {
    for (const revealed of enemyRevealedAttacks) {
      applyIncomingAttack(revealed.id, revealed.x, revealed.y, revealed.isHit)
    }
  }, [enemyRevealedAttacks, applyIncomingAttack])

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 lg:px-6 lg:py-6">
      {/* Turn Indicator */}
      <TurnIndicator isPlayerTurn={isPlayerTurn} gameOver={gameOver} />

      {/* Auto-reveal status */}
      {isRevealing && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-primary">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Auto-revealing incoming attack…
        </div>
      )}

      {lastError === ERROR_CODES.SECRET_LOCKED && (
        <div className="mx-auto mt-3 max-w-3xl rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-amber-300">Secrets Locked</p>
          <p className="mt-1 text-xs text-amber-100/80">
            Paste your recovery package to restore encrypted board secrets and resume auto-reveal.
          </p>
          <Textarea
            value={recoveryPackage}
            onChange={(event) => setRecoveryPackage(event.target.value)}
            placeholder='{"version":1,"gameId":...}'
            className="mt-2 min-h-24 font-mono text-[11px]"
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                if (!recoveryPackage.trim()) return
                const restored = restoreSecrets(recoveryPackage)
                if (restored) setRecoveryPackage("")
              }}
            >
              Restore Secrets
            </Button>
          </div>
        </div>
      )}

      {/* Game ID badge */}
      {gameId && (
        <div className="mt-2 flex flex-col items-center gap-1">
          <span className="rounded-full border border-border bg-secondary/50 px-3 py-0.5 text-[10px] font-medium text-muted-foreground">
            Game #{gameId}
          </span>
          <span className="text-[10px] text-muted-foreground">
            Sync block {syncHealth.cursorBlock} • processed {syncHealth.processedEvents} • errors{" "}
            {syncHealth.pollErrors}
          </span>
        </div>
      )}

      {/* Main content area */}
      <div className="mt-4 flex flex-col gap-4 lg:mt-6 lg:flex-row lg:gap-6">
        {/* Left column: Grids */}
        <div className="flex-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-4 lg:gap-6">
            {/* Player's fleet grid */}
            <div className="flex-1">
              <CombatGrid
                grid={playerGrid}
                label="Your Fleet"
                isInteractive={false}
                locked={!isPlayerTurn}
                showShips={true}
              />
            </div>

            {/* Target sector grid */}
            <div className="flex-1">
              <CombatGrid
                grid={targetGrid}
                label="Target Sector"
                isInteractive={true}
                locked={!isPlayerTurn || gameOver !== null}
                showShips={false}
                onCellClick={fireAtTarget}
              />
            </div>
          </div>

          {/* Fleet health bars under grids */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:gap-4 lg:gap-6">
            <div className="flex-1">
              <FleetStatus ships={playerShips} label="Your Fleet Status" />
            </div>
            <div className="flex-1">
              <FleetStatus ships={enemyShips} label="Enemy Fleet Intel" />
            </div>
          </div>
        </div>

        {/* Right column: Battle Log */}
        <div className="w-full lg:w-72 xl:w-80">
          <BattleLog entries={battleLog} />
        </div>
      </div>
    </div>
  )
}
