"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWallet } from "@/components/wallet-provider"
import { useToast } from "@/hooks/use-toast"
import { RadarIllustration } from "@/components/lobby/radar-illustration"
import { CreateGameForm } from "@/components/lobby/create-game-form"
import { ActiveGamesList, type Game } from "@/components/lobby/active-games-list"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"

const SAMPLE_GAMES: Game[] = [
  {
    id: "1",
    matchNumber: 42,
    opponent: "0xFe9876543210AbCdEf1234567890aBcDeF123456",
    status: "your-turn",
    lastAction: "Enemy fleet moved to Sector 9",
    timeAgo: "2 min ago",
  },
  {
    id: "2",
    matchNumber: 38,
    opponent: "0xAb12Cd34Ef56789012345678901234567890AbCd",
    status: "waiting",
    lastAction: "You deployed scouts to Reef Delta",
    timeAgo: "15 min ago",
  },
  {
    id: "3",
    matchNumber: 31,
    opponent: "0x5678901234AbCdEf1234567890aBcDeF12345678",
    status: "victory",
    lastAction: "Enemy flagship destroyed",
    timeAgo: "1 hour ago",
  },
  {
    id: "4",
    matchNumber: 27,
    opponent: "0x9012345678901234AbCdEf1234567890aBcDeF12",
    status: "your-turn",
    lastAction: "Reinforcements arrived at Harbor Nine",
    timeAgo: "3 hours ago",
  },
]

type LobbyView = "list" | "create"

export function GameLobby() {
  const { isConnected, connect } = useWallet()
  const { toast } = useToast()
  const router = useRouter()
  const [view, setView] = useState<LobbyView>("list")
  const [games, setGames] = useState<Game[]>(SAMPLE_GAMES)

  const handleCreateGame = useCallback(
    (opponentAddress: string) => {
      const newGame: Game = {
        id: crypto.randomUUID(),
        matchNumber: Math.max(...games.map((g) => g.matchNumber), 0) + 1,
        opponent: opponentAddress,
        status: "waiting",
        lastAction: "Operation initiated",
        timeAgo: "Just now",
      }
      setGames((prev) => [newGame, ...prev])
      setView("list")
      toast({
        title: "Operation Created",
        description: `Match #${newGame.matchNumber} is live. Awaiting opponent.`,
      })
    },
    [games, toast]
  )

  const handleSelectGame = useCallback(
    (game: Game) => {
      toast({
        title: `Resuming Match #${game.matchNumber}`,
        description: "Loading tactical interface...",
      })
      router.push("/placement")
    },
    [toast, router]
  )

  // Not connected state
  if (!isConnected) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 lg:px-6">
        <div className="flex flex-col items-center justify-center py-12">
          <RadarIllustration />
          <h2 className="mt-8 text-balance text-center text-xl font-semibold tracking-tight text-foreground">
            Connect to access the lobby
          </h2>
          <p className="mt-2 max-w-sm text-pretty text-center text-sm leading-relaxed text-muted-foreground">
            Connect your wallet to view active operations and create new matches.
          </p>
          <Button onClick={connect} className="mt-6 gap-2">
            Connect Wallet
          </Button>
        </div>
      </div>
    )
  }

  // Create game form view
  if (view === "create") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 lg:px-6">
        <CreateGameForm
          onBack={() => setView("list")}
          onCreateGame={handleCreateGame}
        />
      </div>
    )
  }

  // Main lobby view
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
      <TooltipProvider>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">
                Game Lobby
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your active operations and matches
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setView("create")}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create New Game</span>
                  <span className="sm:hidden">New</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Start a new operation</TooltipContent>
            </Tooltip>
          </div>

          {/* Content: zero state or game list */}
          {games.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-4 py-16">
              <RadarIllustration />
              <h2 className="mt-8 text-balance text-center text-lg font-semibold text-foreground">
                No active signals found
              </h2>
              <p className="mt-2 max-w-sm text-pretty text-center text-sm leading-relaxed text-muted-foreground">
                {"Start a new operation?"}
              </p>
              <Button
                onClick={() => setView("create")}
                size="lg"
                className="mt-6 gap-2"
              >
                <Plus className="h-4 w-4" />
                Create New Game
              </Button>
            </div>
          ) : (
            <ActiveGamesList
              games={games}
              onSelectGame={handleSelectGame}
            />
          )}
        </div>
      </TooltipProvider>
    </div>
  )
}
