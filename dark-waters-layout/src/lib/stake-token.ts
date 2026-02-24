import { fromAddress, sepoliaTokens, type Token } from "starkzap"
import { SEPOLIA_CONFIG } from "@/src/config/sepolia-config"

export type StakeTokenSymbol = "STRK" | "WBTC"

export interface StakeTokenOption {
  symbol: StakeTokenSymbol
  label: string
  decimals: number
  address: string
}

const STRK_TOKEN = sepoliaTokens.STRK

function getWbtcToken(): Token | null {
  const address = SEPOLIA_CONFIG.TOKENS.WBTC.trim()
  if (!address) return null
  try {
    return {
      name: "Wrapped Bitcoin",
      symbol: "WBTC",
      decimals: 8,
      address: fromAddress(address),
    }
  } catch {
    return null
  }
}

export const STAKE_TOKEN_OPTIONS: Record<StakeTokenSymbol, StakeTokenOption> = {
  STRK: {
    symbol: "STRK",
    label: "STARK",
    decimals: STRK_TOKEN.decimals,
    address: STRK_TOKEN.address,
  },
  WBTC: {
    symbol: "WBTC",
    label: "BTC",
    decimals: 8,
    address: SEPOLIA_CONFIG.TOKENS.WBTC,
  },
}

export function getStakeToken(symbol: StakeTokenSymbol): Token | null {
  if (symbol === "STRK") return STRK_TOKEN
  return getWbtcToken()
}

export function getStakeTokenByAddress(
  tokenAddress: string | null | undefined
): { option: StakeTokenOption; token: Token } | null {
  if (!tokenAddress) return null
  const normalized = tokenAddress.toLowerCase()

  if (normalized === STRK_TOKEN.address.toLowerCase()) {
    return { option: STAKE_TOKEN_OPTIONS.STRK, token: STRK_TOKEN }
  }

  const wbtcToken = getWbtcToken()
  if (wbtcToken && normalized === wbtcToken.address.toLowerCase()) {
    return { option: STAKE_TOKEN_OPTIONS.WBTC, token: wbtcToken }
  }

  return null
}
