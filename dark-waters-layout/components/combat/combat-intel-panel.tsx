"use client"

import { useMemo } from "react"
import { AudioLines, Award, Crosshair, Gauge, Music2, Shield, Volume2, VolumeX } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { BattleLogEntry } from "./types"
import type { AudioMode } from "@/hooks/use-combat-audio"
import { buildCombatInsights } from "@/src/utils/combat-analytics"

interface CombatIntelPanelProps {
  entries: BattleLogEntry[]
  gameOver: "win" | "lose" | "draw" | null
  audioEnabled: boolean
  onAudioEnabledChange: (enabled: boolean) => void
  audioMode: AudioMode
  onAudioModeChange: (mode: AudioMode) => void
  musicEnabled: boolean
  onMusicEnabledChange: (enabled: boolean) => void
  sfxVolume: number
  onSfxVolumeChange: (value: number) => void
  musicVolume: number
  onMusicVolumeChange: (value: number) => void
}

export function CombatIntelPanel({
  entries,
  gameOver,
  audioEnabled,
  onAudioEnabledChange,
  audioMode,
  onAudioModeChange,
  musicEnabled,
  onMusicEnabledChange,
  sfxVolume,
  onSfxVolumeChange,
  musicVolume,
  onMusicVolumeChange,
}: CombatIntelPanelProps) {
  const intel = useMemo(() => buildCombatInsights(entries, gameOver), [entries, gameOver])

  return (
    <div className="rounded-lg border border-border/70 bg-card/80 p-3 shadow-[0_14px_34px_rgba(2,22,35,0.24)]">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/90">
            Combat Intel
          </p>
          <p className="text-xs text-muted-foreground">Live performance and mission assist.</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2 py-1">
          {audioEnabled ? (
            <Volume2 className="h-3.5 w-3.5 text-cyan-200" />
          ) : (
            <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <Switch checked={audioEnabled} onCheckedChange={onAudioEnabledChange} />
        </div>
      </div>

      <div className="mt-3 space-y-2 rounded-md border border-border/70 bg-background/50 p-2.5">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onAudioModeChange("pack")}
            className={cn(
              "rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors",
              audioMode === "pack"
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                : "border-border/70 text-muted-foreground"
            )}
          >
            <AudioLines className="mr-1 inline h-3 w-3" />
            WAV Pack
          </button>
          <button
            type="button"
            onClick={() => onAudioModeChange("synth")}
            className={cn(
              "rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors",
              audioMode === "synth"
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                : "border-border/70 text-muted-foreground"
            )}
          >
            <Gauge className="mr-1 inline h-3 w-3" />
            Synth
          </button>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border/70 bg-background/40 px-2 py-1.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Music2 className="h-3 w-3" />
            Music Loop
          </div>
          <Switch checked={musicEnabled} onCheckedChange={onMusicEnabledChange} />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <span>SFX Volume</span>
            <span>{Math.round(sfxVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(sfxVolume * 100)}
            onChange={(event) => onSfxVolumeChange(Number(event.target.value) / 100)}
            className="h-1.5 w-full accent-cyan-400"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <span>Music Volume</span>
            <span>{Math.round(musicVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(musicVolume * 100)}
            onChange={(event) => onMusicVolumeChange(Number(event.target.value) / 100)}
            className="h-1.5 w-full accent-cyan-400"
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border/70 bg-background/50 p-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Accuracy</p>
          <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-cyan-100">
            <Crosshair className="h-3.5 w-3.5" />
            {intel.accuracy}%
          </p>
        </div>
        <div className="rounded-md border border-border/70 bg-background/50 p-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Evasive Rate</p>
          <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-cyan-100">
            <Shield className="h-3.5 w-3.5" />
            {intel.evasiveRate}%
          </p>
        </div>
        <div className="rounded-md border border-border/70 bg-background/50 p-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Hit Chain</p>
          <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-cyan-100">
            <Gauge className="h-3.5 w-3.5" />
            x{intel.activeStreak}
          </p>
        </div>
        <div className="rounded-md border border-border/70 bg-background/50 p-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Damage Report</p>
          <p className="mt-1 text-sm font-semibold text-cyan-100">
            {intel.confirmedHits}H / {intel.misses}M / {intel.enemyHits} Taken
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-border/70 bg-background/50 p-2">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <span>Command XP</span>
          <span>{Math.round(intel.commandXp)}%</span>
        </div>
        <Progress value={intel.commandXp} className="h-2.5 bg-secondary/70" />
      </div>

      <div className="mt-3 space-y-2">
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Medals</p>
        <div className="flex flex-wrap gap-1.5">
          {intel.medals.map((medal) => (
            <Badge
              key={medal.id}
              variant="outline"
              className={cn(
                "border-border/60",
                medal.unlocked
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                  : "text-muted-foreground/70"
              )}
              title={medal.description}
            >
              <Award className="mr-1 h-3 w-3" />
              {medal.label}
            </Badge>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-cyan-500/25 bg-cyan-500/10 p-2.5">
        <p className="text-[10px] uppercase tracking-[0.12em] text-cyan-100/90">Mission Prompt</p>
        <p className="mt-1 text-xs text-cyan-50/90">{intel.objective}</p>
      </div>
    </div>
  )
}
