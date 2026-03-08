#!/usr/bin/env node

import crypto from "node:crypto"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"

import SessionProvider from "@cartridge/controller/session/node"
import { init, MemberClause, ToriiQueryBuilder } from "@dojoengine/sdk"
import { CallData, RpcProvider, constants, hash } from "starknet"

const ZERO_ADDRESS = "0x0"
const GRID_SIZE = 10
const SHIP_LENGTHS = [5, 4, 3, 3, 2]
const DEFAULT_RPC_URL = "https://api.cartridge.gg/x/starknet/sepolia"
const DEFAULT_WORLD_ADDRESS =
  "0x79e3198f644ce7761f1add8cdde043be8a8726d02ef9904d6015205da8eb1a1"
const DEFAULT_ACTIONS_ADDRESS =
  "0x18f4e1f102a3a2205ae200509ac059c432b545819324faf50a7412e1f652cce"
const DEFAULT_TORII_URL = "https://api.cartridge.gg/x/dark-waters/torii"
const DEFAULT_CHAIN_ID = constants.StarknetChainId.SN_SEPOLIA
const DEFAULT_DEPLOYED_BLOCK = 7366588
const STATE_VERSION = 1
const MAX_SEEN_EVENT_IDS = 4000
const EVENT_EMITTED_SELECTOR =
  "0x1c93f6e4703ae90f75338f29bffbe9c1662200cee981f49afeec26e892debcd"
const GAME_SPAWNED_EVENT_HASH =
  "0x7003ad3d04ce3b53a28689df967350b9610b921088b7e4c6fa97cb34e892798"
const BOARD_COMMITTED_EVENT_HASH =
  "0x575b6f66dbb5b17fb1631bcf236f4a0328f93190da5ce469732b822e40671e3"
const ATTACK_MADE_EVENT_HASH =
  "0x5548cce77b1d5547ae403fe1c999eb6b5b6deec203bb41d643f1ce0745141dd"
const ATTACK_REVEALED_EVENT_HASH =
  "0x2b1e1c82d7adc6a31dcfd63a739314b26b4319934d854c9906d1039b62d8d91"
const GAME_ENDED_EVENT_HASH =
  "0x259ed609484026ce0d7af132cae5944310770b975655365e632f144607da0ea"

function parseBoolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback
  const normalized = String(value).trim().toLowerCase()
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false
  return fallback
}

const CONFIG = {
  rpcUrl: process.env.BOT_RPC_URL || process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || DEFAULT_RPC_URL,
  worldAddress: process.env.BOT_WORLD_ADDRESS || process.env.NEXT_PUBLIC_SEPOLIA_WORLD_ADDRESS || DEFAULT_WORLD_ADDRESS,
  actionsAddress:
    process.env.BOT_ACTIONS_ADDRESS || process.env.NEXT_PUBLIC_SEPOLIA_ACTIONS_ADDRESS || DEFAULT_ACTIONS_ADDRESS,
  toriiUrl:
    process.env.BOT_TORII_URL ||
    process.env.NEXT_PUBLIC_SEPOLIA_TORII_URL ||
    process.env.NEXT_PUBLIC_TORII_URL ||
    DEFAULT_TORII_URL,
  botAddress:
    process.env.BOT_ADDRESS ||
    process.env.NEXT_PUBLIC_SEPOLIA_BOT_ADDRESS ||
    process.env.NEXT_PUBLIC_BOT_ADDRESS ||
    "",
  chainId: process.env.BOT_CHAIN_ID || DEFAULT_CHAIN_ID,
  deployedBlock: Number(
    process.env.BOT_DEPLOYED_BLOCK ||
      process.env.NEXT_PUBLIC_SEPOLIA_DEPLOYED_BLOCK ||
      DEFAULT_DEPLOYED_BLOCK
  ),
  sessionBasePath:
    process.env.BOT_SESSION_BASE_PATH ||
    process.env.CARTRIDGE_STORAGE_PATH ||
    path.join(process.cwd(), ".cartridge-bot-session"),
  keychainUrl: process.env.BOT_KEYCHAIN_URL || process.env.CARTRIDGE_KEYCHAIN_URL || "",
  pollMs: Number(process.env.BOT_POLL_MS || 4000),
  healthPort: Number(process.env.BOT_HEALTH_PORT || 0),
  allowInteractiveAuth: parseBoolEnv(process.env.BOT_ALLOW_INTERACTIVE_AUTH, false),
  exitAfterSession: parseBoolEnv(process.env.BOT_EXIT_AFTER_SESSION, false),
  boardSeed: process.env.BOT_BOARD_SEED || "dark-waters-bot-seed",
  statePath:
    process.env.BOT_STATE_PATH ||
    path.join(process.cwd(), ".bot-data", "dark-waters-bot-state.json"),
}

/** @typedef {{ x: number, y: number, revealNonce: string }} PendingReveal */
/** @typedef {{ version: number, pendingReveals: Record<string, PendingReveal> }} BotRuntimeState */

/** @typedef {{ gameId: number, player1: string, player2: string, turn: string, state: number, winner: string }} GameRow */
/** @typedef {{ gameId: number, player: string, isCommitted: boolean }} BoardCommitmentRow */
/** @typedef {{ gameId: number, attacker: string, x: number, y: number, isPending: boolean }} PendingAttackRow */
/** @typedef {{ gameId: number, attacker: string, x: number, y: number, isRevealed: boolean, isHit: boolean }} AttackRow */

/** @type {BotRuntimeState} */
const runtimeState = loadRuntimeState(CONFIG.statePath)
const boardPlanCache = new Map()
const eventCache = {
  bootstrapped: false,
  cursorBlock: CONFIG.deployedBlock,
  seenEventIds: new Set(),
  seenEventIdOrder: [],
  games: new Map(),
  boardCommitments: new Map(),
  pendingAttacks: new Map(),
  attacks: new Map(),
}
const fallbackLogState = {
  games: false,
  boardCommitments: false,
  pendingAttack: false,
  attacks: false,
}
const healthState = {
  status: "starting",
  startedAt: new Date().toISOString(),
  lastTickAt: null,
  lastActionAt: null,
  lastAction: null,
  lastError: null,
  botAddress: CONFIG.botAddress || "",
}

function toBigInt(value) {
  try {
    if (typeof value === "bigint") return value
    if (typeof value === "number") return BigInt(value)
    if (typeof value === "boolean") return value ? 1n : 0n
    if (typeof value === "string") return BigInt(value)
  } catch {
    return 0n
  }
  return 0n
}

function toNumber(value) {
  try {
    const casted = Number(toBigInt(value))
    return Number.isFinite(casted) ? casted : 0
  } catch {
    return 0
  }
}

function toBool(value) {
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.toLowerCase() === "true" || value === "1"
  return toBigInt(value) === 1n
}

function toAddress(value) {
  if (typeof value === "string" && value.length > 0) {
    try {
      return `0x${BigInt(value).toString(16)}`
    } catch {
      return value.toLowerCase()
    }
  }
  try {
    return `0x${toBigInt(value).toString(16)}`
  } catch {
    return ZERO_ADDRESS
  }
}

function sameAddress(a, b) {
  try {
    return BigInt(a) === BigInt(b)
  } catch {
    return String(a).toLowerCase() === String(b).toLowerCase()
  }
}

function isZeroAddress(address) {
  return sameAddress(address, ZERO_ADDRESS)
}

function randomFeltHex(bytes = 16) {
  return `0x${crypto.randomBytes(bytes).toString("hex")}`
}

function computeAttackCommitmentHash(x, y, revealNonce) {
  const commitment = hash.computePoseidonHashOnElements([
    BigInt(x),
    BigInt(y),
    BigInt(revealNonce),
  ])
  return `0x${BigInt(commitment).toString(16)}`
}

function deriveCellNonce(masterSecret, x, y) {
  const nonce = hash.computePoseidonHashOnElements([BigInt(masterSecret), BigInt(x), BigInt(y)])
  return BigInt(nonce)
}

function computeBoardLeafHash(x, y, cellNonce, isShip) {
  const leafHash = hash.computePoseidonHashOnElements([
    BigInt(x),
    BigInt(y),
    BigInt(cellNonce),
    BigInt(isShip ? 1 : 0),
  ])
  return BigInt(leafHash)
}

class BoardMerkle {
  constructor(shipSet, masterSecret) {
    this.shipSet = shipSet
    this.masterSecret = BigInt(masterSecret)
    this.leaves = this.#generateLeaves()
    this.tree = this.#buildTree(this.leaves)
    this.root = this.tree[this.tree.length - 1][0]
  }

  #generateLeaves() {
    /** @type {bigint[]} */
    const leaves = []
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const isShip = this.shipSet.has(`${x},${y}`)
        const nonce = deriveCellNonce(this.masterSecret, x, y)
        leaves.push(computeBoardLeafHash(x, y, nonce, isShip))
      }
    }
    return leaves
  }

  #buildTree(leaves) {
    let currentLayer = [...leaves]
    const nextPow2 = 2 ** Math.ceil(Math.log2(currentLayer.length))
    while (currentLayer.length < nextPow2) currentLayer.push(0n)

    /** @type {bigint[][]} */
    const layers = [currentLayer]
    while (currentLayer.length > 1) {
      /** @type {bigint[]} */
      const nextLayer = []
      for (let i = 0; i < currentLayer.length; i += 2) {
        const a = currentLayer[i]
        const b = currentLayer[i + 1]
        const pairHash = a < b ? hash.computePoseidonHash(a, b) : hash.computePoseidonHash(b, a)
        nextLayer.push(BigInt(pairHash))
      }
      layers.push(nextLayer)
      currentLayer = nextLayer
    }
    return layers
  }

  getRootHex() {
    return `0x${this.root.toString(16)}`
  }

  hasShip(x, y) {
    return this.shipSet.has(`${x},${y}`)
  }

  getCellNonceHex(x, y) {
    return `0x${deriveCellNonce(this.masterSecret, x, y).toString(16)}`
  }

  getProofHex(x, y) {
    const index = y * GRID_SIZE + x
    /** @type {string[]} */
    const proof = []
    let currentIndex = index

    for (let i = 0; i < this.tree.length - 1; i += 1) {
      const layer = this.tree[i]
      const isRightNode = currentIndex % 2 !== 0
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1
      const sibling = siblingIndex < layer.length ? layer[siblingIndex] : 0n
      proof.push(`0x${sibling.toString(16)}`)
      currentIndex = Math.floor(currentIndex / 2)
    }
    return proof
  }
}

function hashToUint32(seed) {
  const digest = crypto.createHash("sha256").update(seed).digest()
  return digest.readUInt32BE(0)
}

function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededInt(rng, maxExclusive) {
  return Math.floor(rng() * maxExclusive)
}

function generateShipSet(seedText) {
  const rng = mulberry32(hashToUint32(seedText))
  /** @type {Set<string>} */
  const occupied = new Set()

  for (const length of SHIP_LENGTHS) {
    let placed = false
    for (let attempts = 0; attempts < 500 && !placed; attempts += 1) {
      const horizontal = rng() < 0.5
      const x = horizontal ? seededInt(rng, GRID_SIZE - length + 1) : seededInt(rng, GRID_SIZE)
      const y = horizontal ? seededInt(rng, GRID_SIZE) : seededInt(rng, GRID_SIZE - length + 1)

      /** @type {string[]} */
      const cells = []
      for (let offset = 0; offset < length; offset += 1) {
        const cx = horizontal ? x + offset : x
        const cy = horizontal ? y : y + offset
        cells.push(`${cx},${cy}`)
      }

      if (cells.some((cell) => occupied.has(cell))) continue
      for (const cell of cells) occupied.add(cell)
      placed = true
    }

    if (!placed) {
      throw new Error(`Failed to generate deterministic ship placement for length ${length}.`)
    }
  }

  return occupied
}

function computeEventId(event) {
  const block = event.block_number ?? "n/a"
  const tx = event.transaction_hash ?? "0x0"
  const eventIndex = event.event_index ?? event.index ?? ""
  const keys = Array.isArray(event.keys) ? event.keys.join(",") : ""
  const data = Array.isArray(event.data) ? event.data.join(",") : ""
  return `${block}:${tx}:${eventIndex}:${keys}:${data}`
}

function eventBlockNumber(event, fallback) {
  const candidate = event?.block_number
  if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate
  return fallback
}

function eventIndex(event) {
  const candidate = event?.event_index ?? event?.index
  if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate
  return 0
}

function rememberEventId(id) {
  if (eventCache.seenEventIds.has(id)) return false
  eventCache.seenEventIds.add(id)
  eventCache.seenEventIdOrder.push(id)

  while (eventCache.seenEventIdOrder.length > MAX_SEEN_EVENT_IDS) {
    const expired = eventCache.seenEventIdOrder.shift()
    if (expired) eventCache.seenEventIds.delete(expired)
  }

  return true
}

async function fetchEventsSince(provider, eventHash, fromBlock) {
  const events = []
  let continuationToken

  do {
    const page = await provider.getEvents({
      address: CONFIG.worldAddress,
      keys: [[EVENT_EMITTED_SELECTOR], [eventHash]],
      from_block: { block_number: fromBlock },
      to_block: "latest",
      chunk_size: 500,
      continuation_token: continuationToken,
    })
    events.push(...page.events)
    continuationToken = page.continuation_token ?? undefined
  } while (continuationToken)

  return events
}

function commitmentKey(gameId, player) {
  return `${gameId}:${toAddress(player)}`
}

function attackKey(gameId, attacker, x, y) {
  return `${gameId}:${toAddress(attacker)}:${x}:${y}`
}

function rememberAttack(gameId, attacker, x, y, isRevealed, isHit) {
  eventCache.attacks.set(attackKey(gameId, attacker, x, y), {
    gameId,
    attacker: toAddress(attacker),
    x,
    y,
    isRevealed,
    isHit,
  })
}

function applySpawnEvent(event) {
  if (!Array.isArray(event.data) || event.data.length < 8) return
  const gameId = Number(event.data[1])
  if (!Number.isFinite(gameId) || gameId <= 0) return

  eventCache.games.set(gameId, {
    gameId,
    player1: toAddress(event.data[3]),
    player2: toAddress(event.data[4]),
    turn: toAddress(event.data[5]),
    state: toNumber(event.data[6]),
    winner: toAddress(event.data[7]),
  })
}

function applyBoardCommittedEvent(event) {
  if (!Array.isArray(event.data) || event.data.length < 4) return
  const gameId = Number(event.data[1])
  if (!Number.isFinite(gameId) || gameId <= 0) return

  const player = toAddress(event.data[3])
  eventCache.boardCommitments.set(commitmentKey(gameId, player), {
    gameId,
    player,
    isCommitted: true,
  })

  const game = eventCache.games.get(gameId)
  if (!game) return

  const p1Committed = eventCache.boardCommitments.get(commitmentKey(gameId, game.player1))?.isCommitted
  const p2Committed = eventCache.boardCommitments.get(commitmentKey(gameId, game.player2))?.isCommitted
  if (p1Committed && p2Committed) {
    game.state = 1
  }
}

function applyAttackMadeEvent(event) {
  if (!Array.isArray(event.data) || event.data.length < 6) return
  const gameId = Number(event.data[1])
  if (!Number.isFinite(gameId) || gameId <= 0) return

  const attacker = toAddress(event.data[3])
  const x = Number(event.data[4])
  const y = Number(event.data[5])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return

  rememberAttack(gameId, attacker, x, y, false, false)
  eventCache.pendingAttacks.set(gameId, {
    gameId,
    attacker,
    x,
    y,
    isPending: true,
  })
}

function applyAttackRevealedEvent(event) {
  if (!Array.isArray(event.data) || event.data.length < 7) return
  const gameId = Number(event.data[1])
  if (!Number.isFinite(gameId) || gameId <= 0) return

  const attacker = toAddress(event.data[3])
  const x = Number(event.data[4])
  const y = Number(event.data[5])
  const isHit = Number(event.data[6]) === 1
  if (!Number.isFinite(x) || !Number.isFinite(y)) return

  rememberAttack(gameId, attacker, x, y, true, isHit)
  eventCache.pendingAttacks.delete(gameId)

  const game = eventCache.games.get(gameId)
  if (!game) return

  if (sameAddress(attacker, game.player1)) {
    game.turn = game.player2
  } else if (sameAddress(attacker, game.player2)) {
    game.turn = game.player1
  }
}

function applyGameEndedEvent(event) {
  if (!Array.isArray(event.data) || event.data.length < 4) return
  const gameId = Number(event.data[1])
  if (!Number.isFinite(gameId) || gameId <= 0) return

  const winner = toAddress(event.data[3])
  const game = eventCache.games.get(gameId)
  if (!game) return

  game.state = 2
  game.winner = winner
  eventCache.pendingAttacks.delete(gameId)
}

function applyWorldEvent(event) {
  const eventHash = String(event?.keys?.[1] ?? "").toLowerCase()
  if (!eventHash) return

  if (eventHash === GAME_SPAWNED_EVENT_HASH.toLowerCase()) {
    applySpawnEvent(event)
    return
  }
  if (eventHash === BOARD_COMMITTED_EVENT_HASH.toLowerCase()) {
    applyBoardCommittedEvent(event)
    return
  }
  if (eventHash === ATTACK_MADE_EVENT_HASH.toLowerCase()) {
    applyAttackMadeEvent(event)
    return
  }
  if (eventHash === ATTACK_REVEALED_EVENT_HASH.toLowerCase()) {
    applyAttackRevealedEvent(event)
    return
  }
  if (eventHash === GAME_ENDED_EVENT_HASH.toLowerCase()) {
    applyGameEndedEvent(event)
  }
}

async function syncEventCache(rpcProvider) {
  const fromBlock = eventCache.bootstrapped ? eventCache.cursorBlock : CONFIG.deployedBlock
  const batches = await Promise.all([
    fetchEventsSince(rpcProvider, GAME_SPAWNED_EVENT_HASH, fromBlock),
    fetchEventsSince(rpcProvider, BOARD_COMMITTED_EVENT_HASH, fromBlock),
    fetchEventsSince(rpcProvider, ATTACK_MADE_EVENT_HASH, fromBlock),
    fetchEventsSince(rpcProvider, ATTACK_REVEALED_EVENT_HASH, fromBlock),
    fetchEventsSince(rpcProvider, GAME_ENDED_EVENT_HASH, fromBlock),
  ])

  const merged = batches
    .flat()
    .sort((left, right) => {
      const leftBlock = eventBlockNumber(left, fromBlock)
      const rightBlock = eventBlockNumber(right, fromBlock)
      if (leftBlock !== rightBlock) return leftBlock - rightBlock
      return eventIndex(left) - eventIndex(right)
    })

  let maxBlock = fromBlock
  for (const event of merged) {
    maxBlock = Math.max(maxBlock, eventBlockNumber(event, fromBlock))
    const id = computeEventId(event)
    if (!rememberEventId(id)) continue
    applyWorldEvent(event)
  }

  eventCache.bootstrapped = true
  eventCache.cursorBlock = maxBlock
}

async function queryGamesFromEvents(rpcProvider) {
  await syncEventCache(rpcProvider)
  return Array.from(eventCache.games.values()).sort((a, b) => a.gameId - b.gameId)
}

async function queryBoardCommitmentsFromEvents(rpcProvider, gameId) {
  await syncEventCache(rpcProvider)
  return Array.from(eventCache.boardCommitments.values()).filter(
    (commitment) => commitment.gameId === gameId
  )
}

async function queryPendingAttackFromEvents(rpcProvider, gameId) {
  await syncEventCache(rpcProvider)
  return eventCache.pendingAttacks.get(gameId) ?? null
}

async function queryAttacksFromEvents(rpcProvider, gameId) {
  await syncEventCache(rpcProvider)
  return Array.from(eventCache.attacks.values()).filter((attack) => attack.gameId === gameId)
}

function getBoardPlan(gameId) {
  if (boardPlanCache.has(gameId)) return boardPlanCache.get(gameId)

  const baseSeed = `${CONFIG.boardSeed}:${CONFIG.botAddress}:${gameId}`
  const masterSecretDigest = crypto.createHash("sha256").update(`${baseSeed}:master`).digest("hex")
  const masterSecret = BigInt(`0x${masterSecretDigest}`)
  const shipSet = generateShipSet(`${baseSeed}:layout`)
  const merkle = new BoardMerkle(shipSet, masterSecret)

  const plan = {
    merkle,
    rootHex: merkle.getRootHex(),
  }
  boardPlanCache.set(gameId, plan)
  return plan
}

function loadRuntimeState(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8")
    const parsed = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) throw new Error("Invalid state format")
    if (typeof parsed.pendingReveals !== "object" || parsed.pendingReveals === null) {
      throw new Error("Missing pendingReveals")
    }
    return {
      version: STATE_VERSION,
      pendingReveals: parsed.pendingReveals,
    }
  } catch {
    return { version: STATE_VERSION, pendingReveals: {} }
  }
}

function saveRuntimeState(filePath, state) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2))
}

function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString()
  const payload = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ""
  // eslint-disable-next-line no-console
  console[level](`${timestamp} [bot] ${message}${payload}`)
}

function validateConfig() {
  const missing = []
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`)
  }

  if (!Number.isFinite(CONFIG.pollMs) || CONFIG.pollMs <= 0) {
    throw new Error(`Invalid BOT_POLL_MS: ${CONFIG.pollMs}`)
  }

  if (!Number.isFinite(CONFIG.healthPort) || CONFIG.healthPort < 0) {
    throw new Error(`Invalid BOT_HEALTH_PORT: ${CONFIG.healthPort}`)
  }

  if (!Number.isFinite(CONFIG.deployedBlock) || CONFIG.deployedBlock <= 0) {
    throw new Error(`Invalid BOT_DEPLOYED_BLOCK: ${CONFIG.deployedBlock}`)
  }
}

function startHealthServer() {
  if (!CONFIG.healthPort) return null

  const server = http.createServer((request, response) => {
    if (!request.url || (request.url !== "/health" && request.url !== "/")) {
      response.statusCode = 404
      response.end("Not found")
      return
    }

    const now = Date.now()
    const lastTickAtMs = healthState.lastTickAt ? Date.parse(healthState.lastTickAt) : null
    const lastTickAgeMs = lastTickAtMs ? Math.max(0, now - lastTickAtMs) : null
    const healthy =
      healthState.status !== "fatal" &&
      (lastTickAgeMs === null || lastTickAgeMs < Math.max(CONFIG.pollMs * 10, 60_000))

    response.statusCode = healthy ? 200 : 503
    response.setHeader("Content-Type", "application/json")
    response.end(
      JSON.stringify(
        {
          ...healthState,
          healthy,
          lastTickAgeMs,
        },
        null,
        2
      )
    )
  })

  server.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error)
    const code = typeof error === "object" && error && "code" in error ? error.code : null
    if (code === "EADDRINUSE") {
      log(
        "warn",
        "Health server port already in use; continuing without health endpoint",
        { port: CONFIG.healthPort, error: message }
      )
      return
    }

    log("warn", "Health server failed; continuing without health endpoint", {
      port: CONFIG.healthPort,
      error: message,
    })
  })

  server.listen(CONFIG.healthPort, "0.0.0.0", () => {
    log("info", "Health server started", { port: CONFIG.healthPort })
  })

  return server
}

async function connectSessionAccount(sessionProvider) {
  const existing = await sessionProvider.probe()
  if (existing?.address) {
    log("info", "Reusing persisted Controller session")
    return existing
  }

  if (!CONFIG.allowInteractiveAuth) {
    throw new Error(
      `No persisted Cartridge session found at ${CONFIG.sessionBasePath}. ` +
        "Run once with BOT_ALLOW_INTERACTIVE_AUTH=true BOT_EXIT_AFTER_SESSION=true to bootstrap."
    )
  }

  log("info", "No persisted session found; waiting for interactive Controller authorization")
  const connected = await sessionProvider.connect()
  if (!connected?.address) {
    throw new Error("Session connection was not completed. Authorize in browser and rerun.")
  }
  return connected
}

function createSessionPolicies() {
  return {
    contracts: {
      [CONFIG.actionsAddress]: {
        methods: [
          { name: "Commit Board", entrypoint: "commit_board" },
          { name: "Commit Attack", entrypoint: "commit_attack" },
          { name: "Reveal Attack", entrypoint: "reveal_attack" },
          { name: "Reveal Defense", entrypoint: "reveal" },
        ],
      },
    },
  }
}

async function queryEntities(sdk, modelName, gameId = null, limit = 1000) {
  if (!sdk) {
    throw new Error("Torii SDK unavailable")
  }

  let query = new ToriiQueryBuilder()
    .withEntityModels([`dark_waters-${modelName}`])
    .withLimit(limit)

  if (gameId !== null) {
    query = query.withClause(
      MemberClause(`dark_waters-${modelName}`, "game_id", "Eq", gameId).build()
    )
  }

  const result = await sdk.getEntities({ query })
  return result.getItems()
}

async function queryGames(sdk, rpcProvider) {
  try {
    const entities = await queryEntities(sdk, "Game", null, 1000)
    /** @type {GameRow[]} */
    const games = []
    for (const entity of entities) {
      const model = entity.models?.dark_waters?.Game
      if (!model || typeof model !== "object") continue
      const gameId = toNumber(model.game_id)
      if (gameId <= 0) continue
      games.push({
        gameId,
        player1: toAddress(model.player_1),
        player2: toAddress(model.player_2),
        turn: toAddress(model.turn),
        state: toNumber(model.state),
        winner: toAddress(model.winner),
      })
    }
    games.sort((a, b) => a.gameId - b.gameId)
    return games
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!fallbackLogState.games) {
      log("warn", "Falling back to RPC event polling for games", { error: message })
      fallbackLogState.games = true
    }
    return queryGamesFromEvents(rpcProvider)
  }
}

async function queryBoardCommitments(sdk, rpcProvider, gameId) {
  try {
    const entities = await queryEntities(sdk, "BoardCommitment", gameId, 16)
    /** @type {BoardCommitmentRow[]} */
    const commitments = []
    for (const entity of entities) {
      const model = entity.models?.dark_waters?.BoardCommitment
      if (!model || typeof model !== "object") continue
      commitments.push({
        gameId: toNumber(model.game_id),
        player: toAddress(model.player),
        isCommitted: toBool(model.is_committed),
      })
    }
    return commitments
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!fallbackLogState.boardCommitments) {
      log("warn", "Falling back to RPC event polling for board commitments", {
        gameId,
        error: message,
      })
      fallbackLogState.boardCommitments = true
    }
    return queryBoardCommitmentsFromEvents(rpcProvider, gameId)
  }
}

async function queryPendingAttack(sdk, rpcProvider, gameId) {
  try {
    const entities = await queryEntities(sdk, "PendingAttack", gameId, 4)
    for (const entity of entities) {
      const model = entity.models?.dark_waters?.PendingAttack
      if (!model || typeof model !== "object") continue
      const row = {
        gameId: toNumber(model.game_id),
        attacker: toAddress(model.attacker),
        x: toNumber(model.x),
        y: toNumber(model.y),
        isPending: toBool(model.is_pending),
      }
      if (row.gameId === gameId && row.isPending) return row
    }
    return null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!fallbackLogState.pendingAttack) {
      log("warn", "Falling back to RPC event polling for pending attack", {
        gameId,
        error: message,
      })
      fallbackLogState.pendingAttack = true
    }
    return queryPendingAttackFromEvents(rpcProvider, gameId)
  }
}

async function queryAttacks(sdk, rpcProvider, gameId) {
  try {
    const entities = await queryEntities(sdk, "Attack", gameId, 1200)
    /** @type {AttackRow[]} */
    const rows = []
    for (const entity of entities) {
      const model = entity.models?.dark_waters?.Attack
      if (!model || typeof model !== "object") continue
      const position = typeof model.position === "object" && model.position ? model.position : {}
      rows.push({
        gameId: toNumber(model.game_id),
        attacker: toAddress(model.attacker),
        x: toNumber(position.x ?? model.x),
        y: toNumber(position.y ?? model.y),
        isRevealed: toBool(model.is_revealed),
        isHit: toBool(model.is_hit),
      })
    }
    return rows
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!fallbackLogState.attacks) {
      log("warn", "Falling back to RPC event polling for attacks", { gameId, error: message })
      fallbackLogState.attacks = true
    }
    return queryAttacksFromEvents(rpcProvider, gameId)
  }
}

function extractTxHash(executeResult) {
  const candidates = [
    executeResult?.transaction_hash,
    executeResult?.transactionHash,
    executeResult?.result?.transaction_hash,
  ]
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue
    if (typeof candidate === "string") {
      if (candidate.startsWith("0x") || candidate.startsWith("0X")) return candidate
      try {
        return `0x${BigInt(candidate).toString(16)}`
      } catch {
        return candidate
      }
    }
    try {
      return `0x${BigInt(candidate).toString(16)}`
    } catch {
      // keep trying remaining candidates
    }
  }
  return null
}

async function executeAction(account, rpcProvider, entrypoint, args) {
  const calldata = CallData.compile(args)
  const tx = await account.execute([
    {
      contractAddress: CONFIG.actionsAddress,
      entrypoint,
      calldata,
    },
  ])
  const txHash = extractTxHash(tx)
  if (!txHash) {
    throw new Error(`Could not extract transaction hash from execute(${entrypoint}) response.`)
  }

  await rpcProvider.waitForTransaction(txHash)
  log("info", `Executed ${entrypoint}`, { txHash })
}

function pickTarget(myAttacks) {
  /** @type {Set<string>} */
  const attacked = new Set(myAttacks.map((attack) => `${attack.x},${attack.y}`))
  const hits = myAttacks.filter((attack) => attack.isRevealed && attack.isHit)

  /** @type {Array<{x:number,y:number}>} */
  const neighbors = []
  for (const hit of hits) {
    const candidates = [
      { x: hit.x + 1, y: hit.y },
      { x: hit.x - 1, y: hit.y },
      { x: hit.x, y: hit.y + 1 },
      { x: hit.x, y: hit.y - 1 },
    ]
    for (const candidate of candidates) {
      if (
        candidate.x >= 0 &&
        candidate.x < GRID_SIZE &&
        candidate.y >= 0 &&
        candidate.y < GRID_SIZE &&
        !attacked.has(`${candidate.x},${candidate.y}`)
      ) {
        neighbors.push(candidate)
      }
    }
  }

  if (neighbors.length > 0) {
    return neighbors[Math.floor(Math.random() * neighbors.length)]
  }

  /** @type {Array<{x:number,y:number}>} */
  const checkerboard = []
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if ((x + y) % 2 !== 0) continue
      if (!attacked.has(`${x},${y}`)) checkerboard.push({ x, y })
    }
  }
  if (checkerboard.length > 0) {
    return checkerboard[Math.floor(Math.random() * checkerboard.length)]
  }

  /** @type {Array<{x:number,y:number}>} */
  const fallback = []
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (!attacked.has(`${x},${y}`)) fallback.push({ x, y })
    }
  }
  if (fallback.length === 0) return null
  return fallback[Math.floor(Math.random() * fallback.length)]
}

function shouldDropPendingReveal(message) {
  const normalized = String(message).toLowerCase()
  return (
    normalized.includes("pending attack not revealed yet") ||
    normalized.includes("attack commitment already revealed") ||
    normalized.includes("no attack commitment found") ||
    normalized.includes("attack reveal mismatch")
  )
}

function isSessionError(message) {
  const normalized = String(message).toLowerCase()
  return (
    normalized.includes("session") ||
    normalized.includes("authorization") ||
    normalized.includes("not authorized") ||
    normalized.includes("signature") ||
    normalized.includes("not connected")
  )
}

async function processGame(account, sdk, rpcProvider, game) {
  const botIsPlayer1 = sameAddress(game.player1, CONFIG.botAddress)
  const botIsPlayer2 = sameAddress(game.player2, CONFIG.botAddress)
  if (!botIsPlayer1 && !botIsPlayer2) return null

  const opponent = botIsPlayer1 ? game.player2 : game.player1
  if (isZeroAddress(opponent)) return null
  if (game.state !== 0 && game.state !== 1) return null
  if (!isZeroAddress(game.winner)) return null

  if (game.state === 0) {
    const commitments = await queryBoardCommitments(sdk, rpcProvider, game.gameId)
    const botCommit = commitments.find((commitment) => sameAddress(commitment.player, CONFIG.botAddress))
    if (botCommit?.isCommitted) return null

    const boardPlan = getBoardPlan(game.gameId)
    log("info", `Committing board for game ${game.gameId}`)
    await executeAction(account, rpcProvider, "commit_board", [game.gameId, boardPlan.rootHex])
    return "commit_board"
  }

  const pendingAttack = await queryPendingAttack(sdk, rpcProvider, game.gameId)
  if (pendingAttack && pendingAttack.isPending && !sameAddress(pendingAttack.attacker, CONFIG.botAddress)) {
    const boardPlan = getBoardPlan(game.gameId)
    const x = pendingAttack.x
    const y = pendingAttack.y
    const isShip = boardPlan.merkle.hasShip(x, y)
    const cellNonceHex = boardPlan.merkle.getCellNonceHex(x, y)
    const proofHex = boardPlan.merkle.getProofHex(x, y)

    log("info", `Revealing defense for game ${game.gameId}`, { x, y, isShip })
    await executeAction(account, rpcProvider, "reveal", [
      game.gameId,
      x,
      y,
      cellNonceHex,
      isShip ? 1 : 0,
      proofHex,
    ])
    return "reveal_defense"
  }

  if (!sameAddress(game.turn, CONFIG.botAddress)) return null
  if (pendingAttack && pendingAttack.isPending && sameAddress(pendingAttack.attacker, CONFIG.botAddress)) {
    return null
  }

  const pendingReveal = runtimeState.pendingReveals[String(game.gameId)]
  if (pendingReveal) {
    try {
      log("info", `Retrying reveal_attack for game ${game.gameId}`, pendingReveal)
      await executeAction(account, rpcProvider, "reveal_attack", [
        game.gameId,
        pendingReveal.x,
        pendingReveal.y,
        pendingReveal.revealNonce,
      ])
      delete runtimeState.pendingReveals[String(game.gameId)]
      saveRuntimeState(CONFIG.statePath, runtimeState)
      return "reveal_attack_retry"
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (shouldDropPendingReveal(message)) {
        delete runtimeState.pendingReveals[String(game.gameId)]
        saveRuntimeState(CONFIG.statePath, runtimeState)
      }
      throw error
    }
  }

  const attacks = await queryAttacks(sdk, rpcProvider, game.gameId)
  const myAttacks = attacks.filter((attack) => sameAddress(attack.attacker, CONFIG.botAddress))
  const target = pickTarget(myAttacks)
  if (!target) return null

  const revealNonce = randomFeltHex()
  const attackHash = computeAttackCommitmentHash(target.x, target.y, revealNonce)
  runtimeState.pendingReveals[String(game.gameId)] = { x: target.x, y: target.y, revealNonce }
  saveRuntimeState(CONFIG.statePath, runtimeState)

  try {
    log("info", `Submitting attack for game ${game.gameId}`, { x: target.x, y: target.y })
    await executeAction(account, rpcProvider, "commit_attack", [game.gameId, attackHash])
    await executeAction(account, rpcProvider, "reveal_attack", [
      game.gameId,
      target.x,
      target.y,
      revealNonce,
    ])
    delete runtimeState.pendingReveals[String(game.gameId)]
    saveRuntimeState(CONFIG.statePath, runtimeState)
    return "attack"
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (shouldDropPendingReveal(message)) {
      delete runtimeState.pendingReveals[String(game.gameId)]
      saveRuntimeState(CONFIG.statePath, runtimeState)
    }
    throw error
  }
}

async function runTick(account, sdk, rpcProvider) {
  healthState.lastTickAt = new Date().toISOString()
  const games = await queryGames(sdk, rpcProvider)
  const botGames = games.filter(
    (game) =>
      sameAddress(game.player1, CONFIG.botAddress) || sameAddress(game.player2, CONFIG.botAddress)
  )

  for (const game of botGames) {
    try {
      const action = await processGame(account, sdk, rpcProvider, game)
      if (action) {
        healthState.lastActionAt = new Date().toISOString()
        healthState.lastAction = { gameId: game.gameId, action }
        log("info", `Handled ${action} for game ${game.gameId}`)
        return
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      healthState.lastError = message
      if (isSessionError(message)) throw error
      log("error", `Failed processing game ${game.gameId}`, { error: message })
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  validateConfig()
  const shouldStartHealthServer = !CONFIG.exitAfterSession
  const healthServer = shouldStartHealthServer ? startHealthServer() : null

  log("info", "Starting Dark Waters bot", {
    botAddress: CONFIG.botAddress,
    worldAddress: CONFIG.worldAddress,
    actionsAddress: CONFIG.actionsAddress,
    toriiUrl: CONFIG.toriiUrl,
    rpcUrl: CONFIG.rpcUrl,
    chainId: CONFIG.chainId,
    sessionBasePath: CONFIG.sessionBasePath,
    allowInteractiveAuth: CONFIG.allowInteractiveAuth,
    exitAfterSession: CONFIG.exitAfterSession,
    healthPort: CONFIG.healthPort,
    pollMs: CONFIG.pollMs,
  })

  const rpcProvider = new RpcProvider({ nodeUrl: CONFIG.rpcUrl })
  const sessionProvider = new SessionProvider({
    rpc: CONFIG.rpcUrl,
    chainId: CONFIG.chainId,
    policies: createSessionPolicies(),
    basePath: CONFIG.sessionBasePath,
    ...(CONFIG.keychainUrl ? { keychainUrl: CONFIG.keychainUrl } : {}),
  })

  let account = await connectSessionAccount(sessionProvider)

  const resolvedBotAddress = toAddress(account.address)
  if (CONFIG.botAddress && !sameAddress(CONFIG.botAddress, resolvedBotAddress)) {
    throw new Error(
      `Configured BOT_ADDRESS (${CONFIG.botAddress}) does not match session address (${resolvedBotAddress}).`
    )
  }
  CONFIG.botAddress = resolvedBotAddress
  healthState.botAddress = resolvedBotAddress
  healthState.status = "session_ready"
  log("info", "Controller session connected", { botAddress: CONFIG.botAddress })

  if (CONFIG.exitAfterSession) {
    if (healthServer) {
      await new Promise((resolve) => healthServer.close(() => resolve()))
    }
    log("info", "Session bootstrap complete; exiting because BOT_EXIT_AFTER_SESSION=true")
    return
  }

  const sdk = CONFIG.toriiUrl
    ? await init({
        client: {
          worldAddress: CONFIG.worldAddress,
          toriiUrl: CONFIG.toriiUrl,
        },
        domain: {
          name: "Dark Waters Bot",
          version: "1.0.0",
          chainId: "SN_SEPOLIA",
          revision: "1",
        },
      }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        log("warn", "Torii SDK init failed; using RPC event polling fallback", { error: message })
        return null
      })
    : null

  healthState.status = "running"

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runTick(account, sdk, rpcProvider)
      healthState.lastError = null
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      healthState.lastError = message
      log("error", "Tick failed", { error: message })

      if (isSessionError(message)) {
        healthState.status = "reconnecting"
        try {
          const refreshedAccount = await connectSessionAccount(sessionProvider)
          const refreshedAddress = toAddress(refreshedAccount.address)
          if (!sameAddress(refreshedAddress, CONFIG.botAddress)) {
            throw new Error(
              `Reconnected session address (${refreshedAddress}) differs from BOT_ADDRESS (${CONFIG.botAddress}).`
            )
          }
          account = refreshedAccount
          healthState.status = "running"
          healthState.lastError = null
          log("info", "Controller session refreshed")
        } catch (reconnectError) {
          const reconnectMessage =
            reconnectError instanceof Error ? reconnectError.message : String(reconnectError)
          healthState.lastError = reconnectMessage
          log("error", "Session refresh failed", { error: reconnectMessage })
        }
      }
    }
    await sleep(CONFIG.pollMs)
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  healthState.status = "fatal"
  healthState.lastError = message
  log("error", "Bot exited", { error: message })
  process.exit(1)
})
