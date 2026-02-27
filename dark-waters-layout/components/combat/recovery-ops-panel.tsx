"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { readRecoveryPackage } from "@/src/utils/secret-storage"
import { ERROR_CODES } from "@/src/utils/logger"
import { CheckCircle2, Copy, KeyRound, ShieldAlert, Upload } from "lucide-react"

interface SyncHealthSnapshot {
  lastSyncedAt: number | null
  cursorBlock: number
  processedEvents: number
  pollErrors: number
}

interface RecoveryOpsPanelProps {
  gameId: number | null
  address?: string
  lastError: string | null
  syncHealth: SyncHealthSnapshot
  restoreSecrets: (recoveryPackageJson: string) => boolean
}

export function RecoveryOpsPanel({
  gameId,
  address,
  lastError,
  syncHealth,
  restoreSecrets,
}: RecoveryOpsPanelProps) {
  const { toast } = useToast()
  const [recoveryInput, setRecoveryInput] = useState("")

  const hasActivePackage = useMemo(() => {
    if (!gameId || !address) return false
    return readRecoveryPackage(gameId, address) !== null
  }, [gameId, address, lastError])

  const isSecretLocked = lastError === ERROR_CODES.SECRET_LOCKED

  const handleCopyRecoveryPackage = async () => {
    if (!gameId || !address) return
    const pkg = readRecoveryPackage(gameId, address)
    if (!pkg) {
      toast({
        title: "No Recovery Package",
        description: "Commit your board first to generate encrypted recovery material.",
        variant: "destructive",
      })
      return
    }

    await navigator.clipboard.writeText(JSON.stringify(pkg))
    toast({
      title: "Recovery Package Copied",
      description: "Backup package copied to clipboard.",
    })
  }

  return (
    <section className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-[0_12px_40px_rgba(2,22,35,0.25)] backdrop-blur-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/90">
            Recovery Ops
          </p>
          <p className="text-xs text-muted-foreground">
            Secret vault + replay-safe synchronization controls.
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            isSecretLocked
              ? "border-amber-500/40 text-amber-200"
              : "border-emerald-500/40 text-emerald-200"
          }
        >
          {isSecretLocked ? (
            <>
              <ShieldAlert className="mr-1 h-3.5 w-3.5" />
              Secret lock detected
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Secret vault ready
            </>
          )}
        </Badge>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-md border border-border/60 bg-background/50 px-2 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Cursor Block</p>
          <p className="mt-1 font-mono text-foreground">{syncHealth.cursorBlock}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-background/50 px-2 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Events Processed</p>
          <p className="mt-1 font-mono text-foreground">{syncHealth.processedEvents}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-background/50 px-2 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Poll Errors</p>
          <p className="mt-1 font-mono text-foreground">{syncHealth.pollErrors}</p>
        </div>
        <div className="rounded-md border border-border/60 bg-background/50 px-2 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Last Sync</p>
          <p className="mt-1 font-mono text-foreground">
            {syncHealth.lastSyncedAt
              ? new Date(syncHealth.lastSyncedAt).toLocaleTimeString()
              : "Pending"}
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="border-cyan-500/30"
          onClick={handleCopyRecoveryPackage}
          disabled={!hasActivePackage}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy Recovery Package
        </Button>
        <Badge variant="outline" className="border-border/80 text-muted-foreground">
          <KeyRound className="mr-1 h-3.5 w-3.5" />
          AES-GCM encrypted storage
        </Badge>
      </div>

      <div className="space-y-2">
        <Textarea
          value={recoveryInput}
          onChange={(event) => setRecoveryInput(event.target.value)}
          placeholder='Paste recovery package JSON to restore secrets on this device.'
          className="min-h-24 font-mono text-[11px]"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              if (!recoveryInput.trim()) return
              const restored = restoreSecrets(recoveryInput)
              if (restored) {
                setRecoveryInput("")
                toast({
                  title: "Secrets Restored",
                  description: "Encrypted board secrets rehydrated for auto-reveal.",
                })
                return
              }
              toast({
                title: "Restore Failed",
                description: "Invalid recovery package payload.",
                variant: "destructive",
              })
            }}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Restore Secrets
          </Button>
        </div>
      </div>
    </section>
  )
}

