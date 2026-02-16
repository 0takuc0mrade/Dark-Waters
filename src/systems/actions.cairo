use starknet::ContractAddress;

#[starknet::interface]
pub trait IActions<T> {
    fn spawn_game(ref self: T, opponent: ContractAddress);
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

#[dojo::contract]
pub mod Actions {
    use super::IActions;

    use starknet::{
        ContractAddress, contract_address_const, get_block_timestamp, get_caller_address,
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

    #[abi(embed_v0)]
    impl ActionImpl of IActions<ContractState> {
        fn spawn_game(ref self: ContractState, opponent: ContractAddress) {
            let mut world = self.world_defalt();

            let caller = get_caller_address();

            let mut counter: GameCounter = world.read_model(1);
            let new_game_id = counter.count + 1;

            let new_game: Game = Game {
                game_id: new_game_id,
                player_1: caller,
                player_2: opponent,
                turn: caller,
                state: 0,
                winner: contract_address_const::<0>(),
                last_action: get_block_timestamp(),
                moves_count: 0,
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
                    last_action: get_block_timestamp(),
                    moves_count: 0,
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
            if opponent_commitment.is_committed {
                game.state = 1;
                world.write_model(@game);
            }
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

            assert!(game.state == 1, "Game is not active");
            assert!(game.winner == contract_address_const::<0>(), "Game is over");

            assert!(has_timed_out(game.last_action, get_block_timestamp()), "Wait for timeout");
            assert!(game.turn != caller, "It's your turn to make a move");

            game.state = 2;
            game.winner = caller;
            world.write_model(@game);

            world.emit_event(@game_ended { game_id, winner: caller, reason: 'timeout' });
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
}
