"use client"

import { Contract, RpcProvider } from "starknet"

import { SEPOLIA_CONFIG } from "@/src/config/sepolia-config"

const DENSHOKAN_TOKEN_ABI = [
  {
    type: "function",
    name: "balance_of",
    inputs: [{ name: "account", type: "core::starknet::contract_address::ContractAddress" }],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "token_of_owner_by_index",
    inputs: [
      { name: "owner", type: "core::starknet::contract_address::ContractAddress" },
      { name: "index", type: "core::integer::u256" },
    ],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "is_playable",
    inputs: [{ name: "token_id", type: "core::felt252" }],
    outputs: [{ type: "core::bool" }],
    state_mutability: "view",
  },
] as const

const LS_TOKEN_PREFIX = "dark-waters-denshokan-token"
const BIGINT_ZERO = BigInt(0)
const BIGINT_ONE = BigInt(1)
const BIGINT_128 = BigInt(128)
const UINT128_MAX = (BigInt(1) << BIGINT_128) - BigInt(1)

export interface DenshokanTokenRecord {
  tokenId: string
  playable: boolean
}

function toBigIntValue(value: unknown): bigint {
  if (typeof value === "bigint") return value
  if (typeof value === "number") return BigInt(value)
  if (typeof value === "string") return BigInt(value)

  if (Array.isArray(value) && value.length >= 2) {
    return (toBigIntValue(value[1]) << BIGINT_128) + toBigIntValue(value[0])
  }

  if (value && typeof value === "object" && "low" in value && "high" in value) {
    const raw = value as { low: unknown; high: unknown }
    return (toBigIntValue(raw.high) << BIGINT_128) + toBigIntValue(raw.low)
  }

  return BIGINT_ZERO
}

function toUint256(value: bigint) {
  return {
    low: value & UINT128_MAX,
    high: value >> BIGINT_128,
  }
}

function feltHex(value: bigint): string {
  return `0x${value.toString(16)}`
}

function tokenStorageKey(gameId: number, address: string): string {
  return `${LS_TOKEN_PREFIX}:${gameId}:${address.toLowerCase()}`
}

export function readSelectedGameToken(gameId: number, address: string): string | null {
  if (typeof window === "undefined") return null
  const tokenId = localStorage.getItem(tokenStorageKey(gameId, address))
  return tokenId && tokenId.length > 0 ? tokenId : null
}

export function writeSelectedGameToken(gameId: number, address: string, tokenId: string): void {
  if (typeof window === "undefined") return
  localStorage.setItem(tokenStorageKey(gameId, address), tokenId)
}

export function clearSelectedGameToken(gameId: number, address: string): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(tokenStorageKey(gameId, address))
}

export function randomDenshokanSalt(): number {
  return Math.floor(Math.random() * 65_535)
}

export async function listOwnedDenshokanTokens(
  owner: string,
  provider = new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.RPC_URL })
): Promise<DenshokanTokenRecord[]> {
  const tokenAddress = SEPOLIA_CONFIG.DENSHOKAN_TOKEN_ADDRESS.trim()
  if (!tokenAddress) return []

  const contract = new Contract({
    abi: DENSHOKAN_TOKEN_ABI,
    address: tokenAddress,
    providerOrAccount: provider,
  })
  const balance = toBigIntValue(await (contract as any).balance_of(owner))
  const tokens: DenshokanTokenRecord[] = []

  for (let index = BIGINT_ZERO; index < balance; index += BIGINT_ONE) {
    const tokenIdU256 = await (contract as any).token_of_owner_by_index(owner, toUint256(index))
    const tokenId = feltHex(toBigIntValue(tokenIdU256))
    const playable = Boolean(await (contract as any).is_playable(tokenId))
    tokens.push({ tokenId, playable })
  }

  tokens.sort((left, right) => {
    const leftValue = BigInt(left.tokenId)
    const rightValue = BigInt(right.tokenId)
    if (leftValue === rightValue) return 0
    return leftValue > rightValue ? -1 : 1
  })

  return tokens
}

export function detectNewTokenId(
  previousTokenIds: string[],
  nextTokens: DenshokanTokenRecord[]
): string | null {
  const seen = new Set(previousTokenIds.map((tokenId) => tokenId.toLowerCase()))
  return nextTokens.find((token) => !seen.has(token.tokenId.toLowerCase()))?.tokenId ?? null
}
