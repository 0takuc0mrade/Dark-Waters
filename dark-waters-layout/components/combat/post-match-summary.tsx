"use client"

import { useMemo } from "react"
import { Award, Flame, Shield, Target, Timer, Trophy } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { BattleLogEntry } from "./types"
import type { MatchReward } from "@/hooks/use-commander-profile"
import {
  buildCombatInsights,
  buildReplayTimeline,
  buildShotHeatmap,
  type MatchOutcome,
} from "@/src/utils/combat-analytics"
import { cn } from "@/lib/utils"

interface PostMatchSummaryProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  gameId: number | null
  gameOver: MatchOutcome
  entries: BattleLogEntry[]
  reward: MatchReward | null
}

function getOutcomeLabel(outcome: MatchOutcome): string {
  if (outcome === "win") return "Victory"
  if (outcome === "lose") return "Defeat"
  if (outcome === "draw") return "Draw"
  return "In Progress"
}

function getOutcomeTone(outcome: MatchOutcome): string {
  if (outcome === "win") return "text-emerald-100 border-emerald-500/40 bg-emerald-500/10"
  if (outcome === "lose") return "text-rose-100 border-rose-500/40 bg-rose-500/10"
  if (outcome === "draw") return "text-amber-100 border-amber-500/40 bg-amber-500/10"
  return "text-cyan-100 border-cyan-500/40 bg-cyan-500/10"
}

function timelineLength(entries: BattleLogEntry[]): number {
  if (entries.length < 2) return entries.length === 0 ? 0 : 1
  const timestamps = entries.map((entry) => entry.timestamp)
  const start = Math.min(...timestamps)
  const end = Math.max(...timestamps)
  return Math.max(1, Math.round((end - start) / 1000))
}

export function PostMatchSummary({
  open,
  onOpenChange,
  gameId,
  gameOver,
  entries,
  reward,
}: PostMatchSummaryProps) {
  const insights = useMemo(() => buildCombatInsights(entries, gameOver), [entries, gameOver])
  const replayLengthSeconds = timelineLength(entries)
  const medalsEarned = useMemo(
    () => insights.medals.filter((medal) => medal.unlocked),
    [insights.medals]
  )
  const heatmap = useMemo(() => buildShotHeatmap(entries, "player"), [entries])
  const timeline = useMemo(() => buildReplayTimeline(entries), [entries])
  const maxCell = useMemo(
    () =>
      heatmap.reduce((max, row) => {
        const rowMax = Math.max(...row)
        return Math.max(max, rowMax)
      }, 0),
    [heatmap]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[94vw] max-w-4xl overflow-hidden border-border/70 bg-card/95 p-0 backdrop-blur-md">
        <DialogHeader className="border-b border-border/70 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2 text-cyan-100">
                <Trophy className="h-4 w-4" />
                Post-Match Debrief
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                Game #{gameId ?? "N/A"} • Tactical replay summary
              </DialogDescription>
            </div>
            <Badge variant="outline" className={cn("uppercase", getOutcomeTone(gameOver))}>
              {getOutcomeLabel(gameOver)}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[78vh]">
          <div className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border border-border/70 bg-background/50 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Accuracy</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-cyan-100">
                  <Target className="h-3.5 w-3.5" />
                  {insights.accuracy}%
                </p>
              </div>
              <div className="rounded-md border border-border/70 bg-background/50 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Confirmed Hits</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-cyan-100">
                  <Flame className="h-3.5 w-3.5" />
                  {insights.confirmedHits}
                </p>
              </div>
              <div className="rounded-md border border-border/70 bg-background/50 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Evasive Rate</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-cyan-100">
                  <Shield className="h-3.5 w-3.5" />
                  {insights.evasiveRate}%
                </p>
              </div>
              <div className="rounded-md border border-border/70 bg-background/50 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Timeline Length</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-cyan-100">
                  <Timer className="h-3.5 w-3.5" />
                  {replayLengthSeconds}s
                </p>
              </div>
            </div>

            {reward && (
              <div className="rounded-md border border-emerald-500/35 bg-emerald-500/10 p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-emerald-100/90">
                  Commander Progression
                </p>
                <p className="mt-1 text-sm font-semibold text-emerald-100">
                  +{reward.xpGained} XP • {reward.rankBefore} L{reward.levelBefore} → {reward.rankAfter} L
                  {reward.levelAfter}
                </p>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
              <div className="rounded-md border border-border/70 bg-background/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/90">
                  Shot Heatmap
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Frequency of your outgoing shots by grid cell.
                </p>
                <div className="mt-3 grid grid-cols-10 gap-1">
                  {heatmap.map((row, rowIndex) =>
                    row.map((value, colIndex) => {
                      const intensity = maxCell > 0 ? value / maxCell : 0
                      return (
                        <div
                          key={`${rowIndex}-${colIndex}`}
                          className="flex h-6 items-center justify-center rounded-[3px] border border-border/70 text-[9px] text-cyan-50"
                          style={{
                            backgroundColor:
                              value === 0
                                ? "rgba(15,23,42,0.45)"
                                : `rgba(34,211,238,${0.2 + intensity * 0.65})`,
                          }}
                          title={`${String.fromCharCode(65 + rowIndex)}${colIndex + 1}: ${value} shots`}
                        >
                          {value > 0 ? value : ""}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="rounded-md border border-border/70 bg-background/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/90">
                  Medals Earned
                </p>
                <div className="mt-3 space-y-2">
                  {medalsEarned.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No medals unlocked this round.</p>
                  ) : (
                    medalsEarned.map((medal) => (
                      <div
                        key={medal.id}
                        className="rounded-md border border-emerald-500/35 bg-emerald-500/10 p-2.5"
                      >
                        <p className="flex items-center gap-1 text-xs font-semibold text-emerald-100">
                          <Award className="h-3.5 w-3.5" />
                          {medal.label}
                        </p>
                        <p className="mt-1 text-[11px] text-emerald-50/85">{medal.description}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border/70 bg-background/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/90">
                Replay Timeline
              </p>
              <ScrollArea className="mt-3 h-56 rounded-md border border-border/70 bg-background/40 p-2">
                <div className="space-y-1.5 p-1">
                  {timeline.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No replay events captured.</p>
                  ) : (
                    timeline.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start justify-between rounded-md border border-border/60 bg-background/50 px-2 py-1.5"
                      >
                        <div>
                          <p className="text-xs text-foreground">{entry.message}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {entry.type === "player" ? "Commander" : "Enemy"} • {entry.coordinate}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground">+{entry.relativeSeconds}s</span>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
