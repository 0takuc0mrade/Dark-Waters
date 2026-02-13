
import { useCallback, useState } from 'react';
import { useAccount } from '@starknet-react/core';
import { CallData } from 'starknet';

import { SEPOLIA_CONFIG } from '@/src/config/sepolia-config';

const CONTRACT_ADDRESS = SEPOLIA_CONFIG.ACTIONS_ADDRESS;

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
            const calldata = CallData.compile(args);

            console.log(`[GameActions] Executing ${entrypoint}`, {
                contractAddress: CONTRACT_ADDRESS,
                accountAddress: account.address,
                calldata,
            });

            // The Cartridge Controller (keychain iframe) handles nonce,
            // fee estimation, and signing internally via wallet_addInvokeTransaction.
            // We only pass calls — no nonce/options are supported.
            const result = await account.execute([{
                contractAddress: CONTRACT_ADDRESS,
                entrypoint,
                calldata
            }]);

            console.log(`Transaction submitted for ${entrypoint}:`, result.transaction_hash);

            const receipt = await account.waitForTransaction(result.transaction_hash);
            console.log(`Transaction confirmed for ${entrypoint}`);

            return { transaction_hash: result.transaction_hash, receipt };
        } catch (err: any) {
            console.error(`Error executing ${entrypoint}:`, err);
            if (err?.data) {
                console.error(`Error data:`, JSON.stringify(err.data, null, 2));
            }
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
