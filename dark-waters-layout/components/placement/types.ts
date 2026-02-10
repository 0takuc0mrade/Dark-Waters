export interface Ship {
  id: string
  name: string
  size: number
  placed: boolean
}

export type Orientation = "horizontal" | "vertical"

export interface PlacedShip {
  shipId: string
  row: number
  col: number
  orientation: Orientation
}

export interface CellState {
  shipId: string | null
}

export const GRID_SIZE = 10

export const SHIPS: Ship[] = [
  { id: "carrier", name: "Carrier", size: 5, placed: false },
  { id: "battleship", name: "Battleship", size: 4, placed: false },
  { id: "cruiser", name: "Cruiser", size: 3, placed: false },
  { id: "submarine", name: "Submarine", size: 3, placed: false },
  { id: "destroyer", name: "Destroyer", size: 2, placed: false },
]

export const ROW_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]
