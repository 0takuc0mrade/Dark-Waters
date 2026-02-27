"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ProtocolRailState, ProofStepStatus } from "@/hooks/use-combat"
import { CheckCircle2, CircleDashed, Radar, ShieldAlert, Waves } from "lucide-react"

interface SyncHealthSnapshot {
  lastSyncedAt: number | null
  cursorBlock: number
  processedEvents: number
  pollErrors: number
}

interface ProofRailProps {
  rail: ProtocolRailState
  syncHealth: SyncHealthSnapshot
}

interface RailStep {
  id: string
  label: string
  description: string
  status: ProofStepStatus
}

function statusTone(status: ProofStepStatus): string {
  if (status === "confirmed") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
  if (status === "pending") return "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
  if (status === "failed") return "border-rose-500/40 bg-rose-500/10 text-rose-200"
  return "border-border/70 bg-background/40 text-muted-foreground"
}

function statusLabel(status: ProofStepStatus): string {
  if (status === "confirmed") return "Confirmed"
  if (status === "pending") return "Pending"
  if (status === "failed") return "Failed"
  return "Idle"
}

function StatusIcon({ status }: { status: ProofStepStatus }) {
  if (status === "confirmed") return <CheckCircle2 className="h-4 w-4" />
  if (status === "pending") return <CircleDashed className="h-4 w-4 animate-spin" />
  if (status === "failed") return <ShieldAlert className="h-4 w-4" />
  return <Radar className="h-4 w-4" />
}

export function ProofRail({ rail, syncHealth }: ProofRailProps) {
  const steps: RailStep[] = [
    {
      id: "commit_attack",
      label: "commit_attack",
      description: "Attack intent committed",
      status: rail.commitAttack,
    },
    {
      id: "reveal_attack",
      label: "reveal_attack",
      description: "Coordinates revealed",
      status: rail.revealAttack,
    },
    {
      id: "merkle_verify",
      label: "Merkle verify",
      description: "Defender proof accepted",
      status: rail.merkleVerification,
    },
    {
      id: "stake_settle",
      label: "Stake settle",
      description: "Escrow payout finality",
      status: rail.stakeSettlement,
    },
  ]

  return (
    <section className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-[0_12px_40px_rgba(2,22,35,0.25)] backdrop-blur-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/90">
            Protocol Proof Rail
          </p>
          <p className="text-xs text-muted-foreground">
            {rail.coordinate ? `Target ${rail.coordinate}` : "No active strike selected"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-cyan-500/30 text-cyan-100">
            <Waves className="mr-1 h-3.5 w-3.5" />
            Replay-safe indexing
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              syncHealth.pollErrors > 0
                ? "border-amber-500/40 text-amber-200"
                : "border-emerald-500/40 text-emerald-200"
            )}
          >
            {syncHealth.pollErrors > 0 ? "Sync degraded" : "Sync nominal"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) => (
          <article
            key={step.id}
            className={cn("rounded-lg border p-3 transition-colors", statusTone(step.status))}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]">
                {step.label}
              </p>
              <StatusIcon status={step.status} />
            </div>
            <p className="mt-1 text-[11px] leading-5 opacity-90">{step.description}</p>
            <p className="mt-2 text-[10px] uppercase tracking-[0.14em] opacity-75">
              {statusLabel(step.status)}
            </p>
          </article>
        ))}
      </div>

      {(rail.error || syncHealth.lastSyncedAt) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-[11px] text-muted-foreground">
          <span>
            Last sync:{" "}
            {syncHealth.lastSyncedAt
              ? new Date(syncHealth.lastSyncedAt).toLocaleTimeString()
              : "awaiting first poll"}
          </span>
          <span>block {syncHealth.cursorBlock}</span>
          <span>events {syncHealth.processedEvents}</span>
          {rail.error && <span className="text-rose-300">Error: {rail.error}</span>}
        </div>
      )}
    </section>
  )
}

