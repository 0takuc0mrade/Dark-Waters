import {
  init,
  MemberClause,
  ToriiQueryBuilder,
  type SDK,
  type SchemaType,
} from "@dojoengine/sdk"
import { SEPOLIA_CONFIG } from "@/src/config/sepolia-config"
import { logEvent } from "@/src/utils/logger"

type DarkWatersSchema = {
  dark_waters: {
    Game: {
      game_id: number | string | bigint
      player_1: string
      player_2: string
      turn: string
      state: number | string | bigint
      winner: string
      last_action: number | string | bigint
      moves_count: number | string | bigint
      stake_token: string
      stake_amount: number | string | bigint
      stake_locked_p1: boolean | number | string | bigint
      stake_locked_p2: boolean | number | string | bigint
      stake_settled: boolean | number | string | bigint
    }
    BoardCommitment: {
      game_id: number | string | bigint
      player: string
      root: string
      hits_taken: number | string | bigint
      is_committed: boolean | number | string | bigint
    }
  }
} & SchemaType

export interface DojoGameModel {
  gameId: number
  player1: string
  player2: string
  turn: string
  state: number
  winner: string
  stakeToken: string
  stakeAmount: string
  stakeLockedP1: boolean
  stakeLockedP2: boolean
  stakeSettled: boolean
}

export interface DojoBoardCommitmentModel {
  gameId: number
  player: string
  isCommitted: boolean
}

const schema: DarkWatersSchema = {
  dark_waters: {
    Game: {
      game_id: 0,
      player_1: "",
      player_2: "",
      turn: "",
      state: 0,
      winner: "",
      last_action: 0,
      moves_count: 0,
      stake_token: "",
      stake_amount: 0,
      stake_locked_p1: false,
      stake_locked_p2: false,
      stake_settled: false,
    },
    BoardCommitment: {
      game_id: 0,
      player: "",
      root: "",
      hits_taken: 0,
      is_committed: false,
    },
  },
}

let sdkPromise: Promise<SDK<DarkWatersSchema> | null> | null = null

function toBigInt(value: unknown): bigint {
  try {
    if (typeof value === "bigint") return value
    if (typeof value === "number") return BigInt(value)
    if (typeof value === "boolean") return value ? BigInt(1) : BigInt(0)
    if (typeof value === "string") return BigInt(value)
  } catch {
    return BigInt(0)
  }
  return BigInt(0)
}

function toNumber(value: unknown): number {
  try {
    const casted = Number(toBigInt(value))
    return Number.isFinite(casted) ? casted : 0
  } catch {
    return 0
  }
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.toLowerCase() === "true" || value === "1"
  return toBigInt(value) === BigInt(1)
}

function toAddress(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value
  try {
    const parsed = toBigInt(value)
    return `0x${parsed.toString(16)}`
  } catch {
    return "0x0"
  }
}

function normalizeGame(model: unknown): DojoGameModel | null {
  if (!model || typeof model !== "object") return null
  const entry = model as Record<string, unknown>
  const gameId = toNumber(entry.game_id)
  if (!Number.isFinite(gameId) || gameId <= 0) return null

  return {
    gameId,
    player1: toAddress(entry.player_1),
    player2: toAddress(entry.player_2),
    turn: toAddress(entry.turn),
    state: toNumber(entry.state),
    winner: toAddress(entry.winner),
    stakeToken: toAddress(entry.stake_token),
    stakeAmount: toBigInt(entry.stake_amount).toString(),
    stakeLockedP1: toBool(entry.stake_locked_p1),
    stakeLockedP2: toBool(entry.stake_locked_p2),
    stakeSettled: toBool(entry.stake_settled),
  }
}

function normalizeCommitment(model: unknown): DojoBoardCommitmentModel | null {
  if (!model || typeof model !== "object") return null
  const entry = model as Record<string, unknown>
  const gameId = toNumber(entry.game_id)
  if (!Number.isFinite(gameId) || gameId <= 0) return null

  return {
    gameId,
    player: toAddress(entry.player),
    isCommitted: toBool(entry.is_committed),
  }
}

function getToriiUrl(): string {
  return (SEPOLIA_CONFIG.TORII_URL ?? "").trim()
}

function readModels<T>(result: Awaited<ReturnType<SDK<DarkWatersSchema>["getEntities"]>>, model: "Game" | "BoardCommitment", normalize: (model: unknown) => T | null): T[] {
  const items = result.getItems()
  const parsed: T[] = []
  for (const entity of items) {
    const modelData = entity.models?.dark_waters?.[model]
    const normalized = normalize(modelData)
    if (normalized) parsed.push(normalized)
  }
  return parsed
}

export async function getDojoSdk(): Promise<SDK<DarkWatersSchema> | null> {
  const toriiUrl = getToriiUrl()
  if (!toriiUrl) return null

  if (!sdkPromise) {
    sdkPromise = init<DarkWatersSchema>({
      client: {
        worldAddress: SEPOLIA_CONFIG.WORLD_ADDRESS,
        toriiUrl,
      },
      domain: {
        name: "Dark Waters",
        version: "1.0.0",
        chainId: SEPOLIA_CONFIG.CHAIN_ID,
        revision: "1",
      },
    }).catch((error) => {
      logEvent("warn", {
        code: "W_DOJO_SDK_INIT",
        message: "Dojo SDK init failed; falling back to RPC event polling.",
        metadata: { error: error instanceof Error ? error.message : String(error), toriiUrl },
      })
      return null
    })
  }

  return sdkPromise
}

export async function queryAllGamesFromDojo(): Promise<DojoGameModel[] | null> {
  const sdk = await getDojoSdk()
  if (!sdk) return null

  try {
    const query = new ToriiQueryBuilder<DarkWatersSchema>()
      .withEntityModels(["dark_waters-Game"])
      .withLimit(1000)

    const result = await sdk.getEntities({ query })
    const games = readModels(result, "Game", normalizeGame)
    return games.sort((a, b) => b.gameId - a.gameId)
  } catch (error) {
    logEvent("warn", {
      code: "W_DOJO_SDK_QUERY_GAMES",
      message: "Dojo SDK game query failed; falling back to RPC event polling.",
      metadata: { error: error instanceof Error ? error.message : String(error) },
    })
    return null
  }
}

export async function queryGameByIdFromDojo(gameId: number): Promise<DojoGameModel | null> {
  const sdk = await getDojoSdk()
  if (!sdk) return null

  try {
    let query = new ToriiQueryBuilder<DarkWatersSchema>()
      .withEntityModels(["dark_waters-Game"])
      .withLimit(2)

    query = query.withClause(
      MemberClause<DarkWatersSchema, "dark_waters-Game", "game_id">(
        "dark_waters-Game",
        "game_id",
        "Eq",
        gameId
      ).build()
    )

    const result = await sdk.getEntities({ query })
    const games = readModels(result, "Game", normalizeGame)
    return games.find((entry) => entry.gameId === gameId) ?? null
  } catch (error) {
    logEvent("warn", {
      code: "W_DOJO_SDK_QUERY_GAME",
      message: "Dojo SDK game lookup failed.",
      metadata: { gameId, error: error instanceof Error ? error.message : String(error) },
    })
    return null
  }
}

export async function queryBoardCommitmentsForGameFromDojo(
  gameId: number
): Promise<DojoBoardCommitmentModel[] | null> {
  const sdk = await getDojoSdk()
  if (!sdk) return null

  try {
    let query = new ToriiQueryBuilder<DarkWatersSchema>()
      .withEntityModels(["dark_waters-BoardCommitment"])
      .withLimit(1000)

    query = query.withClause(
      MemberClause<DarkWatersSchema, "dark_waters-BoardCommitment", "game_id">(
        "dark_waters-BoardCommitment",
        "game_id",
        "Eq",
        gameId
      ).build()
    )

    const result = await sdk.getEntities({ query })
    const commitments = readModels(result, "BoardCommitment", normalizeCommitment)
    return commitments.filter((entry) => entry.gameId === gameId)
  } catch (error) {
    logEvent("warn", {
      code: "W_DOJO_SDK_QUERY_COMMITS",
      message: "Dojo SDK board commitment query failed; falling back to RPC event polling.",
      metadata: { gameId, error: error instanceof Error ? error.message : String(error) },
    })
    return null
  }
}
