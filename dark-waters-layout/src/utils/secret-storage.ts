import type { Ship } from "@/src/utils/merkle"
import { randomFeltHex } from "@/src/utils/merkle"

const STORAGE_VERSION = 1
const LS_SECRET_PREFIX = "dark-waters-secret"
const LS_SESSION_KEY_PREFIX = "dark-waters-secret-key"
const LEGACY_LS_BOARD = "dark-waters-board"
const LEGACY_LS_SALT = "dark-waters-salt"

export interface BoardSecrets {
  board: Ship[]
  masterSecret: string
  createdAt: number
  version: number
}

interface EncryptedPayload {
  version: number
  iv: string
  ciphertext: string
  createdAt: number
}

export interface RecoveryPackage {
  version: number
  gameId: number
  address: string
  secretKey: string
  encryptedPayload: EncryptedPayload
}

function toHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex
  const output = new Uint8Array(Math.ceil(normalized.length / 2))
  for (let i = 0; i < output.length; i++) {
    output[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16)
  }
  return output
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function getPayloadKey(gameId: number, address: string): string {
  return `${LS_SECRET_PREFIX}:${gameId}:${address.toLowerCase()}`
}

function getSessionKeySlot(gameId: number, address: string): string {
  return `${LS_SESSION_KEY_PREFIX}:${gameId}:${address.toLowerCase()}`
}

function getLegacyBoardKey(gameId: number, address: string): string {
  return `${LEGACY_LS_BOARD}:${gameId}:${address.toLowerCase()}`
}

function getLegacyMasterSecretKey(gameId: number, address: string): string {
  return `${LEGACY_LS_SALT}:${gameId}:${address.toLowerCase()}`
}

function readJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function generateSecretKeyHex(): string {
  const keyBytes = new Uint8Array(32)
  crypto.getRandomValues(keyBytes)
  return toHex(keyBytes)
}

async function encryptSecrets(bundle: BoardSecrets, secretKey: string): Promise<EncryptedPayload> {
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const keyBytes = hexToBytes(secretKey)
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"])
  const encoded = new TextEncoder().encode(JSON.stringify(bundle))
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded)
  return {
    version: STORAGE_VERSION,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    createdAt: Date.now(),
  }
}

async function decryptSecrets(
  payload: EncryptedPayload,
  secretKey: string
): Promise<BoardSecrets | null> {
  try {
    const keyBytes = hexToBytes(secretKey)
    const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"])
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
      key,
      base64ToBytes(payload.ciphertext)
    )
    const parsed = readJson<BoardSecrets>(new TextDecoder().decode(decrypted))
    if (!parsed) return null
    if (!Array.isArray(parsed.board) || typeof parsed.masterSecret !== "string") return null
    return parsed
  } catch {
    return null
  }
}

export function readRecoveryPackage(gameId: number, address: string): RecoveryPackage | null {
  if (typeof window === "undefined") return null
  const payload = readJson<EncryptedPayload>(localStorage.getItem(getPayloadKey(gameId, address)))
  const key = sessionStorage.getItem(getSessionKeySlot(gameId, address))
  if (!payload || !key) return null
  return {
    version: STORAGE_VERSION,
    gameId,
    address,
    secretKey: key,
    encryptedPayload: payload,
  }
}

export async function storeBoardSecrets(
  gameId: number,
  address: string,
  board: Ship[],
  masterSecret: string
): Promise<RecoveryPackage> {
  const secretKey = generateSecretKeyHex()
  const bundle: BoardSecrets = {
    board,
    masterSecret,
    createdAt: Date.now(),
    version: STORAGE_VERSION,
  }
  const encryptedPayload = await encryptSecrets(bundle, secretKey)
  localStorage.setItem(getPayloadKey(gameId, address), JSON.stringify(encryptedPayload))
  sessionStorage.setItem(getSessionKeySlot(gameId, address), secretKey)
  return {
    version: STORAGE_VERSION,
    gameId,
    address,
    secretKey,
    encryptedPayload,
  }
}

export async function loadBoardSecrets(
  gameId: number,
  address: string
): Promise<BoardSecrets | null> {
  if (typeof window === "undefined") return null

  const payload = readJson<EncryptedPayload>(localStorage.getItem(getPayloadKey(gameId, address)))
  const sessionKey = sessionStorage.getItem(getSessionKeySlot(gameId, address))

  if (payload && sessionKey) {
    const decrypted = await decryptSecrets(payload, sessionKey)
    if (decrypted) return decrypted
  }

  // One-time migration from legacy plaintext values.
  const legacyBoard =
    readJson<Ship[]>(localStorage.getItem(getLegacyBoardKey(gameId, address))) ??
    readJson<Ship[]>(localStorage.getItem(LEGACY_LS_BOARD))
  const legacyMasterSecret =
    localStorage.getItem(getLegacyMasterSecretKey(gameId, address)) ??
    localStorage.getItem(LEGACY_LS_SALT)

  if (legacyBoard && legacyMasterSecret) {
    const pkg = await storeBoardSecrets(gameId, address, legacyBoard, legacyMasterSecret)
    localStorage.removeItem(LEGACY_LS_BOARD)
    localStorage.removeItem(LEGACY_LS_SALT)
    localStorage.removeItem(getLegacyBoardKey(gameId, address))
    localStorage.removeItem(getLegacyMasterSecretKey(gameId, address))
    return decryptSecrets(pkg.encryptedPayload, pkg.secretKey)
  }

  return null
}

export async function unlockBoardSecrets(
  gameId: number,
  address: string,
  secretKey: string
): Promise<boolean> {
  if (typeof window === "undefined") return false
  const payload = readJson<EncryptedPayload>(localStorage.getItem(getPayloadKey(gameId, address)))
  if (!payload) return false
  const decrypted = await decryptSecrets(payload, secretKey)
  if (!decrypted) return false
  sessionStorage.setItem(getSessionKeySlot(gameId, address), secretKey)
  return true
}

export function importRecoveryPackage(rawPackage: string): RecoveryPackage | null {
  const parsed = readJson<RecoveryPackage>(rawPackage)
  if (!parsed) return null
  if (
    typeof parsed.gameId !== "number" ||
    typeof parsed.address !== "string" ||
    typeof parsed.secretKey !== "string" ||
    !parsed.encryptedPayload
  ) {
    return null
  }
  localStorage.setItem(
    getPayloadKey(parsed.gameId, parsed.address),
    JSON.stringify(parsed.encryptedPayload)
  )
  sessionStorage.setItem(getSessionKeySlot(parsed.gameId, parsed.address), parsed.secretKey)
  return parsed
}

export function createNewMasterSecret(): string {
  return randomFeltHex(16)
}
