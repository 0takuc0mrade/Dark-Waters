"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Anchor, Loader2, Swords, ArrowRight } from "lucide-react"

import { useGameActions } from "@/src/hooks/useGameActions"
import { useWallet } from "@/components/wallet-provider"
import { useToast } from "@/hooks/use-toast"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

// ── localStorage keys ────────────────────────────────────────────────

const LS_GAME_ID = "dark-waters-gameId"

// ── Component ────────────────────────────────────────────────────────

export function Lobby() {
  const router = useRouter()
  const { isConnected, address } = useWallet()
  const { spawnGame, isLoading, error } = useGameActions()
  const { toast } = useToast()

  const [opponentAddress, setOpponentAddress] = useState("")
  const [gameId, setGameId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null
    const stored = localStorage.getItem(LS_GAME_ID)
    return stored ? Number(stored) : null
  })

  const handleSpawnGame = useCallback(async () => {
    if (!opponentAddress.trim()) {
      toast({
        title: "Missing Address",
        description: "Enter your opponent's Starknet address.",
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Creating Game…",
      description: "Submitting spawn transaction on-chain.",
    })

    try {
      const result = await spawnGame(opponentAddress.trim())
      if (result) {
        const txHash = result.transaction_hash

        // Extract game_id from the Dojo EventEmitted event in the receipt.
        // Dojo wraps custom events in EventEmitted:
        //   keys[0] = EventEmitted selector (0x1c93f6e...)
        //   data[1] = game_id (the #[key] field, serialized in data for Dojo events)
        const EVENT_EMITTED_SELECTOR =
          "0x1c93f6e4703ae90f75338f29bffbe9c1662200cee981f49afeec26e892debcd"
        let newGameId = 1 // fallback
        const receipt = result.receipt as any
        const events = receipt?.events || []
        for (const event of events) {
          // Match the EventEmitted event (Dojo custom event wrapper)
          if (
            event.keys?.[0]?.toLowerCase() ===
            EVENT_EMITTED_SELECTOR.toLowerCase()
          ) {
            // data layout: [count, game_id, field_count, player1, player2, turn, ...]
            if (event.data && event.data.length >= 2) {
              const parsed = Number(event.data[1])
              if (parsed > 0 && parsed < 2_000_000_000) {
                newGameId = parsed
                break
              }
            }
          }
        }

        console.log("Extracted game_id:", newGameId)
        setGameId(newGameId)
        localStorage.setItem(LS_GAME_ID, String(newGameId))

        toast({
          title: "Game Created!",
          description: `Game #${newGameId} — Tx: ${txHash.slice(0, 10)}…${txHash.slice(-6)}`,
        })
      }
    } catch (err) {
      toast({
        title: "Failed to Create Game",
        description: err instanceof Error ? err.message : "Transaction failed.",
        variant: "destructive",
      })
    }
  }, [opponentAddress, spawnGame, toast])

  const handleContinue = useCallback(() => {
    router.push("/placement")
  }, [router])

  // ── Not connected state ────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Anchor className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
            Dark Waters Lobby
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Connect your wallet to create or join a game.
          </p>
        </div>
      </div>
    )
  }

  // ── Connected state ────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg px-4 py-12 lg:px-6">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Swords className="h-7 w-7 text-primary" />
        </div>
        <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground">
          New Engagement
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Challenge an opponent to a naval battle on Starknet.
        </p>
      </div>

      {/* Your address badge */}
      <div className="mb-6 flex items-center justify-center">
        <Badge variant="secondary" className="font-mono text-xs">
          You: {address ? `${address.slice(0, 8)}…${address.slice(-6)}` : "—"}
        </Badge>
      </div>

      {/* Create Game card */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-foreground">
            Spawn Game
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="opponent-address"
              className="text-xs font-medium text-muted-foreground"
            >
              Opponent Address
            </label>
            <Input
              id="opponent-address"
              placeholder="0x06162896d1d7…"
              value={opponentAddress}
              onChange={(e) => setOpponentAddress(e.target.value)}
              className="font-mono text-sm"
              disabled={isLoading}
            />
          </div>

          <Button
            className="w-full gap-2"
            onClick={handleSpawnGame}
            disabled={isLoading || !opponentAddress.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating Game…
              </>
            ) : (
              <>
                <Swords className="h-4 w-4" />
                Spawn Game
              </>
            )}
          </Button>

          {error && (
            <p className="text-xs text-destructive">
              Error: {error.message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Post-creation: continue to placement */}
      {gameId && (
        <Card className="mt-4 border-accent/30 bg-accent/5">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                Game Active
              </p>
              <p className="text-xs text-muted-foreground">
                Deploy your fleet to begin.
              </p>
            </div>
            <Button size="sm" className="gap-1.5" onClick={handleContinue}>
              Deploy Fleet
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
