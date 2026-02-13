// ── Sepolia deployment config (single source of truth) ──────────────

export const SEPOLIA_CONFIG = {
  /** Dojo World contract */
  WORLD_ADDRESS:
    "0x042ec066eef86a6ae688ccc48ad45a887ab142386d9a43e7949e17f9198ee8ff",

  /** Actions contract (dark_waters-Actions) */
  ACTIONS_ADDRESS:
    "0x01b7e17ad6bbc599b91ae78065708d5d49d6eaccf97908f36e9c1066d7c7085f",

  /** Cartridge Sepolia RPC */
  RPC_URL: "https://api.cartridge.gg/x/starknet/sepolia",

  /** Block at which the world was deployed */
  DEPLOYED_BLOCK: 6449650,

  /** Starknet chain ID */
  CHAIN_ID: "SN_SEPOLIA",
} as const
