"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAccount } from "@starknet-react/core"
import { Amount, fromAddress } from "starkzap"
import {
  Anchor,
  Bot,
  CheckCircle2,
  Compass,
  Copy,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Sword,
  Waves,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useWallet } from "@/components/wallet-provider"
import { ShipPlacement } from "@/components/placement/ship-placement"
import { CombatDashboard } from "@/components/combat/combat-dashboard"
import { useToast } from "@/hooks/use-toast"
import { useGameState, useMyGames, useSpawnedGames } from "@/hooks/useGameState"
import { useGameActions } from "@/src/hooks/useGameActions"
import { formatTokenAmountFromUnits } from "@/src/utils/token-amount"
import {
  STAKE_TOKEN_OPTIONS,
  getStakeToken,
  getStakeTokenByAddress,
  type StakeTokenSymbol,
} from "@/src/lib/stake-token"
import { createStarkzapWallet } from "@/src/lib/starkzap-wallet-adapter"
import { SEPOLIA_CONFIG } from "@/src/config/sepolia-config"
import { cn } from "@/lib/utils"

const LS_GAME_ID = "dark-waters-gameId"
const LS_ONBOARDING_FUNDED = "dark-waters-onboarding-funded"

type CanonicalStage = "Lobby" | "Placement" | "Combat" | "Debrief"

function truncateAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

function sameAddress(left: string, right: string): boolean {
  try {
    return BigInt(left) === BigInt(right)
  } catch {
    return left.toLowerCase() === right.toLowerCase()
  }
}

function resolveStage(gameId: number | null, phase: "Setup" | "Playing" | "Finished" | null): CanonicalStage {
  if (!gameId) return "Lobby"
  if (phase === "Finished") return "Debrief"
  if (phase === "Playing") return "Combat"
  return "Placement"
}

function StageRail({ stage }: { stage: CanonicalStage }) {
  const steps: Array<{ id: CanonicalStage; label: string; detail: string }> = [
    { id: "Lobby", label: "Lobby", detail: "Match setup" },
    { id: "Placement", label: "Placement", detail: "Commit fleet" },
    { id: "Combat", label: "Combat", detail: "Commit + reveal strikes" },
    { id: "Debrief", label: "Debrief", detail: "Payout and archive" },
  ]

  const currentIndex = steps.findIndex((entry) => entry.id === stage)

  return (
    <section className="rounded-xl border border-border/70 bg-card/70 p-3 shadow-[0_12px_40px_rgba(2,22,35,0.28)] backdrop-blur-sm">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const completed = index < currentIndex
          const active = index === currentIndex
          return (
            <div
              key={step.id}
              className={cn(
                "rounded-lg border px-3 py-2 transition-colors",
                completed && "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
                active && "border-cyan-500/40 bg-cyan-500/10 text-cyan-100",
                !completed && !active && "border-border/70 bg-background/40 text-muted-foreground"
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{step.label}</p>
              <p className="mt-1 text-xs opacity-90">{step.detail}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function CommandWaitingPanel({
  gameId,
  waitingDescription,
  canAttemptStakeCancel,
  isActionLoading,
  onCancelStakedGame,
}: {
  gameId: number
  waitingDescription: string
  canAttemptStakeCancel: boolean
  isActionLoading: boolean
  onCancelStakedGame: () => Promise<void>
}) {
  return (
    <Card className="border-border/70 bg-card/80 shadow-[0_20px_50px_rgba(2,22,35,0.28)]">
      <CardContent className="flex min-h-[340px] flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/10">
          <Loader2 className="h-7 w-7 animate-spin text-cyan-200" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Fleet commitment transmitted</h2>
          <p className="text-sm text-muted-foreground">{waitingDescription}</p>
          <p className="text-xs text-muted-foreground/80">Game #{gameId}</p>
        </div>

        {canAttemptStakeCancel && (
          <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-left">
            <p className="text-xs text-amber-100/90">
              If both stakes are locked and no board is committed by either player, cancel after timeout to refund both players.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 border-amber-400/40 text-amber-100 hover:bg-amber-400/10"
              onClick={() => onCancelStakedGame()}
              disabled={isActionLoading}
            >
              {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel Staked Match (Post-timeout)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function LobbyStation({ onJoin }: { onJoin: (id: number) => void }) {
  const { address } = useWallet()
  const { account } = useAccount()
  const { toast } = useToast()
  const { spawnGame, spawnOpenGame, spawnOpenGameWithStake, engageGame, isLoading } = useGameActions()
  const { games: myGames, isLoading: loadingGames, refresh } = useMyGames()
  const {
    games: spawnedGames,
    isLoading: loadingSpawnedGames,
    refresh: refreshSpawnedGames,
  } = useSpawnedGames()

  const starkzapWallet = useMemo(() => createStarkzapWallet(account), [account])

  const [activeTab, setActiveTab] = useState("spawned")
  const [fundedChecklist, setFundedChecklist] = useState(false)
  const [hostMode, setHostMode] = useState<"open" | "bot">("open")
  const [isStakedMatch, setIsStakedMatch] = useState(false)
  const [stakeToken, setStakeToken] = useState<StakeTokenSymbol>("STRK")
  const [stakeAmount, setStakeAmount] = useState("0.10")
  const [isSpawning, setIsSpawning] = useState(false)
  const [engagingGameId, setEngagingGameId] = useState<number | null>(null)
  const botAddress = useMemo(() => SEPOLIA_CONFIG.BOT_ADDRESS.trim(), [])

  useEffect(() => {
    setFundedChecklist(localStorage.getItem(LS_ONBOARDING_FUNDED) === "true")
  }, [])

  const copyAddress = useCallback(async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    toast({ title: "Address copied", description: "Commander wallet address copied." })
  }, [address, toast])

  const handleSpawn = useCallback(async () => {
    if (isSpawning) return
    setIsSpawning(true)

    try {
      const tokenConfig = STAKE_TOKEN_OPTIONS[stakeToken]
      let result:
        | Awaited<ReturnType<typeof spawnGame>>
        | Awaited<ReturnType<typeof spawnOpenGame>>
        | Awaited<ReturnType<typeof spawnOpenGameWithStake>>

      if (hostMode === "bot") {
        if (!botAddress) {
          toast({
            title: "Bot unavailable",
            description: "Set NEXT_PUBLIC_SEPOLIA_BOT_ADDRESS to enable Play vs Bot mode.",
            variant: "destructive",
          })
          return
        }

        result = await spawnGame(botAddress)
      } else if (isStakedMatch) {
        const token = getStakeToken(stakeToken)
        if (!token || !tokenConfig.address) {
          toast({
            title: "Token unavailable",
            description: `Set NEXT_PUBLIC_SEPOLIA_${stakeToken}_TOKEN_ADDRESS before creating staked games.`,
            variant: "destructive",
          })
          return
        }

        if (!starkzapWallet) {
          toast({
            title: "Wallet not ready",
            description: "Reconnect wallet and retry to approve stake amount.",
            variant: "destructive",
          })
          return
        }

        let stakeAmountValue: Amount
        try {
          stakeAmountValue = Amount.parse(stakeAmount, token)
        } catch {
          toast({
            title: "Invalid stake",
            description: `Enter a valid ${tokenConfig.label} amount with up to ${tokenConfig.decimals} decimals.`,
            variant: "destructive",
          })
          return
        }

        if (stakeAmountValue.toBase() <= BigInt(0)) {
          toast({
            title: "Invalid stake",
            description: "Stake amount must be greater than zero.",
            variant: "destructive",
          })
          return
        }

        toast({
          title: "Approving token",
          description: `Authorizing ${tokenConfig.label} for escrow lock.`,
        })

        const approveTx = await starkzapWallet
          .tx()
          .approve(token, fromAddress(SEPOLIA_CONFIG.ACTIONS_ADDRESS), stakeAmountValue)
          .send()
        await approveTx.wait()

        result = await spawnOpenGameWithStake(token.address, stakeAmountValue.toBase().toString())
      } else {
        result = await spawnOpenGame()
      }

      if (!result?.receipt) return

      const EVENT_EMITTED_SELECTOR =
        "0x1c93f6e4703ae90f75338f29bffbe9c1662200cee981f49afeec26e892debcd"

      let createdGameId = 0
      const receipt = result.receipt as any
      for (const event of receipt.events ?? []) {
        if (
          event.keys?.[0]?.toLowerCase() === EVENT_EMITTED_SELECTOR.toLowerCase() &&
          Array.isArray(event.data) &&
          event.data.length >= 2
        ) {
          const parsed = Number(event.data[1])
          if (parsed > 0 && parsed < 2_000_000_000) {
            createdGameId = parsed
            break
          }
        }
      }

      if (!createdGameId) {
        toast({
          title: "Game spawned",
          description:
            hostMode === "bot"
              ? "Bot duel submitted. Refresh your games list to continue."
              : "Open game submitted. Refresh spawned logs to engage.",
        })
        refreshSpawnedGames()
        refresh()
        setActiveTab(hostMode === "bot" ? "join" : "spawned")
        return
      }

      if (hostMode === "bot") {
        toast({
          title: "Bot duel created",
          description: `Game #${createdGameId} started. You are now facing the bot.`,
        })
        refreshSpawnedGames()
        refresh()
        setActiveTab("join")
        onJoin(createdGameId)
        return
      }

      toast({
        title: "Game spawned",
        description: isStakedMatch
          ? `Game #${createdGameId} added to Spawned Games with ${stakeAmount} ${tokenConfig.label} stake per player.`
          : `Game #${createdGameId} added to Spawned Games.`,
      })
      refreshSpawnedGames()
      refresh()
      setActiveTab("spawned")
    } catch (error: any) {
      const message = error?.message ?? "Transaction failed"
      toast({
        title: "Failed to spawn game",
        description: message.includes("u256_sub Overflow")
          ? "Insufficient token balance/allowance. Confirm funds and retry once approval settles."
          : message,
        variant: "destructive",
      })
    } finally {
      setIsSpawning(false)
    }
  }, [
    botAddress,
    hostMode,
    isSpawning,
    isStakedMatch,
    onJoin,
    spawnGame,
    spawnOpenGame,
    spawnOpenGameWithStake,
    stakeAmount,
    stakeToken,
    starkzapWallet,
    toast,
    refreshSpawnedGames,
    refresh,
  ])

  const handleEngage = useCallback(
    async (id: number) => {
      if (engagingGameId !== null) return
      setEngagingGameId(id)

      try {
        const result = await engageGame(id)
        if (!result) throw new Error("Connect wallet before engaging a game.")

        toast({
          title: "Game engaged",
          description: `You joined Game #${id}. Proceed to placement and commit your fleet.`,
        })
        refreshSpawnedGames()
        refresh()
        onJoin(id)
      } catch (error) {
        toast({
          title: "Engage failed",
          description: error instanceof Error ? error.message : "Transaction failed.",
          variant: "destructive",
        })
      } finally {
        setEngagingGameId(null)
      }
    },
    [engagingGameId, engageGame, toast, refreshSpawnedGames, refresh, onJoin]
  )

  return (
    <Card className="border-border/70 bg-card/80 shadow-[0_20px_55px_rgba(2,22,35,0.32)]">
      <CardContent className="p-4 sm:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/90">Command Lobby</p>
              <p className="text-xs text-muted-foreground">Host a match or resume an existing operation.</p>
            </div>
            <TabsList className="grid w-[320px] grid-cols-3">
              <TabsTrigger value="host">Host</TabsTrigger>
              <TabsTrigger value="spawned">Spawned</TabsTrigger>
              <TabsTrigger value="join">My Games</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="host" className="space-y-4">
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-100/90">
              <p className="font-semibold uppercase tracking-[0.12em]">First-time checklist</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>1. Copy your Cartridge address.</li>
                <li>2. Fund it with Sepolia STRK.</li>
                <li>3. Mark funding complete before spawning.</li>
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
                {fundedChecklist ? "Funding verified" : "Mark funding complete"}
              </Button>
            </div>

            <div className="rounded-lg border border-border/70 bg-background/50 p-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Commander Address</p>
              <button
                onClick={copyAddress}
                className="mt-1 flex items-center gap-2 font-mono text-sm text-foreground transition-colors hover:text-cyan-200"
              >
                {address ? truncateAddress(address) : "Not connected"}
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="rounded-lg border border-border/70 bg-background/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Match Type</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={hostMode === "open" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setHostMode("open")}
                >
                  <Waves className="mr-2 h-3.5 w-3.5" />
                  Open Match
                </Button>
                <Button
                  type="button"
                  variant={hostMode === "bot" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setHostMode("bot")
                    setIsStakedMatch(false)
                  }}
                >
                  <Bot className="mr-2 h-3.5 w-3.5" />
                  Play vs Bot
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {hostMode === "open"
                  ? "Open match creates a public game entry in Spawned Games."
                  : "Bot match creates a direct game against your configured bot wallet (no stake)."}
              </p>
              {hostMode === "bot" && !botAddress && (
                <p className="mt-2 text-xs text-amber-200">
                  Configure NEXT_PUBLIC_SEPOLIA_BOT_ADDRESS to enable bot duels.
                </p>
              )}
            </div>

            {hostMode === "open" && (
              <div className="space-y-3 rounded-lg border border-border/70 bg-background/40 p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={isStakedMatch}
                    onChange={(event) => setIsStakedMatch(event.target.checked)}
                    className="h-4 w-4 rounded border-border bg-background"
                  />
                  Enable staked match
                </label>

                {isStakedMatch && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={stakeToken}
                        onChange={(event) => setStakeToken(event.target.value as StakeTokenSymbol)}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="STRK">STRK</option>
                        <option value="WBTC">WBTC</option>
                      </select>
                      <Input
                        value={stakeAmount}
                        onChange={(event) => setStakeAmount(event.target.value)}
                        placeholder="0.10"
                        inputMode="decimal"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Each player locks this amount. Winner takes the combined pool.</p>
                    {!getStakeToken(stakeToken) && (
                      <p className="text-xs text-amber-200">
                        Configure token address: NEXT_PUBLIC_SEPOLIA_{stakeToken}_TOKEN_ADDRESS
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleSpawn}
              disabled={
                isLoading ||
                isSpawning ||
                !fundedChecklist ||
                (hostMode === "open" && isStakedMatch && !getStakeToken(stakeToken)) ||
                (hostMode === "bot" && !botAddress)
              }
            >
              {isLoading || isSpawning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : hostMode === "bot" ? (
                <Bot className="mr-2 h-4 w-4" />
              ) : (
                <Sword className="mr-2 h-4 w-4" />
              )}
              {hostMode === "bot"
                ? "Start Bot Duel"
                : isStakedMatch
                ? "Spawn Open Staked Match"
                : "Spawn Open Match"}
            </Button>
            {!fundedChecklist && (
              <p className="text-xs text-amber-200/90">Complete funding checklist to enable spawn.</p>
            )}
          </TabsContent>

          <TabsContent value="spawned" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Spawned Games Log</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => refreshSpawnedGames()}
                disabled={loadingSpawnedGames}
              >
                <RefreshCw className={cn("h-4 w-4", loadingSpawnedGames && "animate-spin")} />
              </Button>
            </div>

            <ScrollArea className="h-[320px] rounded-md border border-border/70 p-3">
              {loadingSpawnedGames ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : spawnedGames.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No spawned games right now. Spawn one from Host.
                </div>
              ) : (
                <div className="space-y-2">
                  {spawnedGames.map((game) => {
                    const tokenMeta = getStakeTokenByAddress(game.stakeToken)
                    const stakeLabel =
                      game.isStakedMatch && tokenMeta
                        ? `${formatTokenAmountFromUnits(game.stakeAmount, tokenMeta.option.decimals)} ${tokenMeta.option.label}`
                        : "No stake"

                    return (
                      <div
                        key={game.gameId}
                        className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 p-3"
                      >
                        <div>
                          <p className="text-sm font-semibold">Game #{game.gameId}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            Host {truncateAddress(game.host)}
                          </p>
                          <p className="mt-1 text-[11px] text-cyan-100/80">{stakeLabel}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {game.isMine ? (
                            <Badge variant="outline" className="border-amber-500/30 text-amber-100">
                              Awaiting Engage
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleEngage(game.gameId)}
                              disabled={engagingGameId !== null}
                              className="min-w-[88px]"
                            >
                              {engagingGameId === game.gameId ? (
                                <>
                                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                  Engaging
                                </>
                              ) : (
                                "Engage"
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="join" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Your active matches</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => refresh()}
                disabled={loadingGames}
              >
                <RefreshCw className={cn("h-4 w-4", loadingGames && "animate-spin")} />
              </Button>
            </div>

            <ScrollArea className="h-[320px] rounded-md border border-border/70 p-3">
              {loadingGames ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : myGames.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">No active matches detected.</div>
              ) : (
                <div className="space-y-2">
                  {myGames.map((game) => (
                    <button
                      key={game.gameId}
                      onClick={() => onJoin(game.gameId)}
                      className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-background/50 p-3 text-left transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/5"
                    >
                      <div>
                        <p className="text-sm font-semibold">Game #{game.gameId}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          vs {botAddress && sameAddress(game.opponent, botAddress) ? "BOT" : truncateAddress(game.opponent)}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-cyan-500/30 text-cyan-100">
                        Engage
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

export default function Page() {
  const { isConnected } = useWallet()
  const { toast } = useToast()
  const { cancelStakedGame, claimTimeoutWin, isLoading: isActionLoading } = useGameActions()

  const [gameId, setGameId] = useState<number | null>(null)
  const [isClaimingTimeout, setIsClaimingTimeout] = useState(false)
  const [isLobbyOperationsOpen, setIsLobbyOperationsOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(LS_GAME_ID)
    if (stored) setGameId(Number(stored))
  }, [])

  const { gameState, isLoading: loadingState } = useGameState(gameId)

  const stage = resolveStage(gameId, gameState?.phase ?? null)

  const stakeTokenMeta = getStakeTokenByAddress(gameState?.stakeToken)
  const stakeDisplay =
    gameState?.isStakedMatch && gameState.stakeAmount
      ? `${formatTokenAmountFromUnits(
          gameState.stakeAmount,
          stakeTokenMeta?.option.decimals ?? 0
        )} ${stakeTokenMeta?.option.label ?? "TOKEN"}`
      : null
  const payoutTxHash = gameState?.stakeSettlementTxHash ?? null
  const payoutTxUrl = payoutTxHash ? `https://sepolia.voyager.online/tx/${payoutTxHash}` : null

  const handleExitGame = useCallback(() => {
    localStorage.removeItem(LS_GAME_ID)
    setGameId(null)
  }, [])

  const handleJoinGame = useCallback((id: number) => {
    localStorage.setItem(LS_GAME_ID, String(id))
    setGameId(id)
  }, [])

  const handleCancelStakedGame = useCallback(async () => {
    if (!gameId) return
    try {
      const result = await cancelStakedGame(gameId)
      if (!result) throw new Error("Connect wallet before submitting cancellation.")
      toast({
        title: "Cancellation submitted",
        description:
          "If setup timeout elapsed and neither board was committed, both stakes will refund.",
      })
    } catch (error) {
      toast({
        title: "Cancellation failed",
        description: error instanceof Error ? error.message : "Transaction failed.",
        variant: "destructive",
      })
    }
  }, [cancelStakedGame, gameId, toast])

  const handleClaimTimeoutWin = useCallback(async () => {
    if (!gameId) return
    setIsClaimingTimeout(true)
    try {
      const result = await claimTimeoutWin(gameId)
      if (!result) throw new Error("Connect wallet before submitting timeout claim.")
      toast({
        title: "Timeout claim submitted",
        description: "If timeout conditions are met on-chain, this match will finalize.",
      })
    } catch (error) {
      toast({
        title: "Timeout claim failed",
        description: error instanceof Error ? error.message : "Transaction failed.",
        variant: "destructive",
      })
    } finally {
      setIsClaimingTimeout(false)
    }
  }, [claimTimeoutWin, gameId, toast])

  const waitingDescription =
    gameState?.isStakedMatch && !gameState.opponentStakeLocked
      ? "Awaiting opponent stake lock and board commitment..."
      : "Awaiting opponent fleet commitment..."

  const canAttemptStakeCancel =
    gameState?.phase === "Setup" &&
    gameState.isStakedMatch &&
    gameState.myStakeLocked &&
    gameState.opponentStakeLocked &&
    !gameState.isMyCommit &&
    !gameState.opponentCommitted &&
    !gameState.stakeSettled
  const isLobbyStage = stage === "Lobby"
  const showMobileCommandDock = Boolean(gameId)

  if (gameId && !gameState && loadingState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-2 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-200" />
          <p className="text-sm text-muted-foreground">Synchronizing game state...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          isLobbyStage
            ? "bg-[radial-gradient(circle_at_20%_15%,rgba(34,211,238,0.1),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.09),transparent_34%)]"
            : "bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_85%_8%,rgba(59,130,246,0.18),transparent_30%),radial-gradient(circle_at_50%_90%,rgba(14,116,144,0.2),transparent_38%)]"
        )}
      />
      <div
        className={cn(
          "command-grid pointer-events-none absolute inset-0",
          isLobbyStage ? "opacity-15" : "opacity-40"
        )}
      />

      <div
        className={cn(
          "relative mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 md:px-5 md:py-6",
          showMobileCommandDock && "pb-28 md:pb-6"
        )}
      >
        <section className="rounded-xl border border-border/70 bg-card/75 p-4 shadow-[0_20px_55px_rgba(2,22,35,0.34)] backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/90">Dark Waters Command</p>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-foreground">
                <Anchor className="h-5 w-5 text-cyan-200" />
                Naval Combat Console
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Canonical flow active: Lobby → Placement → Combat.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-cyan-500/30 text-cyan-100">
                <Compass className="mr-1 h-3.5 w-3.5" />
                {stage}
              </Badge>
              {gameId && <Badge variant="secondary">Game #{gameId}</Badge>}
              {!isLobbyStage && stakeDisplay && <Badge variant="outline">Stake {stakeDisplay}</Badge>}
              {!isLobbyStage &&
                gameState?.stakeSettled && (
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-200">
                    <Waves className="mr-1 h-3.5 w-3.5" />
                    Stake Settled
                  </Badge>
                )}
              {!isLobbyStage && payoutTxUrl && (
                <a href={payoutTxUrl} target="_blank" rel="noopener noreferrer">
                  <Badge variant="outline" className="cursor-pointer border-cyan-500/30 text-cyan-100 hover:bg-cyan-500/10">
                    Payout Tx
                  </Badge>
                </a>
              )}

              {!isLobbyStage && gameState?.isActive && gameId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden md:inline-flex"
                  onClick={handleClaimTimeoutWin}
                  disabled={isClaimingTimeout}
                >
                  {isClaimingTimeout && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Claim Timeout
                </Button>
              )}
              {!isLobbyStage && gameId && (
                <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={handleExitGame}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Exit Match
                </Button>
              )}
            </div>
          </div>
        </section>

        {!isLobbyStage && <StageRail stage={stage} />}

        {!isConnected && !isLobbyStage && (
          <Card className="border-amber-500/30 bg-amber-500/10">
            <CardContent className="flex items-center gap-2 p-3 text-sm text-amber-100">
              <ShieldAlert className="h-4 w-4" />
              Connect wallet from the top bar to access the command flow.
            </CardContent>
          </Card>
        )}

        {isLobbyStage && (
          <Card className="border-border/70 bg-card/80 shadow-[0_20px_55px_rgba(2,22,35,0.32)]">
            <CardContent className="space-y-4 p-5 sm:p-7">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100/90">Calm Command Deck</p>
                <h2 className="text-xl font-semibold text-foreground sm:text-2xl">One action to begin</h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Start a new match or resume an existing one. Advanced controls are grouped under Operations for a cleaner first view.
                </p>
              </div>

              {!isConnected && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                  Connect wallet from the top bar before spawning or joining a match.
                </div>
              )}

              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => setIsLobbyOperationsOpen(true)}
              >
                <Sword className="mr-2 h-4 w-4" />
                Start / Resume Match
              </Button>
            </CardContent>
          </Card>
        )}

        {stage === "Placement" && gameId && gameState?.isMyCommit && (
          <CommandWaitingPanel
            gameId={gameId}
            waitingDescription={waitingDescription}
            canAttemptStakeCancel={Boolean(canAttemptStakeCancel)}
            isActionLoading={isActionLoading}
            onCancelStakedGame={handleCancelStakedGame}
          />
        )}

        {stage === "Placement" && gameId && gameState && !gameState.isMyCommit && <ShipPlacement />}

        {(stage === "Combat" || stage === "Debrief") && gameId && <CombatDashboard />}

        {stage === "Debrief" && gameState && (
          <Card className="border-border/70 bg-card/80">
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/90">Debrief</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Match finalized. {gameState.winner ? `Winner: ${truncateAddress(gameState.winner)}.` : "No winner recorded."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {isLobbyStage && (
        <Sheet open={isLobbyOperationsOpen} onOpenChange={setIsLobbyOperationsOpen}>
          <SheetContent side="bottom" className="h-[92vh] border-border/70 bg-background/95 p-0 backdrop-blur-sm">
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-border/70 px-4 py-3 text-left">
                <SheetTitle className="text-base">Operations</SheetTitle>
                <SheetDescription className="text-xs">
                  Full lobby controls: create, configure, and resume matches.
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-3 py-3 md:px-4">
                <div className="space-y-3">
                  <StageRail stage={stage} />
                  {!isConnected && (
                    <Card className="border-amber-500/30 bg-amber-500/10">
                      <CardContent className="flex items-center gap-2 p-3 text-sm text-amber-100">
                        <ShieldAlert className="h-4 w-4" />
                        Connect wallet from the top bar to access full command controls.
                      </CardContent>
                    </Card>
                  )}
                  <LobbyStation
                    onJoin={(id) => {
                      handleJoinGame(id)
                      setIsLobbyOperationsOpen(false)
                    }}
                  />
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {showMobileCommandDock && (
        <div className="fixed inset-x-3 bottom-3 z-40 md:hidden">
          <div className="rounded-xl border border-cyan-500/30 bg-background/90 p-2 shadow-[0_16px_45px_rgba(2,22,35,0.52)] backdrop-blur-md">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/90">
              Command Actions
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-10"
                onClick={handleClaimTimeoutWin}
                disabled={!gameState?.isActive || isClaimingTimeout}
              >
                {isClaimingTimeout && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Claim Timeout
              </Button>
              <Button variant="ghost" className="h-10" onClick={handleExitGame}>
                <LogOut className="mr-2 h-4 w-4" />
                Exit Match
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
