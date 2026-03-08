"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAccount } from "@starknet-react/core"
import { Amount, fromAddress } from "starkzap"
import { useShipPlacement } from "@/hooks/use-ship-placement"
import { useGameActions } from "@/src/hooks/useGameActions"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { useWallet } from "@/components/wallet-provider"
import { useGameState } from "@/hooks/useGameState"
import {
  clearSelectedGameToken,
  detectNewTokenId,
  listOwnedDenshokanTokens,
  randomDenshokanSalt,
  readSelectedGameToken,
  type DenshokanTokenRecord,
  writeSelectedGameToken,
} from "@/src/lib/denshokan"
import { createStarkzapWallet } from "@/src/lib/starkzap-wallet-adapter"
import { getStakeTokenByAddress } from "@/src/lib/stake-token"
import { SEPOLIA_CONFIG } from "@/src/config/sepolia-config"
import { BoardMerkle, type Ship as MerkleShip } from "@/src/utils/merkle"
import { createNewMasterSecret, storeBoardSecrets } from "@/src/utils/secret-storage"
import { PlacementGrid } from "./placement-grid"
import { ShipControls } from "./ship-controls"

// ── localStorage keys ────────────────────────────────────────────────

const LS_GAME_ID = "dark-waters-gameId"

function formatTokenId(tokenId: string): string {
  return `${tokenId.slice(0, 10)}...${tokenId.slice(-6)}`
}

export function ShipPlacement() {
  const router = useRouter()
  const { account } = useAccount()

  const {
    ships,
    grid,
    selectedShip,
    selectedShipId,
    orientation,
    previewState,
    allPlaced,
    instructionText,
    setHoverCell,
    placeShip,
    resetBoard,
    toggleOrientation,
    selectShip,
  } = useShipPlacement()

  const { commitBoardEgs, linkSession, lockStake, mintGameToken } = useGameActions()
  const { toast } = useToast()
  const { address } = useWallet()
  const starkzapWallet = useMemo(() => createStarkzapWallet(account), [account])
  const [isCommitting, setIsCommitting] = useState(false)
  const [isMintingToken, setIsMintingToken] = useState(false)
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)
  const [isLinkingToken, setIsLinkingToken] = useState(false)
  const [hydratedGameId, setHydratedGameId] = useState<number | null>(null)
  const [missionTokens, setMissionTokens] = useState<DenshokanTokenRecord[]>([])
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const { gameState } = useGameState(hydratedGameId)

  useEffect(() => {
    if (typeof window === "undefined") return
    const gameIdStr = localStorage.getItem(LS_GAME_ID)
    if (gameIdStr) setHydratedGameId(Number(gameIdStr))
  }, [])

  const refreshMissionTokens = useCallback(
    async (preferredTokenId?: string | null) => {
      if (!address) {
        setMissionTokens([])
        setSelectedTokenId(null)
        return []
      }

      setIsLoadingTokens(true)
      try {
        const tokens = await listOwnedDenshokanTokens(address)
        setMissionTokens(tokens)

        const storedTokenId =
          hydratedGameId !== null ? readSelectedGameToken(hydratedGameId, address) : null
        const resolvedTokenId =
          preferredTokenId && tokens.some((token) => token.tokenId === preferredTokenId)
            ? preferredTokenId
            : storedTokenId && tokens.some((token) => token.tokenId === storedTokenId)
            ? storedTokenId
            : tokens.find((token) => token.playable)?.tokenId ?? tokens[0]?.tokenId ?? null

        setSelectedTokenId(resolvedTokenId)

        if (hydratedGameId !== null) {
          if (resolvedTokenId) {
            writeSelectedGameToken(hydratedGameId, address, resolvedTokenId)
          } else {
            clearSelectedGameToken(hydratedGameId, address)
          }
        }

        return tokens
      } finally {
        setIsLoadingTokens(false)
      }
    },
    [address, hydratedGameId]
  )

  useEffect(() => {
    void refreshMissionTokens()
  }, [refreshMissionTokens])

  const handleSelectToken = useCallback(
    (tokenId: string) => {
      setSelectedTokenId(tokenId)
      if (address && hydratedGameId !== null) {
        writeSelectedGameToken(hydratedGameId, address, tokenId)
      }
    },
    [address, hydratedGameId]
  )

  const handleMintToken = useCallback(async () => {
    if (!address) {
      toast({
        title: "Wallet Required",
        description: "Connect your wallet before minting a Denshokan token.",
        variant: "destructive",
      })
      return
    }

    setIsMintingToken(true)
    try {
      const beforeTokenIds = missionTokens.map((token) => token.tokenId)
      await mintGameToken(address, randomDenshokanSalt())
      const nextTokens = await refreshMissionTokens()
      const mintedTokenId = detectNewTokenId(beforeTokenIds, nextTokens)

      if (mintedTokenId) {
        handleSelectToken(mintedTokenId)
      }

      toast({
        title: "Mission token minted",
        description: mintedTokenId
          ? `Selected ${formatTokenId(mintedTokenId)} for this match.`
          : "Token minted successfully. Refresh if it does not appear immediately.",
      })
    } catch (error) {
      toast({
        title: "Mint failed",
        description: error instanceof Error ? error.message : "Transaction failed.",
        variant: "destructive",
      })
    } finally {
      setIsMintingToken(false)
    }
  }, [address, handleSelectToken, mintGameToken, missionTokens, refreshMissionTokens, toast])

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (!selectedShip) return
      if (!previewState.valid) {
        toast({
          title: "Invalid Placement",
          description:
            "Ship overlaps another vessel or extends beyond the grid.",
          variant: "destructive",
        })
        return
      }
      placeShip(row, col)
      toast({
        title: `${selectedShip.name} Deployed`,
        description: `Positioned at sector ${String.fromCharCode(65 + row)}${col + 1}.`,
      })
    },
    [selectedShip, previewState.valid, placeShip, toast]
  )

  const handleCellHover = useCallback(
    (row: number, col: number) => {
      setHoverCell({ row, col })
    },
    [setHoverCell]
  )

  const handleCellLeave = useCallback(() => {
    setHoverCell(null)
  }, [setHoverCell])

  const handleReset = useCallback(() => {
    resetBoard()
    toast({
      title: "Board Cleared",
      description: "All ships have been recalled to port.",
    })
  }, [resetBoard, toast])

  const ensureLinkedToken = useCallback(
    async (gameId: number) => {
      if (!address) {
        throw new Error("Connect your wallet before linking a Denshokan token.")
      }
      if (!selectedTokenId) {
        throw new Error("Select or mint a Denshokan token before committing your board.")
      }

      const token = missionTokens.find((entry) => entry.tokenId === selectedTokenId)
      if (!token) {
        throw new Error("Selected Denshokan token is no longer available. Refresh and retry.")
      }
      if (!token.playable) {
        throw new Error("Selected Denshokan token is not playable.")
      }

      setIsLinkingToken(true)
      try {
        await linkSession(selectedTokenId, gameId)
        writeSelectedGameToken(gameId, address, selectedTokenId)
        return selectedTokenId
      } finally {
        setIsLinkingToken(false)
      }
    },
    [address, linkSession, missionTokens, selectedTokenId]
  )

  // ── Confirm & Commit Board On-Chain ────────────────────────────────

  const handleConfirm = useCallback(async () => {
    const gameIdStr = typeof window !== "undefined" ? localStorage.getItem(LS_GAME_ID) : null
    if (!gameIdStr) {
      toast({
        title: "No Game Found",
        description: "Create a game from the lobby first.",
        variant: "destructive",
      })
      return
    }

    const gameId = Number(gameIdStr)
    if (!Number.isFinite(gameId) || gameId <= 0) {
      toast({
        title: "Invalid Game",
        description: "The stored game id is invalid. Return to lobby and create/join again.",
        variant: "destructive",
      })
      return
    }
    if (hydratedGameId !== gameId) setHydratedGameId(gameId)

    // Build the 10×10 board array for the Merkle tree
    // grid[row][col] where row = y, col = x
    const board: MerkleShip[] = []
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const cell = grid[y][x]
        board.push({
          x,
          y,
          is_ship: cell.shipId !== null,
        })
      }
    }

    if (!address) {
      toast({
        title: "Wallet Required",
        description: "Connect your wallet before committing your board.",
        variant: "destructive",
      })
      return
    }

    // Generate one master secret and derive per-cell nonces from it.
    const masterSecret = createNewMasterSecret()

    // Build Merkle tree
    const merkle = new BoardMerkle(board, masterSecret)
    const root = merkle.getRoot()
    const rootHex = "0x" + root.toString(16)

    setIsCommitting(true)
    toast({
      title: "Committing Board…",
      description: "Encrypting your fleet positions on-chain.",
    })

    try {
      const tokenId = await ensureLinkedToken(gameId)

      if (gameState?.isStakedMatch && !gameState.myStakeLocked) {
        const tokenMeta = getStakeTokenByAddress(gameState.stakeToken)
        if (!tokenMeta) {
          throw new Error("Unsupported stake token for this match.")
        }
        if (!starkzapWallet) {
          throw new Error("Wallet is not ready to approve stake transfer.")
        }

        const stakeAmount = Amount.fromRaw(BigInt(gameState.stakeAmount), tokenMeta.token)

        toast({
          title: "Approving Stake Token…",
          description: "Approving escrow spend before locking stake.",
        })

        const approveTx = await starkzapWallet
          .tx()
          .approve(tokenMeta.token, fromAddress(SEPOLIA_CONFIG.ACTIONS_ADDRESS), stakeAmount)
          .send()
        await approveTx.wait()

        toast({
          title: "Locking Stake…",
          description: "Submitting stake lock transaction before board commit.",
        })
        await lockStake(gameId)
      }

      const recoveryPackage = await storeBoardSecrets(gameId, address, board, masterSecret)

      const result = await commitBoardEgs(tokenId, rootHex)
      if (result) {
        const serialized = JSON.stringify(recoveryPackage)
        try {
          await navigator.clipboard.writeText(serialized)
          toast({
            title: "Recovery Package Copied",
            description: "Backup package copied. Keep it safe to restore on new sessions/devices.",
          })
        } catch {
          toast({
            title: "Save Recovery Package",
            description:
              "Clipboard access failed. Open devtools and copy this package from localStorage if needed.",
          })
        }

        toast({
          title: "Board Committed!",
          description: "Fleet commitment stored and encrypted secrets saved. Preparing for battle…",
        })

        // Navigate to home to let the main logic handle phase routing
        setTimeout(() => {
          router.push("/")
        }, 1500)
      }
    } catch (err) {
      console.error("Board commit failed:", err)
      toast({
        title: "Commit Failed",
        description: err instanceof Error ? err.message : "Transaction failed.",
        variant: "destructive",
      })
    } finally {
      setIsCommitting(false)
    }
  }, [
    grid,
    commitBoardEgs,
    lockStake,
    toast,
    router,
    address,
    ensureLinkedToken,
    gameState,
    hydratedGameId,
    starkzapWallet,
  ])

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6 lg:py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Deploy Your Fleet
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Position your ships on the grid. Click to place, rotate to change
          orientation.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Denshokan Mission Token</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Select a playable token for this match. Board commit and combat actions route through
              the official Denshokan flow.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshMissionTokens(selectedTokenId)}
              disabled={isLoadingTokens || isMintingToken}
            >
              {isLoadingTokens ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleMintToken()}
              disabled={!address || isMintingToken || isLoadingTokens}
            >
              {isMintingToken ? "Minting..." : "Mint Token"}
            </Button>
          </div>
        </div>

        {!address ? (
          <p className="mt-3 text-xs text-amber-200">
            Connect your wallet to load or mint Denshokan tokens.
          </p>
        ) : missionTokens.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            No Dark Waters Denshokan tokens found for this wallet yet.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {missionTokens.map((token) => {
              const isSelected = token.tokenId === selectedTokenId
              return (
                <button
                  key={token.tokenId}
                  type="button"
                  onClick={() => handleSelectToken(token.tokenId)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? "border-cyan-400/50 bg-cyan-500/10"
                      : "border-border/70 bg-background/40 hover:border-cyan-400/30"
                  }`}
                >
                  <p className="font-mono text-xs text-foreground">{formatTokenId(token.tokenId)}</p>
                  <p className={`mt-1 text-[11px] ${token.playable ? "text-emerald-300" : "text-amber-200"}`}>
                    {token.playable ? "Playable" : "Not playable"}
                  </p>
                </button>
              )
            })}
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          {selectedTokenId
            ? `Selected token: ${formatTokenId(selectedTokenId)}${isLinkingToken ? " • linking…" : ""}`
            : "Select or mint a token before committing your fleet."}
        </p>
      </div>

      {/* Main layout: grid + controls */}
      <div className="flex flex-col items-start gap-6 lg:flex-row lg:gap-8">
        {/* Grid area */}
        <div className="flex-1">
          <div className="rounded-lg border border-border bg-card p-3 shadow-sm md:p-4">
            <PlacementGrid
              grid={grid}
              previewCells={previewState.cells}
              previewValid={previewState.valid}
              hasSelectedShip={selectedShip !== null}
              onCellHover={handleCellHover}
              onCellLeave={handleCellLeave}
              onCellClick={handleCellClick}
            />
          </div>

          {/* Mobile orientation shortcut */}
          <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted-foreground lg:hidden">
            <kbd className="rounded border border-border bg-secondary px-2 py-1 font-mono text-xs">
              Tap
            </kbd>
            <span>to place ship</span>
          </div>
        </div>

        {/* Controls panel */}
        <ShipControls
          ships={ships}
          selectedShipId={selectedShipId}
          orientation={orientation}
          allPlaced={allPlaced}
          instructionText={instructionText}
          onSelectShip={selectShip}
          onToggleOrientation={toggleOrientation}
          onReset={handleReset}
          onConfirm={handleConfirm}
        />
      </div>

      {/* Committing overlay */}
      {isCommitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm font-medium text-foreground">
              Encrypting fleet positions…
            </p>
            <p className="text-xs text-muted-foreground">
              Submitting Merkle root on-chain
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
