
import { useCallback, useState } from "react"
import { useAccount } from "@starknet-react/core"
import { CallData } from "starknet"

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

  return {
    spawnGame,
    commitBoard,
    commitAttack,
    revealAttack,
    reveal,
    isLoading,
    error,
  }
}
