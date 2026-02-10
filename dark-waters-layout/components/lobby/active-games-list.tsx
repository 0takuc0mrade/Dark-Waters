"use client"

import { Swords, Clock, Trophy, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"

export interface Game {
  id: string
  matchNumber: number
  opponent: string
  status: "your-turn" | "waiting" | "victory"
  lastAction: string
  timeAgo: string
}

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const STATUS_CONFIG = {
  "your-turn": {
    label: "Your Turn",
    icon: Swords,
    badgeClass: "border-transparent bg-accent/15 text-accent",
    dotClass: "bg-accent",
  },
  waiting: {
    label: "Waiting for Opponent",
    icon: Clock,
    badgeClass: "border-transparent bg-yellow-500/15 text-yellow-400",
    dotClass: "bg-yellow-400",
  },
  victory: {
    label: "Victory",
    icon: Trophy,
    badgeClass: "border-transparent bg-amber-500/15 text-amber-400",
    dotClass: "bg-amber-400",
  },
}

interface ActiveGamesListProps {
  games: Game[]
  onSelectGame: (game: Game) => void
}

export function ActiveGamesList({ games, onSelectGame }: ActiveGamesListProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Swords className="h-4 w-4 text-primary" />
          Active Operations
          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary">
            {games.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="space-y-2">
            {games.map((game) => {
              const config = STATUS_CONFIG[game.status]
              const StatusIcon = config.icon
              return (
                <Tooltip key={game.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onSelectGame(game)}
                      className="group flex w-full items-center gap-3 rounded-lg border bg-secondary/30 px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Resume Match #${game.matchNumber} against ${truncateAddress(game.opponent)} - ${config.label}`}
                    >
                      {/* Status indicator dot */}
                      <span className={`h-2 w-2 shrink-0 rounded-full ${config.dotClass}`} />

                      {/* Match info */}
                      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {"Match #"}{game.matchNumber}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {"vs "}
                            <span className="font-mono">{truncateAddress(game.opponent)}</span>
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground sm:ml-auto sm:mr-3">
                          {game.lastAction}
                        </p>
                      </div>

                      {/* Status badge */}
                      <Badge className={`shrink-0 gap-1.5 ${config.badgeClass}`}>
                        <StatusIcon className="h-3 w-3" />
                        <span className="hidden sm:inline">{config.label}</span>
                      </Badge>

                      {/* Time + arrow */}
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-xs text-muted-foreground lg:inline">{game.timeAgo}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {"Click to resume Match #"}{game.matchNumber}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}
