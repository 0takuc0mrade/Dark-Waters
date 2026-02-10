"use client"

import { useCombat } from "@/hooks/use-combat"
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
  } = useCombat()

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 lg:px-6 lg:py-6">
      {/* Turn Indicator */}
      <TurnIndicator isPlayerTurn={isPlayerTurn} gameOver={gameOver} />

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
