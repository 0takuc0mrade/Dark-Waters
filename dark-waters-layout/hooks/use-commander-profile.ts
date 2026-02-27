"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { BattleLogEntry } from "@/components/combat/types"
import {
  buildCombatInsights,
  type CombatMedal,
  type MatchOutcome,
} from "@/src/utils/combat-analytics"

const LS_PROFILE_PREFIX = "dark-waters-commander-profile"
const SEASON_CARRYOVER_RATE = 0.25

interface CommanderProfileRecord {
  seasonId: string
  seasonLabel: string
  totalXp: number
  seasonXp: number
  carryOverXp: number
  matches: number
  wins: number
  losses: number
  draws: number
  awardedGameIds: number[]
  updatedAt: number
}

export interface MatchReward {
  gameId: number
  outcome: Exclude<MatchOutcome, null>
  xpGained: number
  levelBefore: number
  levelAfter: number
  rankBefore: string
  rankAfter: string
  medalsEarned: CombatMedal[]
  timestamp: number
}

export interface CommanderProfileView {
  seasonId: string
  seasonLabel: string
  totalXp: number
  seasonXp: number
  carryOverXp: number
  matches: number
  wins: number
  losses: number
  draws: number
  level: number
  rank: string
}

export interface CommanderProgression {
  level: number
  rank: string
  currentLevelXp: number
  nextLevelXp: number
  progressPercent: number
}

const RANK_TABLE = [
  { minLevel: 1, rank: "Cadet" },
  { minLevel: 3, rank: "Ensign" },
  { minLevel: 6, rank: "Lieutenant" },
  { minLevel: 10, rank: "Commander" },
  { minLevel: 15, rank: "Captain" },
  { minLevel: 22, rank: "Commodore" },
  { minLevel: 30, rank: "Rear Admiral" },
  { minLevel: 40, rank: "Fleet Admiral" },
]

function getSeasonInfo(now: Date = new Date()): { id: string; label: string } {
  const year = now.getUTCFullYear()
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1
  return {
    id: `${year}-Q${quarter}`,
    label: `${year} Q${quarter}`,
  }
}

function getProfileKey(address: string): string {
  return `${LS_PROFILE_PREFIX}:${address.toLowerCase()}`
}

function xpToNextLevel(level: number): number {
  return 120 + level * 45
}

function totalXpForLevel(level: number): number {
  let xp = 0
  for (let cursor = 1; cursor < level; cursor += 1) {
    xp += xpToNextLevel(cursor)
  }
  return xp
}

function getLevelFromTotalXp(totalXp: number): number {
  let level = 1
  let remaining = totalXp
  while (remaining >= xpToNextLevel(level)) {
    remaining -= xpToNextLevel(level)
    level += 1
    if (level > 99) break
  }
  return level
}

function getRankForLevel(level: number): string {
  let rank = RANK_TABLE[0].rank
  for (const entry of RANK_TABLE) {
    if (level >= entry.minLevel) rank = entry.rank
  }
  return rank
}

function sanitizeRecord(record: Partial<CommanderProfileRecord>): CommanderProfileRecord {
  const season = getSeasonInfo()
  return {
    seasonId: record.seasonId ?? season.id,
    seasonLabel: record.seasonLabel ?? season.label,
    totalXp: Math.max(0, Math.floor(record.totalXp ?? 0)),
    seasonXp: Math.max(0, Math.floor(record.seasonXp ?? 0)),
    carryOverXp: Math.max(0, Math.floor(record.carryOverXp ?? 0)),
    matches: Math.max(0, Math.floor(record.matches ?? 0)),
    wins: Math.max(0, Math.floor(record.wins ?? 0)),
    losses: Math.max(0, Math.floor(record.losses ?? 0)),
    draws: Math.max(0, Math.floor(record.draws ?? 0)),
    awardedGameIds: Array.isArray(record.awardedGameIds)
      ? record.awardedGameIds
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0)
          .slice(-80)
      : [],
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
  }
}

function applySeasonRollover(record: CommanderProfileRecord): CommanderProfileRecord {
  const season = getSeasonInfo()
  if (record.seasonId === season.id) return record
  const carryOverXp = Math.floor(record.seasonXp * SEASON_CARRYOVER_RATE)
  return {
    ...record,
    seasonId: season.id,
    seasonLabel: season.label,
    seasonXp: carryOverXp,
    carryOverXp,
    totalXp: record.totalXp + carryOverXp,
    updatedAt: Date.now(),
  }
}

function calculateMatchXp(
  outcome: Exclude<MatchOutcome, null>,
  entries: BattleLogEntry[]
): { xp: number; medalsEarned: CombatMedal[] } {
  const insights = buildCombatInsights(entries, outcome)
  const medalsEarned = insights.medals.filter((medal) => medal.unlocked)
  const outcomeBonus = outcome === "win" ? 150 : outcome === "draw" ? 90 : 55
  const xp =
    35 +
    outcomeBonus +
    insights.confirmedHits * 12 +
    insights.maxStreak * 10 +
    Math.round(insights.accuracy * 0.55) +
    medalsEarned.length * 25
  return { xp, medalsEarned }
}

function toProfileView(record: CommanderProfileRecord): CommanderProfileView {
  const level = getLevelFromTotalXp(record.totalXp)
  return {
    seasonId: record.seasonId,
    seasonLabel: record.seasonLabel,
    totalXp: record.totalXp,
    seasonXp: record.seasonXp,
    carryOverXp: record.carryOverXp,
    matches: record.matches,
    wins: record.wins,
    losses: record.losses,
    draws: record.draws,
    level,
    rank: getRankForLevel(level),
  }
}

function toProgression(profile: CommanderProfileView): CommanderProgression {
  const levelFloor = totalXpForLevel(profile.level)
  const nextLevel = profile.level + 1
  const nextLevelThreshold = totalXpForLevel(nextLevel)
  const needed = Math.max(1, nextLevelThreshold - levelFloor)
  const currentLevelXp = Math.max(0, profile.totalXp - levelFloor)
  return {
    level: profile.level,
    rank: profile.rank,
    currentLevelXp,
    nextLevelXp: needed,
    progressPercent: Math.max(0, Math.min(100, Math.round((currentLevelXp / needed) * 100))),
  }
}

export function useCommanderProfile(address?: string) {
  const [record, setRecord] = useState<CommanderProfileRecord | null>(null)
  const [lastReward, setLastReward] = useState<MatchReward | null>(null)

  useEffect(() => {
    if (!address) {
      setRecord(null)
      setLastReward(null)
      return
    }
    const key = getProfileKey(address)
    const season = getSeasonInfo()
    const baseRecord = sanitizeRecord({
      seasonId: season.id,
      seasonLabel: season.label,
    })

    const raw = localStorage.getItem(key)
    if (!raw) {
      setRecord(baseRecord)
      return
    }

    try {
      const parsed = sanitizeRecord(JSON.parse(raw) as Partial<CommanderProfileRecord>)
      const rolled = applySeasonRollover(parsed)
      localStorage.setItem(key, JSON.stringify(rolled))
      setRecord(rolled)
    } catch {
      setRecord(baseRecord)
      localStorage.setItem(key, JSON.stringify(baseRecord))
    }
  }, [address])

  const persistRecord = useCallback(
    (next: CommanderProfileRecord) => {
      if (!address) return
      localStorage.setItem(getProfileKey(address), JSON.stringify(next))
      setRecord(next)
    },
    [address]
  )

  const registerMatch = useCallback(
    (
      gameId: number | null,
      outcome: MatchOutcome,
      entries: BattleLogEntry[]
    ): MatchReward | null => {
      if (!address || !record || !gameId || !outcome) return null
      const withSeason = applySeasonRollover(record)
      if (withSeason.awardedGameIds.includes(gameId)) {
        if (lastReward?.gameId === gameId) return lastReward
        return null
      }

      const { xp, medalsEarned } = calculateMatchXp(outcome, entries)
      const levelBefore = getLevelFromTotalXp(withSeason.totalXp)
      const rankBefore = getRankForLevel(levelBefore)

      const nextTotalXp = withSeason.totalXp + xp
      const levelAfter = getLevelFromTotalXp(nextTotalXp)
      const rankAfter = getRankForLevel(levelAfter)

      const nextRecord: CommanderProfileRecord = {
        ...withSeason,
        totalXp: nextTotalXp,
        seasonXp: withSeason.seasonXp + xp,
        matches: withSeason.matches + 1,
        wins: withSeason.wins + (outcome === "win" ? 1 : 0),
        losses: withSeason.losses + (outcome === "lose" ? 1 : 0),
        draws: withSeason.draws + (outcome === "draw" ? 1 : 0),
        awardedGameIds: [...withSeason.awardedGameIds, gameId].slice(-80),
        updatedAt: Date.now(),
      }

      const reward: MatchReward = {
        gameId,
        outcome,
        xpGained: xp,
        levelBefore,
        levelAfter,
        rankBefore,
        rankAfter,
        medalsEarned,
        timestamp: Date.now(),
      }

      persistRecord(nextRecord)
      setLastReward(reward)
      return reward
    },
    [address, lastReward, persistRecord, record]
  )

  const profile = useMemo(() => (record ? toProfileView(record) : null), [record])
  const progression = useMemo(
    () => (profile ? toProgression(profile) : null),
    [profile]
  )

  return {
    profile,
    progression,
    lastReward,
    registerMatch,
  }
}
