export const GRID_SIZE = 10
export const ROW_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]

export type CombatCellState = "empty" | "ship" | "hit" | "miss" | "pending"

export interface CombatCell {
  state: CombatCellState
  shipId?: string
}

export interface BattleLogEntry {
  id: string
  type: "player" | "enemy"
  message: string
  coordinate: string
  result: "hit" | "miss" | "sunk"
  timestamp: number
}

export interface ShipHealth {
  id: string
  name: string
  size: number
  hits: number
  sunk: boolean
}
