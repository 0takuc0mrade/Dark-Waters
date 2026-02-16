const MAX_SEEN_EVENT_IDS = 4000

interface EventCheckpointRecord {
  fromBlock: number
  seenEventIds: string[]
}

function getKey(scope: string): string {
  return `dark-waters-event-checkpoint:${scope}`
}

function readRecord(scope: string): EventCheckpointRecord | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(getKey(scope))
  if (!raw) return null
  try {
    return JSON.parse(raw) as EventCheckpointRecord
  } catch {
    return null
  }
}

export function loadCheckpoint(scope: string, defaultBlock: number): EventCheckpointRecord {
  const existing = readRecord(scope)
  if (!existing) {
    return { fromBlock: defaultBlock, seenEventIds: [] }
  }
  const normalizedBlock =
    typeof existing.fromBlock === "number" && Number.isFinite(existing.fromBlock)
      ? existing.fromBlock
      : defaultBlock
  const normalizedSeen = Array.isArray(existing.seenEventIds) ? existing.seenEventIds : []
  return {
    fromBlock: Math.max(defaultBlock, normalizedBlock),
    seenEventIds: normalizedSeen.slice(-MAX_SEEN_EVENT_IDS),
  }
}

export function saveCheckpoint(scope: string, record: EventCheckpointRecord): void {
  if (typeof window === "undefined") return
  localStorage.setItem(
    getKey(scope),
    JSON.stringify({
      fromBlock: record.fromBlock,
      seenEventIds: record.seenEventIds.slice(-MAX_SEEN_EVENT_IDS),
    })
  )
}

export function computeEventId(event: any): string {
  const block = event.block_number ?? "n/a"
  const tx = event.transaction_hash ?? "0x0"
  const eventIndex = event.event_index ?? event.index ?? ""
  const keys = Array.isArray(event.keys) ? event.keys.join(",") : ""
  const data = Array.isArray(event.data) ? event.data.join(",") : ""
  return `${block}:${tx}:${eventIndex}:${keys}:${data}`
}

export function eventBlockNumber(event: any, fallback: number): number {
  const candidate = event?.block_number
  if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate
  return fallback
}
