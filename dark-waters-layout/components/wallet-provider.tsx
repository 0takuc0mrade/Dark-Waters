"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react"
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
        { name: "Spawn Open Game", entrypoint: "spawn_open_game" },
        { name: "Spawn Game With Stake", entrypoint: "spawn_game_with_stake" },
        { name: "Spawn Open Game With Stake", entrypoint: "spawn_open_game_with_stake" },
        { name: "Engage Game", entrypoint: "engage_game" },
        { name: "Lock Stake", entrypoint: "lock_stake" },
        { name: "Cancel Staked Game", entrypoint: "cancel_staked_game" },
        { name: "Commit Board", entrypoint: "commit_board" },
        { name: "Commit Attack", entrypoint: "commit_attack" },
        { name: "Reveal Attack", entrypoint: "reveal_attack" },
        { name: "Reveal", entrypoint: "reveal" },
        { name: "Claim Timeout Win", entrypoint: "claim_timeout_win" },
        { name: "Link Session", entrypoint: "link_session" },
        { name: "Commit Board EGS", entrypoint: "commit_board_egs" },
        { name: "Commit Attack EGS", entrypoint: "commit_attack_egs" },
        { name: "Reveal Attack EGS", entrypoint: "reveal_attack_egs" },
        { name: "Reveal EGS", entrypoint: "reveal_egs" },
        { name: "Claim Timeout Win EGS", entrypoint: "claim_timeout_win_egs" },
        { name: "Mint Game Token", entrypoint: "mint_game" },
        { name: "Mint Game Token Batch", entrypoint: "mint_game_batch" },
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

const LS_CONNECTOR_PREF = "dark-waters-connector-preference"

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
  const triedAutoConnectRef = useRef(false)

  const controller = useMemo(
    () => connectors.find((c) => c.id === "controller"),
    [connectors],
  )

  const handleConnect = useCallback(() => {
    if (!controller) return
    localStorage.setItem(LS_CONNECTOR_PREF, "controller")
    connect({ connector: controller })
  }, [connect, controller])

  const handleDisconnect = useCallback(() => {
    localStorage.removeItem(LS_CONNECTOR_PREF)
    disconnect()
  }, [disconnect])

  useEffect(() => {
    if (!controller) return
    if (status !== "disconnected") return
    if (triedAutoConnectRef.current) return

    const preferred = localStorage.getItem(LS_CONNECTOR_PREF)
    if (preferred !== "controller") return

    triedAutoConnectRef.current = true
    connect({ connector: controller })
  }, [connect, controller, status])

  useEffect(() => {
    if (status === "connected") {
      localStorage.setItem(LS_CONNECTOR_PREF, "controller")
      triedAutoConnectRef.current = true
    }
  }, [status])

  return (
    <WalletContext.Provider
      value={{
        isConnected: status === "connected",
        address,
        connect: handleConnect,
        disconnect: handleDisconnect,
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
