"use client"

import Link from "next/link"
import { Anchor, Compass, Radar } from "lucide-react"
import { WalletStatus } from "@/components/wallet-status"
import { Badge } from "@/components/ui/badge"

export function TopBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-card/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-3 md:px-5">
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-90">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-400/30 bg-cyan-500/10">
            <Anchor className="h-4 w-4 text-cyan-200" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/90">Dark Waters</p>
            <p className="text-xs text-muted-foreground">Starknet Naval Command</p>
          </div>
        </Link>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/operations">
            <Badge variant="outline" className="cursor-pointer border-cyan-500/30 text-cyan-100 hover:bg-cyan-500/10">
              <Compass className="mr-1 h-3.5 w-3.5" />
              Command Console
            </Badge>
          </Link>
          <Link href="/">
            <Badge variant="outline" className="cursor-pointer border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10">
              <Radar className="mr-1 h-3.5 w-3.5" />
              Tactical Deck
            </Badge>
          </Link>
        </div>

        <WalletStatus />
      </div>
    </header>
  )
}
