"use client"

import { Award, Shield, Star } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import type {
  CommanderProfileView,
  CommanderProgression,
  MatchReward,
} from "@/hooks/use-commander-profile"

interface CommanderProfilePanelProps {
  profile: CommanderProfileView | null
  progression: CommanderProgression | null
  lastReward: MatchReward | null
}

export function CommanderProfilePanel({
  profile,
  progression,
  lastReward,
}: CommanderProfilePanelProps) {
  if (!profile || !progression) {
    return (
      <div className="rounded-lg border border-border/70 bg-card/80 p-3 shadow-[0_14px_34px_rgba(2,22,35,0.24)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/90">
          Commander Profile
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Connect wallet to initialize progression profile.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/70 bg-card/80 p-3 shadow-[0_14px_34px_rgba(2,22,35,0.24)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/90">
            Commander Profile
          </p>
          <p className="text-xs text-muted-foreground">
            {profile.seasonLabel} • carry-over {profile.carryOverXp} XP
          </p>
        </div>
        <Badge variant="outline" className="border-cyan-500/30 text-cyan-100">
          <Star className="mr-1 h-3 w-3" />
          L{progression.level}
        </Badge>
      </div>

      <div className="mt-3 rounded-md border border-border/70 bg-background/50 p-2.5">
        <div className="mb-1 flex items-center justify-between">
          <p className="flex items-center gap-1 text-xs font-semibold text-cyan-100">
            <Shield className="h-3.5 w-3.5" />
            {progression.rank}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {progression.currentLevelXp}/{progression.nextLevelXp} XP
          </p>
        </div>
        <Progress value={progression.progressPercent} className="h-2.5 bg-secondary/70" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border/70 bg-background/50 p-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Career</p>
          <p className="mt-1 text-sm font-semibold text-cyan-100">
            {profile.wins}W-{profile.losses}L-{profile.draws}D
          </p>
          <p className="text-[10px] text-muted-foreground">{profile.matches} matches</p>
        </div>
        <div className="rounded-md border border-border/70 bg-background/50 p-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Season XP</p>
          <p className="mt-1 text-sm font-semibold text-cyan-100">{profile.seasonXp}</p>
          <p className="text-[10px] text-muted-foreground">Total {profile.totalXp}</p>
        </div>
      </div>

      {lastReward && (
        <div className="mt-3 rounded-md border border-emerald-500/35 bg-emerald-500/10 p-2.5">
          <p className="text-[10px] uppercase tracking-[0.12em] text-emerald-100/90">
            Last Debrief Reward
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-100">
            <Award className="h-3.5 w-3.5" />
            +{lastReward.xpGained} XP • {lastReward.outcome.toUpperCase()}
          </p>
        </div>
      )}
    </div>
  )
}
