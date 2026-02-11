"use client"

import React, { createContext, useContext, useEffect, useMemo } from "react"
import {
  StarknetConfig,
  jsonRpcProvider,
  useConnect,
  useAccount,
  useDisconnect,
} from "@starknet-react/core"
import { devnet } from "@starknet-react/chains"
import { BurnerConnector } from "../src/libre/burner-connector"

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

  const burner = useMemo(
    () => connectors.find((c) => c.id === "burner-wallet"),
    [connectors],
  )

  // Auto-connect on mount
  useEffect(() => {
    if (status === "disconnected" && burner) {
      console.log("Auto-connecting to Burner Wallet…")
      connect({ connector: burner })
    }
  }, [status, burner, connect])

  const handleConnect = () => {
    if (burner) connect({ connector: burner })
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
  const connectors = useMemo(() => [new BurnerConnector()], [])

  const provider = jsonRpcProvider({
    rpc: () => ({ nodeUrl: "http://localhost:5050" }),
  })

  return (
    <StarknetConfig
      chains={[devnet]}
      provider={provider}
      connectors={connectors}
    >
      <InnerWallet>{children}</InnerWallet>
    </StarknetConfig>
  )
}
