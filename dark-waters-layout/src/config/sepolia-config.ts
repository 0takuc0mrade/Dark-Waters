// ── Sepolia deployment config (single source of truth) ──────────────

export const SEPOLIA_CONFIG = {
  /** Dojo World contract */
  WORLD_ADDRESS:
    "0x0035a61193deacca08e9438fc102a8fd6c9a8f6d1de392fd61277022793b9a3f",

  /** Actions contract (dark_waters-Actions) */
  ACTIONS_ADDRESS:
    "0xef4aa6462fc34fcba0a18b49973bc83004757cc59c9940412efddae68b9637",

  /** Official Denshokan Sepolia token contract */
  DENSHOKAN_TOKEN_ADDRESS:
    process.env.NEXT_PUBLIC_SEPOLIA_DENSHOKAN_TOKEN_ADDRESS ??
    "0x0142712722e62a38f9c40fcc904610e1a14c70125876ecaaf25d803556734467",

  /** Official Denshokan Sepolia registry contract */
  DENSHOKAN_REGISTRY_ADDRESS:
    process.env.NEXT_PUBLIC_SEPOLIA_DENSHOKAN_REGISTRY_ADDRESS ??
    "0x040f1ed9880611bb7273bf51fd67123ebbba04c282036e2f81314061f6f9b1a1",

  /** Official Denshokan Sepolia default renderer */
  DENSHOKAN_RENDERER_ADDRESS:
    process.env.NEXT_PUBLIC_SEPOLIA_DENSHOKAN_RENDERER_ADDRESS ??
    "0x035d01a7689ade1f5b27e50b07c923812580bb91bd0931042a9a2f8ff07dc7ec",

  /** Cartridge Sepolia RPC */
  RPC_URL: "https://api.cartridge.gg/x/starknet/sepolia",

  /** Torii indexer endpoint used by Dojo SDK reads */
  TORII_URL:
    process.env.NEXT_PUBLIC_SEPOLIA_TORII_URL ??
    process.env.NEXT_PUBLIC_TORII_URL ??
    "",

  /** Optional bot account used for "Play vs Bot" matches */
  BOT_ADDRESS:
    process.env.NEXT_PUBLIC_SEPOLIA_BOT_ADDRESS ??
    process.env.NEXT_PUBLIC_BOT_ADDRESS ??
    "",

  /** Block at which the world was deployed */
  DEPLOYED_BLOCK: 7366588,


  /** Starknet chain ID */
  CHAIN_ID: "SN_SEPOLIA",

  /** Optional token contract addresses for staked matches */
  TOKENS: {
    STRK: process.env.NEXT_PUBLIC_SEPOLIA_STRK_TOKEN_ADDRESS ?? "",
    WBTC: process.env.NEXT_PUBLIC_SEPOLIA_WBTC_TOKEN_ADDRESS ?? "",
  },
} as const
