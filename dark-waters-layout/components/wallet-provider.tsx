"use client"

import React, { createContext, useContext, useMemo } from "react"
import {
  StarknetConfig,
  jsonRpcProvider,
  useConnect,
  useAccount,
  useDisconnect,
} from "@starknet-react/core"
import { sepolia } from "@starknet-react/chains"
import { ControllerConnector } from "@cartridge/connector"

import { SEPOLIA_CONFIG } from "@/src/config/sepolia-config"

// ── Session policies ────────────────────────────────────────────────
// Pre-approve these contract calls so gameplay doesn't require
// manual signing for every transaction.

const policies = {
  contracts: {
    [SEPOLIA_CONFIG.ACTIONS_ADDRESS]: {
      name: "Dark Waters Actions",
      methods: [
        { name: "Spawn Game", entrypoint: "spawn_game" },
        { name: "Commit Board", entrypoint: "commit_board" },
        { name: "Attack", entrypoint: "attack" },
        { name: "Reveal", entrypoint: "reveal" },
        { name: "Claim Timeout Win", entrypoint: "claim_timeout_win" },
      ],
    },
  },
}

// ── Controller connector (created once, outside components) ─────────

const controllerConnector = new ControllerConnector({
  policies,
  chains: [
    { rpcUrl: SEPOLIA_CONFIG.RPC_URL },
  ],
})

// ── Wallet context ──────────────────────────────────────────────────

interface WalletContextType {
  isConnected: boolean
  address: string | undefined
  connect: () => void
  disconnect: () => void
}

const WalletContext = createContext<WalletContextType>({
  isConnected: false,
  address: undefined,
  connect: () => {},
  disconnect: () => {},
})

export function useWallet() {
  return useContext(WalletContext)
}

// ── Inner component (must be inside StarknetConfig) ─────────────────

function InnerWallet({ children }: { children: React.ReactNode }) {
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { address, status } = useAccount()

  const controller = useMemo(
    () => connectors.find((c) => c.id === "controller"),
    [connectors],
  )

  const handleConnect = () => {
    if (controller) connect({ connector: controller })
  }

  return (
    <WalletContext.Provider
      value={{
        isConnected: status === "connected",
        address,
        connect: handleConnect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

// ── Provider wrapper ────────────────────────────────────────────────

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const connectors = useMemo(() => [controllerConnector], [])

  const provider = jsonRpcProvider({
    rpc: () => ({ nodeUrl: SEPOLIA_CONFIG.RPC_URL }),
  })

  return (
    <StarknetConfig
      chains={[sepolia]}
      provider={provider}
      connectors={connectors}
      autoConnect
    >
      <InnerWallet>{children}</InnerWallet>
    </StarknetConfig>
  )
}
