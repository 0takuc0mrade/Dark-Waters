
"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Sword, Anchor, LogOut, Copy, RefreshCw, Loader2, CheckCircle2 } from "lucide-react"
import { useWallet } from "@/components/wallet-provider"
import { useGameActions } from "@/src/hooks/useGameActions"
import { useMyGames, useGameState } from "@/hooks/useGameState"
import { useToast } from "@/hooks/use-toast"
import { CombatDashboard } from "@/components/combat/combat-dashboard"
import { ShipPlacement } from "@/components/placement/ship-placement"

const LS_GAME_ID = "dark-waters-gameId"
const LS_ONBOARDING_FUNDED = "dark-waters-onboarding-funded"

export default function Page() {
  const { isConnected, address } = useWallet()
  const [gameId, setGameId] = useState<number | null>(null)

  // Hydrate gameId from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(LS_GAME_ID)
      if (stored) setGameId(Number(stored))
    }
  }, [])

  const { gameState, isLoading: loadingState } = useGameState(gameId);

  const handleExitGame = () => {
    localStorage.removeItem(LS_GAME_ID)
    setGameId(null)
  }

  if (gameId) {
    // Only show full-page loader on the very first load (no state yet).
    // Once we have gameState, background polls update silently.
    if (!gameState && loadingState) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Syncing Game State...</p>
                </div>
            </div>
        )
    }

    let content = <CombatDashboard />;
    let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "outline";
    let statusText = "Active";

    if (gameState?.phase === "Setup") {
        if (gameState.isMyCommit) {
            content = (
                <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary/50" />
                    <div className="text-center space-y-2">
                        <h2 className="text-xl font-bold">Fleet Deployed</h2>
                        <p className="text-muted-foreground">Waiting for opponent to commit their fleet...</p>
                        <p className="text-xs text-muted-foreground/50">Game #{gameId}</p>
                    </div>
                </div>
            );
            statusText = "Waiting for Opponent";
            badgeVariant = "secondary";
        } else {
            content = <ShipPlacement />;
            statusText = "Setup Phase";
            badgeVariant = "secondary";
        }
    } else if (gameState?.phase === "Finished") {
        statusText = "Game Over";
        badgeVariant = "destructive";
        // content = <CombatDashboard /> (already set)
    }

    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-card px-4 py-2 flex justify-between items-center">
             <div className="flex items-center gap-2">
                <Anchor className="h-5 w-5 text-primary" />
                <span className="font-bold text-foreground">Dark Waters</span>
                <Badge variant={badgeVariant}>Game #{gameId} • {statusText}</Badge>
             </div>
             <Button variant="ghost" size="sm" onClick={handleExitGame} className="text-muted-foreground hover:text-destructive">
                <LogOut className="h-4 w-4 mr-2" />
                Exit to Lobby
             </Button>
        </div>
        {content}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="mb-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
          <Anchor className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dark Waters</h1>
        <p className="mt-2 text-muted-foreground">Starknet Tactical Naval Warfare</p>
      </div>

      {!isConnected ? (
        <div className="text-center">
            <p className="text-sm text-muted-foreground mb-4">Connect your wallet to enter the lobby.</p>
            {/* Wallet button is handled in layout/nav usually, but text implies it's required */}
        </div>
      ) : (
        <LobbyInterface onJoin={(id) => {
            localStorage.setItem(LS_GAME_ID, String(id))
            setGameId(id)
        }} />
      )}
    </div>
  )
}

function LobbyInterface({ onJoin }: { onJoin: (id: number) => void }) {
    const { address } = useWallet()
    const { spawnGame, isLoading } = useGameActions()
    const { games, isLoading: loadingGames, refresh } = useMyGames()
    const { toast } = useToast()
    const [opponent, setOpponent] = useState("")
    const [activeTab, setActiveTab] = useState("host")
    const [fundedChecklist, setFundedChecklist] = useState(false)

    useEffect(() => {
        setFundedChecklist(localStorage.getItem(LS_ONBOARDING_FUNDED) === "true")
    }, [])

    const handleSpawn = async () => {
        if (!opponent) return;
        try {
            const res = await spawnGame(opponent);
            if (res && res.receipt) {
                 // Event parsing logic from original lobby.tsx
                 // Or we just wait for it to appear in "My Games" list?
                 // Better to parse immediately for UX.

                // Quick hack: assume success and wait for user to find it in "My Games" or parse receipt
                // Re-using the robust parsing logic from original lobby is best.

                const PROBABLE_SELECTOR = "0x1c93f6e4703ae90f75338f29bffbe9c1662200cee981f49afeec26e892debcd"
                const receipt = res.receipt as any;
                let newId = 0;
                for (const event of receipt.events) {
                   if (event.keys?.[0]?.toLowerCase() === PROBABLE_SELECTOR.toLowerCase() && event.data.length >= 2) {
                       const parsed = Number(event.data[1])
                       if (parsed > 0 && parsed < 2_000_000_000) { newId = parsed; break; }
                   }
                }

                if (newId) {
                    toast({ title: "Game Created!", description: `Game #${newId} spawned.` });
                    onJoin(newId);
                } else {
                    toast({ title: "Game Created", description: "Check 'My Games' tab." });
                    setActiveTab("join");
                }
            }
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    }

    const copyAddress = () => {
        if(address) {
            navigator.clipboard.writeText(address);
            toast({ title: "Copied", description: "Address copied to clipboard" });
        }
    }

    return (
        <Card className="w-full max-w-md">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="p-6 pb-0">
                    <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="host">Host Game</TabsTrigger>
                        <TabsTrigger value="join">My Games</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="host" className="p-6 pt-4 space-y-4">
                    <div className="space-y-4 text-center">
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-left">
                            <p className="text-xs font-semibold text-foreground">First-time Checklist</p>
                            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                                <li>1. Copy your Cartridge address below.</li>
                                <li>2. Fund it with Sepolia STRK from Ready or Braavos.</li>
                                <li>3. Confirm funding before spawning your first game.</li>
                            </ul>
                            <Button
                              variant={fundedChecklist ? "default" : "outline"}
                              size="sm"
                              className="mt-3 h-7 text-xs"
                              onClick={() => {
                                const next = !fundedChecklist
                                setFundedChecklist(next)
                                localStorage.setItem(LS_ONBOARDING_FUNDED, next ? "true" : "false")
                              }}
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                              {fundedChecklist ? "Funding Verified" : "Mark Funding Complete"}
                            </Button>
                        </div>

                        <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                            <p className="text-xs font-medium text-muted-foreground mb-2">YOUR ADMIRAL ADDRESS</p>
                            <button onClick={copyAddress} className="flex items-center justify-center gap-2 text-sm font-mono w-full hover:text-primary transition-colors">
                                {address?.slice(0, 8)}...{address?.slice(-6)}
                                <Copy className="h-3 w-3" />
                            </button>
                        </div>

                        <div className="space-y-2 text-left">
                            <label className="text-sm font-medium">Opponent Address</label>
                            <Input
                                placeholder="0x..."
                                value={opponent}
                                onChange={(e) => setOpponent(e.target.value)}
                                className="font-mono"
                            />
                            <p className="text-xs text-muted-foreground">Share your address with a friend, then paste theirs here.</p>
                        </div>

                        <Button className="w-full" onClick={handleSpawn} disabled={!opponent || isLoading || !fundedChecklist}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sword className="mr-2 h-4 w-4" />}
                            Spawn Game
                        </Button>
                        {!fundedChecklist && (
                          <p className="text-xs text-amber-300">
                            Complete funding checklist to enable spawning.
                          </p>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="join" className="p-6 pt-4">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-muted-foreground">Your Games</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => refresh()}
                            disabled={loadingGames}
                        >
                            <RefreshCw className={`h-4 w-4 ${loadingGames ? "animate-spin" : ""}`} />
                        </Button>
                    </div>
                    <ScrollArea className="h-[300px] w-full rounded-md border p-4">
                        {loadingGames ? (
                            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                        ) : games.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">No active games found.</div>
                        ) : (
                            <div className="space-y-3">
                                {games.map((g) => (
                                    <div key={g.gameId} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors" onClick={() => onJoin(g.gameId)}>
                                        <div>
                                            <div className="font-bold text-sm">Game #{g.gameId}</div>
                                            <div className="text-xs text-muted-foreground font-mono">Vs: {g.opponent.slice(0,6)}...{g.opponent.slice(-4)}</div>
                                        </div>
                                        <Button size="sm" variant="ghost"><Sword className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </TabsContent>
            </Tabs>
        </Card>
    )
}
