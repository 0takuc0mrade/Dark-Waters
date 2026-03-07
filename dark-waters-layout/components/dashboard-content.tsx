"use client"

import Link from "next/link"
import React, { useEffect, useMemo } from "react"
import {
  Anchor,
  Crosshair,
  Loader2,
  LogOut,
  Radar,
  Shield,
  Waves,
  Zap,
} from "lucide-react"

import type { CombatCell } from "@/components/combat/types"
import { GRID_SIZE, ROW_LABELS } from "@/components/combat/types"
import { useAttackListener } from "@/hooks/use-attack-listener"
import { useCombat } from "@/hooks/use-combat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useWallet } from "@/components/wallet-provider"
import { GameChatPanel } from "@/components/combat/game-chat-panel"
import { cn } from "@/lib/utils"

const COLUMN_LABELS = Array.from({ length: GRID_SIZE }, (_, index) => String(index + 1))

type DashboardCellState = "water" | "ship" | "hit" | "miss" | "target"

const CELL_STYLE: Record<DashboardCellState, string> = {
  water: "border-cyan-200/10 bg-cyan-500/5",
  ship: "border-cyan-200/35 bg-cyan-300/25",
  hit: "border-rose-200/60 bg-rose-500/30 shadow-[0_0_10px_rgba(251,113,133,0.45)]",
  miss: "border-slate-300/25 bg-slate-400/15",
  target: "border-amber-200/70 bg-amber-400/25 shadow-[0_0_10px_rgba(251,191,36,0.5)]",
}

function formatRelativeTime(timestamp: number): string {
  const elapsedMs = Math.max(0, Date.now() - timestamp)
  const elapsedSec = Math.floor(elapsedMs / 1000)

  if (elapsedSec < 60) return `${elapsedSec}s ago`
  if (elapsedSec < 3600) return `${Math.floor(elapsedSec / 60)}m ago`
  if (elapsedSec < 86400) return `${Math.floor(elapsedSec / 3600)}h ago`
  return `${Math.floor(elapsedSec / 86400)}d ago`
}

function resolveCellState(cell: CombatCell, showShips: boolean): DashboardCellState {
  if (cell.state === "hit") return "hit"
  if (cell.state === "miss") return "miss"
  if (cell.state === "pending") return "target"
  if (showShips && cell.state === "ship") return "ship"
  return "water"
}

function BattleGrid({
  title,
  subtitle,
  grid,
  showShips,
  canInteract,
  onCellClick,
  isLocked,
}: {
  title: string
  subtitle: string
  grid: CombatCell[][]
  showShips: boolean
  canInteract?: boolean
  onCellClick?: (row: number, col: number) => void
  isLocked?: boolean
}) {
  return (
    <Card className="border-cyan-200/20 bg-card/80 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm uppercase tracking-[0.2em] text-cyan-100/95">
          {title}
        </CardTitle>
        <p className="text-xs text-cyan-100/70">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border border-cyan-200/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.2),rgba(8,18,31,0.84)_58%)] p-3">
          <div className="grid grid-cols-[20px_repeat(10,minmax(0,1fr))] gap-1.5">
            <div />
            {COLUMN_LABELS.map((column) => (
              <div
                key={`column-${column}`}
                className="text-center font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-cyan-100/70"
              >
                {column}
              </div>
            ))}

            {Array.from({ length: GRID_SIZE }, (_, row) => (
              <React.Fragment key={`row-${row}`}>
                <div className="flex items-center justify-center font-mono text-[10px] text-cyan-100/70">
                  {ROW_LABELS[row]}
                </div>

                {Array.from({ length: GRID_SIZE }, (_, col) => {
                  const cell = grid[row]?.[col] ?? { state: "empty" as const }
                  const state = resolveCellState(cell, showShips)
                  const clickable = Boolean(canInteract && onCellClick && !isLocked)

                  return (
                    <button
                      key={`${row}-${col}`}
                      type="button"
                      onClick={() => onCellClick?.(row, col)}
                      disabled={!clickable}
                      className={cn(
                        "relative aspect-square rounded-[5px] border transition-colors",
                        CELL_STYLE[state],
                        clickable && "cursor-crosshair hover:border-cyan-100/70",
                        !clickable && "cursor-default",
                      )}
                    >
                      {state === "ship" && (
                        <span className="absolute inset-0 m-auto h-1.5 w-3 rounded-full bg-cyan-100/70" />
                      )}
                      {state === "miss" && (
                        <span className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-slate-100/70" />
                      )}
                      {state === "hit" && (
                        <>
                          <span className="absolute inset-0 m-auto h-[1px] w-3 rotate-45 bg-rose-100/90" />
                          <span className="absolute inset-0 m-auto h-[1px] w-3 -rotate-45 bg-rose-100/90" />
                        </>
                      )}
                      {state === "target" && (
                        <span className="absolute inset-0 m-auto h-2.5 w-2.5 rounded-full border border-amber-100/80" />
                      )}
                    </button>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardContent() {
  const { isConnected } = useWallet()
  const {
    isPlayerTurn,
    playerGrid,
    targetGrid,
    battleLog,
    playerShips,
    pendingCell,
    gameOver,
    protocolRail,
    fireAtTarget,
    applyRevealedAttack,
    applyIncomingAttack,
    gameId,
    exitGame,
  } = useCombat()

  const {
    myRevealedAttacks,
    enemyRevealedAttacks,
    syncHealth,
    isRevealing,
    lastError,
  } = useAttackListener({
    enabled: isConnected && gameId !== null,
    gameId,
    pollInterval: 4000,
  })

  useEffect(() => {
    for (const revealed of myRevealedAttacks) {
      applyRevealedAttack(revealed.id, revealed.x, revealed.y, revealed.isHit)
    }
  }, [myRevealedAttacks, applyRevealedAttack])

  useEffect(() => {
    for (const revealed of enemyRevealedAttacks) {
      applyIncomingAttack(revealed.id, revealed.x, revealed.y, revealed.isHit)
    }
  }, [enemyRevealedAttacks, applyIncomingAttack])

  const fleetIntegrity = useMemo(
    () =>
      playerShips.map((ship) => ({
        ship: ship.name,
        health: Math.max(0, Math.round(((ship.size - ship.hits) / ship.size) * 100)),
        size: ship.size,
      })),
    [playerShips],
  )

  const battleFeed = useMemo(() => {
    if (battleLog.length > 0) {
      return battleLog.slice(0, 6).map((entry) => ({
        title: entry.message,
        time: formatRelativeTime(entry.timestamp),
        level: entry.result === "miss" ? "miss" : "hit",
      }))
    }

    if (!gameId) {
      return [
        {
          title: "No active game selected. Start or resume a match from the command console.",
          time: "live",
          level: "info",
        },
      ]
    }

    return [
      {
        title:
          protocolRail.merkleVerification === "pending"
            ? "Awaiting defender proof and reveal verification..."
            : "Connected to Dojo world. Waiting for first combat reveal.",
        time: "live",
        level: "info",
      },
    ]
  }, [battleLog, gameId, protocolRail.merkleVerification])

  const pendingTargetLabel =
    pendingCell !== null ? `${ROW_LABELS[pendingCell.row]}${pendingCell.col + 1}` : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
      {!isConnected ? (
        <div className="relative overflow-hidden rounded-2xl border border-cyan-300/30 bg-gradient-to-b from-cyan-300/15 via-slate-900/80 to-slate-950/90 px-6 py-20 text-center">
          <div className="pointer-events-none absolute -left-16 top-0 h-48 w-48 rounded-full bg-cyan-300/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 right-0 h-52 w-52 rounded-full bg-blue-500/20 blur-3xl" />

          <div className="relative flex flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-200/30 bg-cyan-400/10">
              <Anchor className="h-8 w-8 text-cyan-100" />
            </div>
            <h1 className="mt-6 text-balance text-center text-2xl font-semibold tracking-tight text-cyan-50">
              Dark Waters Tactical Relay
            </h1>
            <p className="mt-3 max-w-md text-pretty text-center text-sm leading-relaxed text-cyan-100/75">
              Connect your wallet to stream live Dojo combat state and command
              your fleet.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Badge className="border-cyan-200/40 bg-cyan-400/20 text-cyan-50">
                Secure channel
              </Badge>
              <Badge className="border-emerald-200/40 bg-emerald-500/20 text-emerald-100">
                Live Dojo sync
              </Badge>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="relative overflow-hidden border-cyan-200/25 bg-gradient-to-r from-cyan-700/15 via-card to-card">
            <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.22),rgba(15,23,42,0)_68%)] lg:block" />
            <CardContent className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100/80">
                  Sea Battle Relay
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-cyan-50">
                  Command Deck
                </h1>
                <p className="mt-1 text-sm text-cyan-100/70">
                  {pendingTargetLabel
                    ? `Pending strike locked on ${pendingTargetLabel}.`
                    : "Tap a target cell to submit commit + reveal."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-cyan-300/40 bg-cyan-500/20 text-cyan-100">
                  {gameId ? `Game #${gameId}` : "No active game"}
                </Badge>
                <Badge className="border-emerald-300/40 bg-emerald-500/20 text-emerald-100">
                  {gameOver
                    ? gameOver === "win"
                      ? "Victory"
                      : gameOver === "lose"
                        ? "Defeat"
                        : "Draw"
                    : isPlayerTurn
                      ? "Your turn"
                      : "Enemy turn"}
                </Badge>
                <Badge className="border-amber-300/40 bg-amber-500/20 text-amber-100">
                  Sync {syncHealth.cursorBlock}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {!gameId && (
            <Card className="border-amber-400/30 bg-amber-500/10">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-amber-100/90">
                  No active match detected in local state.
                </p>
                <Button asChild size="sm" variant="outline" className="border-amber-300/40 text-amber-100 hover:bg-amber-400/10">
                  <Link href="/operations">Open Lobby</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <BattleGrid
                  title="Your Waters"
                  subtitle="Fleet positions and incoming fire"
                  grid={playerGrid}
                  showShips={true}
                />
                <BattleGrid
                  title="Enemy Waters"
                  subtitle="Tap to fire commit + reveal"
                  grid={targetGrid}
                  showShips={false}
                  canInteract={true}
                  onCellClick={fireAtTarget}
                  isLocked={!isPlayerTurn || gameOver !== null || !gameId}
                />
              </div>

              <Card className="border-cyan-200/20 bg-card/85 backdrop-blur">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-cyan-100/90">
                    <Zap className="h-4 w-4 text-cyan-200" />
                    Quick Commands
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <Button
                    asChild
                    variant="outline"
                    className="h-auto flex-col items-start gap-1 rounded-lg border-cyan-200/30 bg-cyan-400/5 px-3 py-3 text-left hover:bg-cyan-400/15"
                  >
                    <Link href="/operations">
                      <Anchor className="h-4 w-4 text-cyan-100" />
                      <span className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-50">
                        Lobby
                      </span>
                      <span className="text-[11px] text-cyan-100/65">Start/resume match</span>
                    </Link>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={exitGame}
                    disabled={!gameId}
                    className="h-auto flex-col items-start gap-1 rounded-lg border-cyan-200/30 bg-cyan-400/5 px-3 py-3 text-left hover:bg-cyan-400/15"
                  >
                    <LogOut className="h-4 w-4 text-cyan-100" />
                    <span className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-50">
                      Exit
                    </span>
                    <span className="text-[11px] text-cyan-100/65">
                      {gameId ? "Clear active match state" : "No active game"}
                    </span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={!isPlayerTurn || gameOver !== null || !gameId}
                    className="h-auto flex-col items-start gap-1 rounded-lg border-cyan-200/30 bg-cyan-400/5 px-3 py-3 text-left hover:bg-cyan-400/15"
                  >
                    <Crosshair className="h-4 w-4 text-cyan-100" />
                    <span className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-50">
                      Fire
                    </span>
                    <span className="text-[11px] text-cyan-100/65">
                      Select coordinate on enemy grid
                    </span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    disabled
                    className="h-auto flex-col items-start gap-1 rounded-lg border-cyan-200/30 bg-cyan-400/5 px-3 py-3 text-left"
                  >
                    <Radar className="h-4 w-4 text-cyan-100" />
                    <span className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-50">
                      Scan
                    </span>
                    <span className="text-[11px] text-cyan-100/65">Processed {syncHealth.processedEvents} events</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    disabled
                    className="h-auto flex-col items-start gap-1 rounded-lg border-cyan-200/30 bg-cyan-400/5 px-3 py-3 text-left"
                  >
                    <Shield className="h-4 w-4 text-cyan-100" />
                    <span className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-50">
                      Reveal
                    </span>
                    <span className="text-[11px] text-cyan-100/65">
                      {isRevealing ? "Auto-revealing..." : "Standing by"}
                    </span>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="border-cyan-200/20 bg-card/85">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm uppercase tracking-[0.18em] text-cyan-100/90">
                    Fleet Integrity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {fleetIntegrity.map((ship) => (
                    <div key={ship.ship} className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-cyan-100/75">
                        <span>{ship.ship}</span>
                        <span>{ship.health}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-cyan-100/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-300/80 to-blue-300/70"
                          style={{ width: `${ship.health}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-cyan-100/50">
                        Hull segments: {ship.size}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-cyan-200/20 bg-card/85">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-cyan-100/90">
                    <Waves className="h-4 w-4 text-cyan-200" />
                    Combat Feed
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {battleFeed.map((entry) => (
                    <div
                      key={`${entry.title}-${entry.time}`}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-xs",
                        entry.level === "hit" &&
                          "border-rose-300/40 bg-rose-500/15 text-rose-100",
                        entry.level === "miss" &&
                          "border-slate-300/30 bg-slate-500/10 text-slate-100",
                        entry.level === "info" &&
                          "border-cyan-300/30 bg-cyan-400/10 text-cyan-100",
                      )}
                    >
                      <p>{entry.title}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.14em] opacity-70">
                        {entry.time}
                      </p>
                    </div>
                  ))}

                  {(isRevealing || lastError) && (
                    <div className="rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      <p className="flex items-center gap-2">
                        {isRevealing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {isRevealing
                          ? "Auto-reveal transaction in flight."
                          : `Sync warning: ${lastError}`}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <GameChatPanel gameId={gameId} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
