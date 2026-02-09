use starknet::ContractAddress;



#[starknet::interface]
pub trait IActions<T>{
    fn spawn_game(ref self: T, opponent: ContractAddress);
    fn commit_board(ref self: T, game_id: u32, merkle_root: felt252);
    fn attack(ref self: T, game_id: u32, x: u8, y: u8);
    fn reveal(ref self: T, game_id: u32, x: u8, y: u8, salt: felt252, is_ship: bool, proof: Span<felt252>);
    fn claim_timeout_win(ref self: T, game_id: u32);
    fn check_hits_taken(self: @T, game_id: u32) -> u8;
}

#[dojo::contract]
pub mod Actions{
    use super::IActions;

    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, contract_address_const};

    use alexandria_merkle_tree::merkle_tree::{Hasher, MerkleTree, MerkleTreeTrait};

    use alexandria_merkle_tree::merkle_tree::poseidon::PoseidonHasherImpl;

    use core::poseidon::{poseidon_hash_span};

    use dojo::model::ModelStorage;

    use dojo::event::EventStorage;

    use dark_waters::models::{Game, GameCounter, BoardCommitment, Vec2, Attack};

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct game_spawned{
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
    impl ActionImpl of IActions<ContractState>{
        fn spawn_game(ref self: ContractState, opponent: ContractAddress){
            let mut world = self.world_defalt();

            let caller = get_caller_address();

            let mut counter: GameCounter = world.read_model(1);

            let new_game_id = counter.count + 1;

            //create new game struct
            let new_game: Game = Game{
                game_id: new_game_id,
                player_1: caller,
                player_2: opponent,
                turn: caller,
                state: 0,
                //zero address
                winner: contract_address_const::<0>(),
                last_action: get_block_timestamp(),
                moves_count: 0,
            };

            counter.count = new_game_id;

            world.write_model(@counter);
            world.write_model(@new_game);

            world.emit_event(@game_spawned { game_id: new_game_id , player_1: caller, player_2: opponent, turn: caller, state: 0, winner: contract_address_const::<0>(), last_action: get_block_timestamp(), moves_count: 0 });
        }

        fn commit_board(ref self: ContractState, game_id: u32, merkle_root: felt252){
            let mut world = self.world_defalt();
            let caller = get_caller_address();

            let mut game: Game = world.read_model(game_id);

            assert!(game.state == 0, "Game is not in setup phase");
            assert!(game.player_1 == caller || game.player_2 == caller, "You are not in this game");

            //calculate the opponent's address
            let mut opponent_address = game.player_2;
            if caller == game.player_2 {
                opponent_address = game.player_1;
            }

            let player_commitment = BoardCommitment { game_id, player: caller, root: merkle_root, hits_taken: 0, is_committed: true };

            world.write_model(@player_commitment);

            //emit event
            world.emit_event(@board_committed { game_id, player: caller, root: merkle_root });

            let opponent_commitment: BoardCommitment = world.read_model((game_id, opponent_address));

            if opponent_commitment.is_committed{
                //if the opponent is ready to battle
                game.state = 1; //state is set to playing
                world.write_model(@game);
            }
        }

        fn attack(ref self: ContractState, game_id: u32, x: u8, y: u8){
            let mut world = self.world_defalt();
            let caller = get_caller_address();

            let mut game: Game = world.read_model(game_id);

            assert!(game.state == 1, "Game not active");
            assert!(game.turn == caller, "Not your turn");
            assert!(game.winner == contract_address_const::<0>(), "Game is over");
            assert!(x < 10 && y < 10, "Out of bounds");

            //check for duplicate attacks
            //there is always a timestamp for a postion you have attacked
            //if there is no timestamp for a particular position, it means you haven't attacked that spot yet
            let position = Vec2{x, y};
            let existing_attack:Attack = world.read_model((game_id, caller, position));

            assert!(existing_attack.timestamp == 0, "Already attacked at this position");

            let new_attack = Attack {
                game_id,
                attacker: caller,
                position,
                timestamp: get_block_timestamp(), // Save time for timeout logic
                is_revealed: false,               // The "Question" is asked
                is_hit: false                     // the answer is unknown
            };

            game.last_action = get_block_timestamp();
            game.moves_count += 1;
            world.write_model(@game);

            world.write_model(@new_attack);

            world.emit_event(@attack_made { game_id, attacker: caller, x, y });
        }

        fn reveal(ref self: ContractState, game_id: u32, x: u8, y: u8, salt: felt252, is_ship: bool, proof: Span<felt252>){
            let mut world = self.world_defalt();
            let caller = get_caller_address();

            let mut game: Game = world.read_model(game_id);
            let position = Vec2{x,y};

            //remember, the person calling reveal is always the defender, so the the attacker is still the one with the game turnfn reveal(ref self: T, game_id: u32, x: u8, y: u8, salt: felt252, is_ship: bool, proof: Span<felt252>);
            let attacker_address = game.turn;

            assert!(caller != attacker_address, "Attacker cannot reveal!");

            let mut attack_record: Attack = world.read_model((game_id, attacker_address, position));

            assert!(attack_record.timestamp != 0, "There is no recorded attack at this position");
            assert!(attack_record.is_revealed == false, "Attack has been revealed");

            let mut defender_commit: BoardCommitment = world.read_model((game_id, caller));

            //drafting a merkle root for verification
            let mut leaf_data = ArrayTrait::new();
            leaf_data.append(x.into());
            leaf_data.append(y.into());
            leaf_data.append(salt);
            leaf_data.append(if is_ship { 1 } else { 0 });
            let leaf_hash = poseidon_hash_span(leaf_data.span());

            //verify the merkle proof
            let mut tree: MerkleTree<Hasher> = MerkleTreeTrait::new();

            let is_valid = tree.verify(
                defender_commit.root,
                leaf_hash,
                proof
            );

            assert!(is_valid, "Invalid Merkle Proof");

            //update game state
            attack_record.is_revealed = true;
            attack_record.is_hit = is_ship;
            world.write_model(@attack_record);

            world.emit_event(@attack_revealed { game_id, x, y, is_hit: is_ship });

            if is_ship {
                // Register the Hit
                defender_commit.hits_taken += 1;
                world.write_model(@defender_commit);

                // WIN CONDITION CHECK
                if defender_commit.hits_taken >= 10 {
                    game.state = 2; // Finished
                    game.winner = attacker_address;
                    // We don't swap turns because the game is over
                } else {
                    // Game continues, Swap Turn
                    game.turn = caller;
                }
            } else {
                // Miss: Just swap turn
                game.turn = caller;
            }

            // Save the Game State change
            world.write_model(@game)
        }

        fn claim_timeout_win(ref self: ContractState, game_id: u32){
            let mut world = self.world_defalt();
            let caller = get_caller_address();

            let mut game:Game = world.read_model(game_id);

            assert!(game.state == 1, "Game is not active");
            assert!(game.winner == contract_address_const::<0>(), "Game is over");

            //time of inactivity
            let time_passed = get_block_timestamp() - game.last_action;

            //there's a 2 minutes timer for a move to be made
            assert!(time_passed > 120, "Wait for timeout");

            //you can't claim timeout when its your turn
            assert!(game.turn != caller, "It's your turn to make a move");

            game.state = 2; //game over
            game.winner = caller; //you are automatically the winner
            world.write_model(@game);

            world.emit_event(@game_ended { game_id, winner: caller, reason: 'timeout' });
        }

        fn check_hits_taken(self: @ContractState, game_id: u32) -> u8{
            let world = self.world_defalt();
            let caller = get_caller_address();

            let player_commitment: BoardCommitment = world.read_model((game_id, caller));

            player_commitment.hits_taken
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait{
        fn world_defalt(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"dark_waters")
        }
    }
}