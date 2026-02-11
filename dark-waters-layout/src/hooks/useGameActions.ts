
import { useCallback, useState } from 'react';
import { useAccount } from '@starknet-react/core';
import { CallData } from 'starknet';

const CONTRACT_ADDRESS = '0x01b7e17ad6bbc599b91ae78065708d5d49d6eaccf97908f36e9c1066d7c7085f';

export const useGameActions = () => {
    const { account } = useAccount();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const execute = useCallback(async (entrypoint: string, args: any[]) => {
        if (!account) {
            console.error("No account connected");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            // Compile calldata (handles array lengths for Spans etc.)
            const calldata = CallData.compile(args);

            const result = await account.execute({
                contractAddress: CONTRACT_ADDRESS,
                entrypoint,
                calldata
            });
            console.log(`Transaction submitted for ${entrypoint}:`, result.transaction_hash);

            // Wait for receipt so callers can parse events
            const receipt = await account.waitForTransaction(result.transaction_hash);
            console.log(`Transaction confirmed for ${entrypoint}`);

            return { transaction_hash: result.transaction_hash, receipt };
        } catch (err) {
            console.error(`Error executing ${entrypoint}:`, err);
            setError(err as Error);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [account]);

    const spawnGame = useCallback(async (opponent: string) => {
        return execute('spawn_game', [opponent]);
    }, [execute]);

    const commitBoard = useCallback(async (gameId: number, root: string) => {
        return execute('commit_board', [gameId, root]);
    }, [execute]);

    const attack = useCallback(async (gameId: number, x: number, y: number) => {
        return execute('attack', [gameId, x, y]);
    }, [execute]);

    const reveal = useCallback(async (gameId: number, x: number, y: number, salt: string, isShip: boolean, proof: string[]) => {
        // [game_id, x, y, salt, is_ship, proof]
        // CallData.compile handles the array 'proof' by adding its length as a prefix (Span serialization)
        return execute('reveal', [gameId, x, y, salt, isShip ? 1 : 0, proof]);
    }, [execute]);

    return {
        spawnGame,
        commitBoard,
        attack,
        reveal,
        isLoading,
        error
    };
};
