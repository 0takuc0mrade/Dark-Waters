"use client"

import { useEffect } from "react"
import { useCombat } from "@/hooks/use-combat"
import { useAttackListener } from "@/hooks/use-attack-listener"
import { TurnIndicator } from "./turn-indicator"
import { CombatGrid } from "./combat-grid"
import { BattleLog } from "./battle-log"
import { FleetStatus } from "./fleet-status"
import { TransactionModal } from "./transaction-modal"

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
    txModal,
    closeTxModal,
    completeTxModal,
    applyRevealedAttack,
    applyIncomingAttack,
    gameId,
  } = useCombat()

  // ── Event listener for auto-reveal + grid updates ──────────────────

  const { revealedAttacks, incomingAttacks, isRevealing } = useAttackListener({
    enabled: gameId !== null,
    pollInterval: 4000,
  })

  // Apply revealed attacks to our target grid (attacks we made, now revealed)
  useEffect(() => {
    for (const revealed of revealedAttacks) {
      applyRevealedAttack(revealed.x, revealed.y, revealed.isHit)
    }
  }, [revealedAttacks, applyRevealedAttack])

  // Apply incoming attacks to our player grid (attacks enemy made on us)
  useEffect(() => {
    for (const incoming of incomingAttacks) {
      // We'll get the actual hit/miss info from the attack_revealed event
      // For now, just mark the cell as "pending" to show it was attacked
      // The auto-reveal will happen automatically via useAttackListener
    }
  }, [incomingAttacks, applyIncomingAttack])

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

      {/* Game ID badge */}
      {gameId && (
        <div className="mt-2 flex justify-center">
          <span className="rounded-full border border-border bg-secondary/50 px-3 py-0.5 text-[10px] font-medium text-muted-foreground">
            Game #{gameId}
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

      {/* Transaction Processing Modal */}
      <TransactionModal
        open={txModal.open}
        coordinate={txModal.coordinate}
        onClose={closeTxModal}
        onComplete={completeTxModal}
      />
    </div>
  )
}
