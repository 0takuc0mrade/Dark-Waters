// ── Sepolia deployment config (single source of truth) ──────────────

export const SEPOLIA_CONFIG = {
  /** Dojo World contract */
  WORLD_ADDRESS:
    "0x79e3198f644ce7761f1add8cdde043be8a8726d02ef9904d6015205da8eb1a1",

  /** Actions contract (dark_waters-Actions) */
  ACTIONS_ADDRESS:
    "0x18f4e1f102a3a2205ae200509ac059c432b545819324faf50a7412e1f652cce",

  /** Cartridge Sepolia RPC */
  RPC_URL: "https://api.cartridge.gg/x/starknet/sepolia",

  /** Block at which the world was deployed */
  DEPLOYED_BLOCK: 6587147,

  /** Starknet chain ID */
  CHAIN_ID: "SN_SEPOLIA",
} as const
