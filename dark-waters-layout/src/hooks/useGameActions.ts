
import { useCallback, useState } from "react"
import { useAccount } from "@starknet-react/core"
import { CairoOption, CairoOptionVariant, CallData } from "starknet"

import { SEPOLIA_CONFIG } from "@/src/config/sepolia-config"
import { logEvent } from "@/src/utils/logger"

const CONTRACT_ADDRESS = SEPOLIA_CONFIG.ACTIONS_ADDRESS

export const useGameActions = () => {
  const { account } = useAccount()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const execute = useCallback(
    async (entrypoint: string, args: any[]) => {
      if (!account) {
        logEvent("warn", {
          code: "W_NO_ACCOUNT",
          message: "Skipped contract execution because no account is connected.",
          metadata: { entrypoint },
        })
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const calldata = CallData.compile(args)
        logEvent("info", {
          code: "TX_EXECUTE",
          message: `Executing ${entrypoint}`,
          metadata: {
            entrypoint,
            contractAddress: CONTRACT_ADDRESS,
            accountAddress: account.address,
          },
        })

        const result = await account.execute([
          {
            contractAddress: CONTRACT_ADDRESS,
            entrypoint,
            calldata,
          },
        ])

        const receipt = await account.waitForTransaction(result.transaction_hash)
        logEvent("info", {
          code: "TX_CONFIRMED",
          message: `Confirmed ${entrypoint}`,
          metadata: { entrypoint, transactionHash: result.transaction_hash },
        })
        return { transaction_hash: result.transaction_hash, receipt }
      } catch (err: any) {
        logEvent("error", {
          code: "E_TX_EXECUTION",
          message: `Execution failed for ${entrypoint}`,
          metadata: { entrypoint, error: err?.message ?? String(err), errorData: err?.data },
        })
        setError(err as Error)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [account]
  )

  const spawnGame = useCallback(
    async (opponent: string) => execute("spawn_game", [opponent]),
    [execute]
  )

  const spawnOpenGame = useCallback(
    async () => execute("spawn_open_game", []),
    [execute]
  )

  const spawnGameWithStake = useCallback(
    async (opponent: string, stakeToken: string, stakeAmount: string) =>
      execute("spawn_game_with_stake", [opponent, stakeToken, stakeAmount]),
    [execute]
  )

  const spawnOpenGameWithStake = useCallback(
    async (stakeToken: string, stakeAmount: string) =>
      execute("spawn_open_game_with_stake", [stakeToken, stakeAmount]),
    [execute]
  )

  const engageGame = useCallback(
    async (gameId: number) => execute("engage_game", [gameId]),
    [execute]
  )

  const lockStake = useCallback(
    async (gameId: number) => execute("lock_stake", [gameId]),
    [execute]
  )

  const cancelStakedGame = useCallback(
    async (gameId: number) => execute("cancel_staked_game", [gameId]),
    [execute]
  )

  const commitBoard = useCallback(
    async (gameId: number, root: string) => execute("commit_board", [gameId, root]),
    [execute]
  )

  const commitAttack = useCallback(
    async (gameId: number, attackHash: string) => execute("commit_attack", [gameId, attackHash]),
    [execute]
  )

  const revealAttack = useCallback(
    async (gameId: number, x: number, y: number, revealNonce: string) =>
      execute("reveal_attack", [gameId, x, y, revealNonce]),
    [execute]
  )

  const reveal = useCallback(
    async (
      gameId: number,
      x: number,
      y: number,
      cellNonce: string,
      isShip: boolean,
      proof: string[]
    ) => execute("reveal", [gameId, x, y, cellNonce, isShip ? 1 : 0, proof]),
    [execute]
  )

  const claimTimeoutWin = useCallback(
    async (gameId: number) => execute("claim_timeout_win", [gameId]),
    [execute]
  )

  const linkSession = useCallback(
    async (tokenId: string, gameId: number) => execute("link_session", [tokenId, gameId]),
    [execute]
  )

  const commitBoardEgs = useCallback(
    async (tokenId: string, root: string) => execute("commit_board_egs", [tokenId, root]),
    [execute]
  )

  const commitAttackEgs = useCallback(
    async (tokenId: string, attackHash: string) =>
      execute("commit_attack_egs", [tokenId, attackHash]),
    [execute]
  )

  const revealAttackEgs = useCallback(
    async (tokenId: string, x: number, y: number, revealNonce: string) =>
      execute("reveal_attack_egs", [tokenId, x, y, revealNonce]),
    [execute]
  )

  const revealEgs = useCallback(
    async (
      tokenId: string,
      x: number,
      y: number,
      cellNonce: string,
      isShip: boolean,
      proof: string[]
    ) => execute("reveal_egs", [tokenId, x, y, cellNonce, isShip ? 1 : 0, proof]),
    [execute]
  )

  const claimTimeoutWinEgs = useCallback(
    async (tokenId: string) => execute("claim_timeout_win_egs", [tokenId]),
    [execute]
  )

  const configureDenshokan = useCallback(
    async (denshokanToken: string, isEnabled: boolean) =>
      execute("configure_denshokan", [denshokanToken, isEnabled ? 1 : 0]),
    [execute]
  )

  const initializeDenshokan = useCallback(
    async () => execute("initialize_denshokan", []),
    [execute]
  )

  const mintGameToken = useCallback(
    async (to: string, salt: number) =>
      execute("mint_game", [
        new CairoOption(CairoOptionVariant.None),
        new CairoOption(CairoOptionVariant.None),
        new CairoOption(CairoOptionVariant.None),
        new CairoOption(CairoOptionVariant.None),
        new CairoOption(CairoOptionVariant.None),
        new CairoOption(CairoOptionVariant.None),
        new CairoOption(CairoOptionVariant.None),
        new CairoOption(CairoOptionVariant.None),
        new CairoOption(CairoOptionVariant.None),
        to,
        false,
        false,
        salt,
        0,
      ]),
    [execute]
  )

  return {
    spawnGame,
    spawnOpenGame,
    spawnGameWithStake,
    spawnOpenGameWithStake,
    engageGame,
    lockStake,
    cancelStakedGame,
    commitBoard,
    commitAttack,
    revealAttack,
    reveal,
    claimTimeoutWin,
    linkSession,
    commitBoardEgs,
    commitAttackEgs,
    revealAttackEgs,
    revealEgs,
    claimTimeoutWinEgs,
    configureDenshokan,
    initializeDenshokan,
    mintGameToken,
    isLoading,
    error,
  }
}
