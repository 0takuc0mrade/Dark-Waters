use starknet::ContractAddress;

#[starknet::interface]
pub trait IActions<T> {
    fn spawn_game(ref self: T, opponent: ContractAddress);
    fn spawn_game_with_stake(
        ref self: T, opponent: ContractAddress, stake_token: ContractAddress, stake_amount: u128,
    );
    fn lock_stake(ref self: T, game_id: u32);
    fn cancel_staked_game(ref self: T, game_id: u32);
    fn commit_board(ref self: T, game_id: u32, merkle_root: felt252);
    fn commit_attack(ref self: T, game_id: u32, attack_hash: felt252);
    fn reveal_attack(ref self: T, game_id: u32, x: u8, y: u8, reveal_nonce: felt252);
    fn reveal(
        ref self: T,
        game_id: u32,
        x: u8,
        y: u8,
        cell_nonce: felt252,
        is_ship: bool,
        proof: Span<felt252>,
    );
    fn claim_timeout_win(ref self: T, game_id: u32);
    fn check_hits_taken(self: @T, game_id: u32) -> u8;
}

#[starknet::interface]
pub trait IERC20<T> {
    fn transfer_from(
        ref self: T, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
    fn transfer(ref self: T, recipient: ContractAddress, amount: u256) -> bool;
}

#[dojo::contract]
pub mod Actions {
    use super::{IActions, IERC20Dispatcher, IERC20DispatcherTrait};

    use starknet::{
        ContractAddress, contract_address_const, get_block_timestamp, get_caller_address,
        get_contract_address,
    };

    use alexandria_merkle_tree::merkle_tree::poseidon::PoseidonHasherImpl;
    use alexandria_merkle_tree::merkle_tree::{Hasher, MerkleTree, MerkleTreeTrait};

    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;

    use dark_waters::models::{
        Attack, AttackCommitment, BoardCommitment, Game, GameCounter, PendingAttack, Vec2,
    };
    use dark_waters::utils::{
        compute_attack_commitment_hash, compute_board_leaf_hash, has_timed_out, is_in_bounds,
    };

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct game_spawned {
        #[key]
        pub game_id: u32,
        pub player_1: ContractAddress,
        pub player_2: ContractAddress,
        pub turn: ContractAddress,
        pub state: u8,
        pub winner: ContractAddress,
        pub last_action: u64,
        pub moves_count: u32,
        pub stake_token: ContractAddress,
        pub stake_amount: u128,
        pub stake_locked_p1: bool,
        pub stake_locked_p2: bool,
        pub stake_settled: bool,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct board_committed {
        #[key]
        pub game_id: u32,
        pub player: ContractAddress,
        pub root: felt252,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct attack_committed {
        #[key]
        pub game_id: u32,
        pub attacker: ContractAddress,
        pub attack_hash: felt252,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct attack_made {
        #[key]
        pub game_id: u32,
        pub attacker: ContractAddress,
        pub x: u8,
        pub y: u8,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct attack_revealed {
        #[key]
        pub game_id: u32,
        pub attacker: ContractAddress,
        pub x: u8,
        pub y: u8,
        pub is_hit: bool,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct game_ended {
        #[key]
        pub game_id: u32,
        pub winner: ContractAddress,
        pub reason: felt252, // 'destruction' or 'timeout'
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct stake_locked {
        #[key]
        pub game_id: u32,
        pub player: ContractAddress,
        pub token: ContractAddress,
        pub amount: u128,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct stake_settled {
        #[key]
        pub game_id: u32,
        pub winner: ContractAddress,
        pub token: ContractAddress,
        pub amount_per_player: u128,
    }

    #[abi(embed_v0)]
    impl ActionImpl of IActions<ContractState> {
        fn spawn_game(ref self: ContractState, opponent: ContractAddress) {
            let mut world = self.world_defalt();
            let caller = get_caller_address();
            let now = get_block_timestamp();

            let mut counter: GameCounter = world.read_model(1);
            let new_game_id = counter.count + 1;

            let new_game: Game = Game {
                game_id: new_game_id,
                player_1: caller,
                player_2: opponent,
                turn: caller,
                state: 0,
                winner: contract_address_const::<0>(),
                last_action: now,
                moves_count: 0,
                stake_token: contract_address_const::<0>(),
                stake_amount: 0_u128,
                stake_locked_p1: false,
                stake_locked_p2: false,
                stake_settled: true,
            };

            counter.count = new_game_id;
            world.write_model(@counter);
            world.write_model(@new_game);

            world.emit_event(
                @game_spawned {
                    game_id: new_game_id,
                    player_1: caller,
                    player_2: opponent,
                    turn: caller,
                    state: 0,
                    winner: contract_address_const::<0>(),
                    last_action: now,
                    moves_count: 0,
                    stake_token: contract_address_const::<0>(),
                    stake_amount: 0_u128,
                    stake_locked_p1: false,
                    stake_locked_p2: false,
                    stake_settled: true,
                },
            );
        }

        fn spawn_game_with_stake(
            ref self: ContractState,
            opponent: ContractAddress,
            stake_token: ContractAddress,
            stake_amount: u128,
        ) {
            let mut world = self.world_defalt();
            let caller = get_caller_address();
            let now = get_block_timestamp();

            assert!(stake_amount > 0_u128, "Invalid stake amount");
            assert!(stake_token != contract_address_const::<0>(), "Invalid stake token");

            pull_stake(caller, stake_token, stake_amount);

            let mut counter: GameCounter = world.read_model(1);
            let new_game_id = counter.count + 1;

            let new_game: Game = Game {
                game_id: new_game_id,
                player_1: caller,
                player_2: opponent,
                turn: caller,
                state: 0,
                winner: contract_address_const::<0>(),
                last_action: now,
                moves_count: 0,
                stake_token,
                stake_amount,
                stake_locked_p1: true,
                stake_locked_p2: false,
                stake_settled: false,
            };

            counter.count = new_game_id;
            world.write_model(@counter);
            world.write_model(@new_game);

            world.emit_event(
                @game_spawned {
                    game_id: new_game_id,
                    player_1: caller,
                    player_2: opponent,
                    turn: caller,
                    state: 0,
                    winner: contract_address_const::<0>(),
                    last_action: now,
                    moves_count: 0,
                    stake_token,
                    stake_amount,
                    stake_locked_p1: true,
                    stake_locked_p2: false,
                    stake_settled: false,
                },
            );
            world.emit_event(
                @stake_locked {
                    game_id: new_game_id,
                    player: caller,
                    token: stake_token,
                    amount: stake_amount,
                },
            );
        }

        fn lock_stake(ref self: ContractState, game_id: u32) {
            let mut world = self.world_defalt();
            let caller = get_caller_address();
            let mut game: Game = world.read_model(game_id);

            assert!(game.state == 0, "Game is not in setup phase");
            assert!(game.stake_amount > 0_u128, "Game has no stake");
            assert!(
                game.player_1 == caller || game.player_2 == caller, "You are not in this game",
            );

            if caller == game.player_1 {
                assert!(game.stake_locked_p1 == false, "Stake already locked");
                pull_stake(caller, game.stake_token, game.stake_amount);
                game.stake_locked_p1 = true;
            } else {
                assert!(game.stake_locked_p2 == false, "Stake already locked");
                pull_stake(caller, game.stake_token, game.stake_amount);
                game.stake_locked_p2 = true;
            }

            game.last_action = get_block_timestamp();
            world.write_model(@game);

            world.emit_event(
                @stake_locked {
                    game_id,
                    player: caller,
                    token: game.stake_token,
                    amount: game.stake_amount,
                },
            );
        }

        fn cancel_staked_game(ref self: ContractState, game_id: u32) {
            let mut world = self.world_defalt();
            let caller = get_caller_address();
            let mut game: Game = world.read_model(game_id);

            assert!(game.state == 0, "Game is not in setup phase");
            assert!(game.stake_amount > 0_u128, "Game has no stake");
            assert!(game.winner == contract_address_const::<0>(), "Game is over");
            assert!(
                game.player_1 == caller || game.player_2 == caller, "You are not in this game",
            );
            assert!(game.stake_locked_p1 && game.stake_locked_p2, "Both stakes not locked");
            assert!(has_timed_out(game.last_action, get_block_timestamp()), "Wait for timeout");

            let p1_commitment: BoardCommitment = world.read_model((game_id, game.player_1));
            let p2_commitment: BoardCommitment = world.read_model((game_id, game.player_2));
            assert!(
                p1_commitment.is_committed == false && p2_commitment.is_committed == false,
                "Board already committed",
            );

            let erc20 = IERC20Dispatcher { contract_address: game.stake_token };
            let amount = to_u256(game.stake_amount);

            let refunded_p1 = erc20.transfer(game.player_1, amount);
            assert!(refunded_p1, "Stake refund failed");
            let refunded_p2 = erc20.transfer(game.player_2, amount);
            assert!(refunded_p2, "Stake refund failed");

            game.state = 2;
            game.stake_settled = true;
            world.write_model(@game);

            world.emit_event(
                @stake_settled {
                    game_id,
                    winner: contract_address_const::<0>(),
                    token: game.stake_token,
                    amount_per_player: game.stake_amount,
                },
            );
            world.emit_event(
                @game_ended {
                    game_id,
                    winner: contract_address_const::<0>(),
                    reason: 'cancelled',
                },
            );
        }

        fn commit_board(ref self: ContractState, game_id: u32, merkle_root: felt252) {
            let mut world = self.world_defalt();
            let caller = get_caller_address();

            let mut game: Game = world.read_model(game_id);

            assert!(game.state == 0, "Game is not in setup phase");
            assert!(
                game.player_1 == caller || game.player_2 == caller, "You are not in this game",
            );

            if game.stake_amount > 0_u128 {
                if caller == game.player_1 {
                    assert!(game.stake_locked_p1, "Stake not locked");
                } else {
                    assert!(game.stake_locked_p2, "Stake not locked");
                }
            }

            let mut opponent_address = game.player_2;
            if caller == game.player_2 {
                opponent_address = game.player_1;
            }

            let player_commitment = BoardCommitment {
                game_id,
                player: caller,
                root: merkle_root,
                hits_taken: 0,
                is_committed: true,
            };

            world.write_model(@player_commitment);

            world.emit_event(@board_committed { game_id, player: caller, root: merkle_root });

            let opponent_commitment: BoardCommitment = world.read_model((game_id, opponent_address));
            game.last_action = get_block_timestamp();
            if opponent_commitment.is_committed {
                game.state = 1;
            }
            world.write_model(@game);
        }

        fn commit_attack(ref self: ContractState, game_id: u32, attack_hash: felt252) {
            let mut world = self.world_defalt();
            let caller = get_caller_address();
            let mut game: Game = world.read_model(game_id);

            assert!(game.state == 1, "Game not active");
            assert!(game.turn == caller, "Not your turn");
            assert!(game.winner == contract_address_const::<0>(), "Game is over");

            let pending_attack: PendingAttack = world.read_model(game_id);
            assert!(pending_attack.is_pending == false, "Pending attack not revealed yet");

            let existing_commitment: AttackCommitment = world.read_model((game_id, caller));
            assert!(
                existing_commitment.timestamp == 0 || existing_commitment.is_revealed,
                "Reveal committed attack first",
            );

            let new_commitment = AttackCommitment {
                game_id,
                attacker: caller,
                attack_hash,
                timestamp: get_block_timestamp(),
                is_revealed: false,
            };
            world.write_model(@new_commitment);

            game.last_action = get_block_timestamp();
            game.moves_count += 1;
            world.write_model(@game);

            world.emit_event(@attack_committed { game_id, attacker: caller, attack_hash });
        }

        fn reveal_attack(ref self: ContractState, game_id: u32, x: u8, y: u8, reveal_nonce: felt252) {
            let mut world = self.world_defalt();
            let caller = get_caller_address();
            let mut game: Game = world.read_model(game_id);

            assert!(game.state == 1, "Game not active");
            assert!(game.turn == caller, "Not your turn");
            assert!(game.winner == contract_address_const::<0>(), "Game is over");
            assert!(is_in_bounds(x, y), "Out of bounds");

            let pending_attack: PendingAttack = world.read_model(game_id);
            assert!(pending_attack.is_pending == false, "Pending attack not revealed yet");

            let mut commitment: AttackCommitment = world.read_model((game_id, caller));
            assert!(commitment.timestamp != 0, "No attack commitment found");
            assert!(commitment.is_revealed == false, "Attack commitment already revealed");

            let computed_hash = compute_attack_commitment_hash(x, y, reveal_nonce);
            assert!(computed_hash == commitment.attack_hash, "Attack reveal mismatch");

            let position = Vec2 { x, y };
            let existing_attack: Attack = world.read_model((game_id, caller, position));
            assert!(existing_attack.timestamp == 0, "Already attacked at this position");

            let new_attack = Attack {
                game_id,
                attacker: caller,
                position,
                timestamp: get_block_timestamp(),
                is_revealed: false,
                is_hit: false,
            };
            world.write_model(@new_attack);

            let pending = PendingAttack { game_id, attacker: caller, x, y, is_pending: true };
            world.write_model(@pending);

            commitment.is_revealed = true;
            world.write_model(@commitment);

            game.last_action = get_block_timestamp();
            world.write_model(@game);

            world.emit_event(@attack_made { game_id, attacker: caller, x, y });
        }

        fn reveal(
            ref self: ContractState,
            game_id: u32,
            x: u8,
            y: u8,
            cell_nonce: felt252,
            is_ship: bool,
            proof: Span<felt252>,
        ) {
            let mut world = self.world_defalt();
            let caller = get_caller_address();

            let mut game: Game = world.read_model(game_id);
            let attacker_address = game.turn;
            let position = Vec2 { x, y };

            assert!(caller != attacker_address, "Attacker cannot reveal!");

            let mut pending_attack: PendingAttack = world.read_model(game_id);
            assert!(pending_attack.is_pending, "No pending attack");
            assert!(pending_attack.attacker == attacker_address, "Pending attacker mismatch");
            assert!(pending_attack.x == x && pending_attack.y == y, "Reveal does not match pending attack");

            let mut attack_record: Attack = world.read_model((game_id, attacker_address, position));
            assert!(attack_record.timestamp != 0, "There is no recorded attack at this position");
            assert!(attack_record.is_revealed == false, "Attack has been revealed");

            let mut defender_commit: BoardCommitment = world.read_model((game_id, caller));

            let leaf_hash = compute_board_leaf_hash(x, y, cell_nonce, is_ship);

            let mut tree: MerkleTree<Hasher> = MerkleTreeTrait::new();
            let is_valid = tree.verify(defender_commit.root, leaf_hash, proof);
            assert!(is_valid, "Invalid Merkle Proof");

            attack_record.is_revealed = true;
            attack_record.is_hit = is_ship;
            world.write_model(@attack_record);

            world.emit_event(
                @attack_revealed {
                    game_id,
                    attacker: attacker_address,
                    x,
                    y,
                    is_hit: is_ship,
                },
            );

            pending_attack.is_pending = false;
            world.write_model(@pending_attack);

            game.last_action = get_block_timestamp();

            if is_ship {
                defender_commit.hits_taken += 1;
                world.write_model(@defender_commit);

                if defender_commit.hits_taken >= 10 {
                    game.state = 2;
                    game.winner = attacker_address;
                    settle_stake_if_needed(ref world, ref game);
                    world.emit_event(
                        @game_ended { game_id, winner: attacker_address, reason: 'destruction' },
                    );
                } else {
                    game.turn = caller;
                }
            } else {
                game.turn = caller;
            }

            world.write_model(@game);
        }

        fn claim_timeout_win(ref self: ContractState, game_id: u32) {
            let mut world = self.world_defalt();
            let caller = get_caller_address();
            let mut game: Game = world.read_model(game_id);

            assert!(game.state == 0 || game.state == 1, "Game is not claimable");
            assert!(game.winner == contract_address_const::<0>(), "Game is over");

            assert!(has_timed_out(game.last_action, get_block_timestamp()), "Wait for timeout");

            if game.state == 1 {
                assert!(game.turn != caller, "It's your turn to make a move");
                game.state = 2;
                game.winner = caller;
                settle_stake_if_needed(ref world, ref game);
                world.write_model(@game);
                world.emit_event(@game_ended { game_id, winner: caller, reason: 'timeout' });
                return;
            }

            assert!(game.stake_amount > 0_u128, "No staked setup timeout");
            assert!(game.stake_locked_p1 && game.stake_locked_p2, "Both stakes not locked");

            let p1_commitment: BoardCommitment = world.read_model((game_id, game.player_1));
            let p2_commitment: BoardCommitment = world.read_model((game_id, game.player_2));
            assert!(
                p1_commitment.is_committed != p2_commitment.is_committed,
                "No setup timeout winner",
            );

            let winner = if p1_commitment.is_committed {
                game.player_1
            } else {
                game.player_2
            };

            assert!(winner == caller, "Only committed player can claim");
            game.state = 2;
            game.winner = winner;
            settle_stake_if_needed(ref world, ref game);
            world.write_model(@game);
            world.emit_event(@game_ended { game_id, winner, reason: 'setup_timeout' });
        }

        fn check_hits_taken(self: @ContractState, game_id: u32) -> u8 {
            let world = self.world_defalt();
            let caller = get_caller_address();
            let player_commitment: BoardCommitment = world.read_model((game_id, caller));
            player_commitment.hits_taken
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_defalt(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"dark_waters")
        }
    }

    fn to_u256(amount: u128) -> u256 {
        u256 { low: amount, high: 0_u128 }
    }

    fn pull_stake(from: ContractAddress, token: ContractAddress, amount: u128) {
        let erc20 = IERC20Dispatcher { contract_address: token };
        let ok = erc20.transfer_from(from, get_contract_address(), to_u256(amount));
        assert!(ok, "Stake transfer_from failed");
    }

    fn settle_stake_if_needed(ref world: dojo::world::WorldStorage, ref game: Game) {
        if game.stake_amount == 0_u128 || game.stake_settled {
            return;
        }

        assert!(game.winner != contract_address_const::<0>(), "Winner not set");
        assert!(game.stake_locked_p1 && game.stake_locked_p2, "Both stakes not locked");

        let erc20 = IERC20Dispatcher { contract_address: game.stake_token };
        let amount = to_u256(game.stake_amount);

        let paid_first = erc20.transfer(game.winner, amount);
        assert!(paid_first, "Stake payout failed");
        let paid_second = erc20.transfer(game.winner, amount);
        assert!(paid_second, "Stake payout failed");

        game.stake_settled = true;
        world.emit_event(
            @stake_settled {
                game_id: game.game_id,
                winner: game.winner,
                token: game.stake_token,
                amount_per_player: game.stake_amount,
            },
        );
    }
}
