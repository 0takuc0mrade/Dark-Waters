
import { useState, useEffect, useRef } from 'react';
import { RpcProvider, num } from 'starknet';
import { useAccount } from '@starknet-react/core';
import { SEPOLIA_CONFIG } from '@/src/config/sepolia-config';

const WORLD_ADDRESS = SEPOLIA_CONFIG.WORLD_ADDRESS;
const EVENT_EMITTED_SELECTOR = "0x1c93f6e4703ae90f75338f29bffbe9c1662200cee981f49afeec26e892debcd";

// Event Hashes
const GAME_SPAWNED_EVENT_HASH = "0x2506e765ec1694f56f145b20757bd19327889df50702d131f137eb4236b2839";
const BOARD_COMMITTED_EVENT_HASH = "0x2de79eb1e428c946e9dfd00f684497a7e32479e000451996515869403d982b6"; // poseidon(Actions, board_committed)
const ATTACK_REVEALED_EVENT_HASH = "0x32863952ba56dc9359e218290f6dea0636735db9d6df4b73e51cd0ba973167a";

export type GamePhase = "Setup" | "Playing" | "Finished";

export interface GameState {
    gameId: number;
    player1: string;
    player2: string;
    isPlayer1: boolean;
    isPlayer2: boolean;
    isMyTurn: boolean;
    isActive: boolean;
    winner: string | null;
    phase: GamePhase;
    isMyCommit: boolean;
}

export const useGameState = (gameId: number | null) => {
    const { address } = useAccount();
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Use a persistent provider
    const provider = useRef(new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.RPC_URL }));

    useEffect(() => {
        if (!gameId || !address) return;

        let cancelled = false;

        const fetchState = async () => {
            setIsLoading(true);
            try {
                // 1. Fetch GameSpawned
                const spawnEvents = await provider.current.getEvents({
                    address: WORLD_ADDRESS,
                    keys: [[EVENT_EMITTED_SELECTOR], [GAME_SPAWNED_EVENT_HASH]],
                    from_block: { block_number: SEPOLIA_CONFIG.DEPLOYED_BLOCK },
                    to_block: 'latest',
                    chunk_size: 1000,
                });

                if (cancelled) return;

                const spawnEvent = spawnEvents.events.find(e => e.data && Number(e.data[1]) === gameId);

                if (!spawnEvent) {
                    console.warn(`Game ${gameId} not found on-chain.`);
                    setGameState(null);
                    return;
                }

                const player1 = spawnEvent.data[3];
                const player2 = spawnEvent.data[4];

                const isP1 = BigInt(address) === BigInt(player1);
                const isP2 = BigInt(address) === BigInt(player2);

                // 2. Determine Phase
                // Default to Setup (0)
                let phase: GamePhase = "Setup";
                let isActive = true;
                let winner = null;

                // Check commitments
                // We need to know if BOTH committed to be in Playing phase.
                // Or if any attacks exist, we MUST be in Playing phase.

                // Fetch Commit events
                const commitEvents = await provider.current.getEvents({
                    address: WORLD_ADDRESS,
                    keys: [[EVENT_EMITTED_SELECTOR], [BOARD_COMMITTED_EVENT_HASH]],
                    from_block: { block_number: SEPOLIA_CONFIG.DEPLOYED_BLOCK },
                    to_block: 'latest',
                    chunk_size: 1000,
                });

                if (cancelled) return;

                const gameCommits = commitEvents.events.filter(e => e.data && Number(e.data[1]) === gameId);
                // Check unique players who committed
                // const committedPlayers = new Set(gameCommits.map(e => e.data[2])); // data[2] is player address?
                // board_committed event layout: [count, game_id, field_count, player, root]
                // Wait, need to check layout. key=game_id, data=[player, root]
                // Do events use keys for game_id? Cairo code: #[key] pub game_id: u32
                // So keys[2] (if using standard layout) or data, wait.
                // Dojo custom events: keys[0]=selector, keys[1]=event_hash, keys[2]=emitter
                // data = [key_len, key1..keyN, data_len, data1..dataN]
                // board_committed: game_id is key.
                // data: [1, game_id, 2, player, root]

                const p1Committed = gameCommits.some(e => BigInt(e.data[3]) === BigInt(player1));
                const p2Committed = gameCommits.some(e => BigInt(e.data[3]) === BigInt(player2));
                const isMyCommit = gameCommits.some(e => BigInt(e.data[3]) === BigInt(address));

                if (p1Committed && p2Committed) {
                    phase = "Playing";
                }

                // 3. Calculate Turn & Game Over
                let currentTurn = player1;
                let p1Hits = 0;
                let p2Hits = 0;

                // Fetch reveals
                const revealEvents = await provider.current.getEvents({
                     address: WORLD_ADDRESS,
                     keys: [[EVENT_EMITTED_SELECTOR], [ATTACK_REVEALED_EVENT_HASH]],
                     from_block: { block_number: SEPOLIA_CONFIG.DEPLOYED_BLOCK },
                     to_block: 'latest',
                     chunk_size: 1000,
                });

                 if (cancelled) return;

                const gameReveals = revealEvents.events.filter(e => e.data && Number(e.data[1]) === gameId);
                // If any reveals exist, we are definitely playing (or finished)
                if (gameReveals.length > 0) phase = "Playing";

                for (const rev of gameReveals) {
                    // data: [count, game_id, field_count, x, y, is_hit]
                    // Standard layout checks:
                    // attack_revealed: game_id key. x,y,is_hit data?
                    // #[key] game_id
                    // other fields data
                    // data: [1, game_id, 3, x, y, is_hit]

                    if (rev.data.length < 6) continue;

                    const isHit = Number(rev.data[5]) === 1;

                    if (isHit) {
                         if (currentTurn === player1) p1Hits++;
                         else p2Hits++;

                         if (p1Hits >= 10) { winner = player1; isActive = false; phase = "Finished"; }
                         if (p2Hits >= 10) { winner = player2; isActive = false; phase = "Finished"; }
                    } else {
                        currentTurn = (currentTurn === player1) ? player2 : player1;
                    }
                }

                const isMyTurn = BigInt(currentTurn) === BigInt(address);

                setGameState({
                    gameId,
                    player1,
                    player2,
                    isPlayer1: isP1,
                    isPlayer2: isP2,
                    isMyTurn,
                    isActive,
                    winner,
                    phase,
                    isMyCommit
                });

            } catch (error) {
                console.error("Failed to sync game state:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchState();
        const interval = setInterval(fetchState, 5000); // Polling for turn updates

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [gameId, address]);

    return { gameState, isLoading };
};

export interface GameSummary {
    gameId: number;
    opponent: string;
    isTurn: boolean; // computed locally if possible
}

export const useMyGames = () => {
    const { address } = useAccount();
    const [games, setGames] = useState<GameSummary[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const provider = useRef(new RpcProvider({ nodeUrl: SEPOLIA_CONFIG.RPC_URL }));

    useEffect(() => {
        if (!address) return;

        const fetchGames = async () => {
            setIsLoading(true);
            try {
                // Fetch all games spawned since deployment
                const events = await provider.current.getEvents({
                    address: WORLD_ADDRESS,
                    keys: [[EVENT_EMITTED_SELECTOR], [GAME_SPAWNED_EVENT_HASH]],
                    from_block: { block_number: SEPOLIA_CONFIG.DEPLOYED_BLOCK },
                    to_block: 'latest',
                    chunk_size: 1000,
                });

                const myGames: GameSummary[] = [];

                for (const event of events.events) {
                    if (!event.data || event.data.length < 5) continue;

                    const gameId = Number(event.data[1]);
                    const p1 = event.data[3];
                    const p2 = event.data[4];

                    // Check if I am a player
                    const isP1 = BigInt(p1) === BigInt(address);
                    const isP2 = BigInt(p2) === BigInt(address);

                    if (isP1 || isP2) {
                        myGames.push({
                            gameId,
                            opponent: isP1 ? p2 : p1,
                            isTurn: false // efficient computation of turn for list view is hard without indexing
                        });
                    }
                }

                // Sort by ID descending (newest first)
                setGames(myGames.sort((a, b) => b.gameId - a.gameId));

            } catch (err) {
                console.error("Failed to fetch my games", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchGames();
    }, [address]);

    return { games, isLoading };
};
