"use client"

import { useEffect, useRef, useState } from "react"
import { useCombat } from "@/hooks/use-combat"
import { useAttackListener } from "@/hooks/use-attack-listener"
import { TurnIndicator } from "./turn-indicator"
import { CombatGrid } from "./combat-grid"
import { BattleLog } from "./battle-log"
import { FleetStatus } from "./fleet-status"
import { ERROR_CODES } from "@/src/utils/logger"
import { ProofRail } from "./proof-rail"
import { RecoveryOpsPanel } from "./recovery-ops-panel"
import { useWallet } from "@/components/wallet-provider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CombatIntelPanel } from "./combat-intel-panel"
import { useCombatAudio } from "@/hooks/use-combat-audio"
import { useCommanderProfile } from "@/hooks/use-commander-profile"
import { CommanderProfilePanel } from "./commander-profile-panel"
import { PostMatchSummary } from "./post-match-summary"
import { Button } from "@/components/ui/button"

export function CombatDashboard() {
  const { address } = useWallet()
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
    protocolRail,
    applyRevealedAttack,
    applyIncomingAttack,
  } = useCombat()

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
  const {
    audioEnabled,
    setAudioEnabled,
    audioMode,
    setAudioMode,
    musicEnabled,
    setMusicEnabled,
    sfxVolume,
    setSfxVolume,
    musicVolume,
    setMusicVolume,
    playCue,
  } = useCombatAudio()
  const { profile, progression, lastReward, registerMatch } = useCommanderProfile(address)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryRewardGameId, setSummaryRewardGameId] = useState<number | null>(null)
  const lastBattleEventRef = useRef<string | null>(null)
  const previousTurnRef = useRef<boolean | null>(null)
  const lastGameOverRef = useRef<"win" | "lose" | "draw" | null>(null)
  const rewardedGameRef = useRef<number | null>(null)

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

  useEffect(() => {
    const latestEvent = battleLog[0]
    if (!latestEvent) return
    if (lastBattleEventRef.current === latestEvent.id) return
    lastBattleEventRef.current = latestEvent.id

    if (latestEvent.type === "player") {
      void playCue(latestEvent.result === "miss" ? "playerMiss" : "playerHit")
      return
    }

    void playCue(latestEvent.result === "miss" ? "enemyMiss" : "enemyHit")
  }, [battleLog, playCue])

  useEffect(() => {
    const previousTurn = previousTurnRef.current
    if (previousTurn === false && isPlayerTurn && !gameOver) {
      void playCue("turnReady")
    }
    previousTurnRef.current = isPlayerTurn
  }, [gameOver, isPlayerTurn, playCue])

  useEffect(() => {
    if (!gameOver || lastGameOverRef.current === gameOver) return
    lastGameOverRef.current = gameOver
    void playCue(gameOver === "win" ? "victory" : gameOver === "lose" ? "defeat" : "draw")
  }, [gameOver, playCue])

  useEffect(() => {
    if (!gameOver) {
      lastGameOverRef.current = null
    }
  }, [gameOver])

  useEffect(() => {
    if (!gameId || !gameOver) return
    if (rewardedGameRef.current === gameId) return
    const reward = registerMatch(gameId, gameOver, battleLog)
    if (reward) {
      setSummaryRewardGameId(reward.gameId)
    } else if (lastReward?.gameId === gameId) {
      setSummaryRewardGameId(lastReward.gameId)
    }
    rewardedGameRef.current = gameId
    setSummaryOpen(true)
  }, [battleLog, gameId, gameOver, lastReward, registerMatch])

  useEffect(() => {
    if (!gameId) {
      rewardedGameRef.current = null
      setSummaryRewardGameId(null)
      setSummaryOpen(false)
      return
    }
    if (!gameOver) {
      rewardedGameRef.current = null
      setSummaryRewardGameId(null)
      setSummaryOpen(false)
    }
  }, [gameId, gameOver])

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
            Recovery package required. Restore from the Recovery Ops panel below.
          </p>
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
          {gameOver && (
            <Button
              size="sm"
              variant="outline"
              className="mt-1 h-7 border-cyan-500/40 text-[11px] text-cyan-100"
              onClick={() => setSummaryOpen(true)}
            >
              View Debrief
            </Button>
          )}
        </div>
      )}

      <div className="mt-4">
        <Tabs defaultValue="tactical">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="tactical">Tactical</TabsTrigger>
            <TabsTrigger value="protocol">Protocol</TabsTrigger>
          </TabsList>

          <TabsContent value="tactical" className="mt-4 space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <CombatGrid
                grid={playerGrid}
                label="Your Fleet"
                isInteractive={false}
                locked={!isPlayerTurn}
                showShips={true}
              />
              <CombatGrid
                grid={targetGrid}
                label="Target Sector"
                isInteractive={true}
                locked={!isPlayerTurn || gameOver !== null}
                showShips={false}
                onCellClick={fireAtTarget}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <FleetStatus ships={playerShips} label="Your Fleet Status" />
              <FleetStatus ships={enemyShips} label="Enemy Fleet Intel" />
            </div>
          </TabsContent>

          <TabsContent value="protocol" className="mt-4 space-y-4">
            <ProofRail rail={protocolRail} syncHealth={syncHealth} />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-4">
                <CommanderProfilePanel
                  profile={profile}
                  progression={progression}
                  lastReward={summaryRewardGameId && lastReward?.gameId === summaryRewardGameId ? lastReward : null}
                />
                <CombatIntelPanel
                  entries={battleLog}
                  gameOver={gameOver}
                  audioEnabled={audioEnabled}
                  onAudioEnabledChange={setAudioEnabled}
                  audioMode={audioMode}
                  onAudioModeChange={setAudioMode}
                  musicEnabled={musicEnabled}
                  onMusicEnabledChange={setMusicEnabled}
                  sfxVolume={sfxVolume}
                  onSfxVolumeChange={setSfxVolume}
                  musicVolume={musicVolume}
                  onMusicVolumeChange={setMusicVolume}
                />
                <RecoveryOpsPanel
                  gameId={gameId}
                  address={address}
                  lastError={lastError}
                  syncHealth={syncHealth}
                  restoreSecrets={restoreSecrets}
                />
              </div>
              <div className="space-y-4">
                <BattleLog entries={battleLog} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <PostMatchSummary
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        gameId={gameId}
        gameOver={gameOver}
        entries={battleLog}
        reward={summaryRewardGameId && lastReward?.gameId === summaryRewardGameId ? lastReward : null}
      />
    </div>
  )
}
