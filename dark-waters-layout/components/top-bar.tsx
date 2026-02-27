"use client"

import { Anchor, Compass, Radar } from "lucide-react"
import { WalletStatus } from "@/components/wallet-status"
import { Badge } from "@/components/ui/badge"

export function TopBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-card/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-3 md:px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-400/30 bg-cyan-500/10">
            <Anchor className="h-4 w-4 text-cyan-200" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/90">Dark Waters</p>
            <p className="text-xs text-muted-foreground">Starknet Naval Command</p>
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Badge variant="outline" className="border-cyan-500/30 text-cyan-100">
            <Compass className="mr-1 h-3.5 w-3.5" />
            Canonical Flow
          </Badge>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-200">
            <Radar className="mr-1 h-3.5 w-3.5" />
            Replay-safe Sync
          </Badge>
        </div>

        <WalletStatus />
      </div>
    </header>
  )
}
