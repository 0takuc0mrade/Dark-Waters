"use client"

import type { BattleLogEntry } from "@/components/combat/types"

export type MatchOutcome = "win" | "lose" | "draw" | null

export interface CombatMedal {
  id: string
  label: string
  description: string
  unlocked: boolean
}

export interface CombatInsights {
  playerShots: number
  enemyShots: number
  confirmedHits: number
  misses: number
  enemyHits: number
  enemyMisses: number
  accuracy: number
  evasiveRate: number
  activeStreak: number
  maxStreak: number
  commandXp: number
  objective: string
  medals: CombatMedal[]
}

export interface ReplayTimelineEntry {
  id: string
  type: "player" | "enemy"
  result: "hit" | "miss" | "sunk"
  message: string
  coordinate: string
  timestamp: number
  relativeSeconds: number
}

export interface CoordinatePoint {
  row: number
  col: number
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function parseCoordinateLabel(coordinate: string): CoordinatePoint | null {
  const normalized = coordinate.trim().toUpperCase()
  const match = normalized.match(/^([A-J])(10|[1-9])$/)
  if (!match) return null
  const row = match[1].charCodeAt(0) - 65
  const col = Number(match[2]) - 1
  if (row < 0 || row > 9 || col < 0 || col > 9) return null
  return { row, col }
}

export function buildCombatInsights(
  entries: BattleLogEntry[],
  gameOver: MatchOutcome
): CombatInsights {
  const playerShots = entries.filter((entry) => entry.type === "player")
  const enemyShots = entries.filter((entry) => entry.type === "enemy")

  const confirmedHits = playerShots.filter((entry) => entry.result !== "miss").length
  const misses = playerShots.length - confirmedHits
  const enemyHits = enemyShots.filter((entry) => entry.result !== "miss").length
  const enemyMisses = enemyShots.length - enemyHits

  const accuracy = playerShots.length
    ? clampPercent((confirmedHits / playerShots.length) * 100)
    : 0
  const evasiveRate = enemyShots.length
    ? clampPercent((enemyMisses / enemyShots.length) * 100)
    : 0

  let activeStreak = 0
  for (const entry of entries) {
    if (entry.type !== "player") continue
    if (entry.result === "miss") break
    activeStreak += 1
  }

  let maxStreak = 0
  let streakCursor = 0
  for (const entry of [...playerShots].reverse()) {
    if (entry.result === "miss") {
      streakCursor = 0
    } else {
      streakCursor += 1
      maxStreak = Math.max(maxStreak, streakCursor)
    }
  }

  const medals: CombatMedal[] = [
    {
      id: "first-hit",
      label: "First Hit",
      description: "Land your opening confirmed strike.",
      unlocked: confirmedHits >= 1,
    },
    {
      id: "deadeye",
      label: "Deadeye",
      description: "Maintain 60%+ accuracy over at least 5 shots.",
      unlocked: playerShots.length >= 5 && accuracy >= 60,
    },
    {
      id: "salvo-chain",
      label: "Salvo Chain",
      description: "Chain 3+ confirmed hits without a miss.",
      unlocked: maxStreak >= 3,
    },
    {
      id: "iron-hull",
      label: "Iron Hull",
      description: "Evade 70%+ of incoming fire across 4+ enemy shots.",
      unlocked: enemyShots.length >= 4 && evasiveRate >= 70,
    },
    {
      id: "finisher",
      label: "Finisher",
      description: "Win the match with 55%+ shot accuracy.",
      unlocked: gameOver === "win" && accuracy >= 55,
    },
  ]

  const commandXp = Math.min(
    100,
    confirmedHits * 9 + activeStreak * 8 + evasiveRate * 0.2 + (gameOver === "win" ? 16 : 0)
  )

  let objective = "Probe center sectors and look for pattern leaks."
  if (gameOver === "win") objective = "Victory secured. Queue next match and keep momentum."
  if (gameOver === "lose") objective = "Review misses in battle log and tighten opening pattern."
  if (gameOver === "draw") objective = "Timeout draw logged. Retry with tighter reveal timing."
  if (!gameOver && playerShots.length === 0) objective = "Open with your first salvo to establish tempo."
  if (!gameOver && playerShots.length >= 4 && accuracy < 45) {
    objective = "Accuracy below 45%. Shift away from low-value edge shots."
  }
  if (!gameOver && activeStreak >= 2) {
    objective = "Hit chain active. Continue pressure on nearby cells."
  }

  return {
    playerShots: playerShots.length,
    enemyShots: enemyShots.length,
    confirmedHits,
    misses,
    enemyHits,
    enemyMisses,
    accuracy,
    evasiveRate,
    activeStreak,
    maxStreak,
    commandXp,
    objective,
    medals,
  }
}

export function buildShotHeatmap(
  entries: BattleLogEntry[],
  source: "player" | "enemy"
): number[][] {
  const heatmap = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0))
  for (const entry of entries) {
    if (entry.type !== source) continue
    const point = parseCoordinateLabel(entry.coordinate)
    if (!point) continue
    heatmap[point.row][point.col] += 1
  }
  return heatmap
}

export function buildReplayTimeline(entries: BattleLogEntry[]): ReplayTimelineEntry[] {
  if (entries.length === 0) return []
  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp)
  const origin = sorted[0].timestamp
  return sorted.map((entry) => ({
    id: entry.id,
    type: entry.type,
    result: entry.result,
    message: entry.message,
    coordinate: entry.coordinate,
    timestamp: entry.timestamp,
    relativeSeconds: Math.max(0, Math.round((entry.timestamp - origin) / 1000)),
  }))
}
