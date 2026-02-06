use starknet::ContractAddress;


#[starknet::interface]
pub trait IActions<T>{
    fn spawn_game(ref self: T, opponent: ContractAddress);
    fn commit_board(ref self: T, game_id: u32, merkle_root: felt252);
}

#[dojo::contract]
pub mod Actions{
    use super::IActions;

    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, contract_address_const};
    use dojo::model::ModelStorage;

    use dark_waters::models::{Game, GameCounter, BoardCommitment};

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
                winner: contract_address_const::<0>(),
            };

            counter.count = new_game_id;

            world.write_model(@counter);
            world.write_model(@new_game);
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

            let opponent_commitment: BoardCommitment = world.read_model((game_id, opponent_address));

            if opponent_commitment.is_committed{
                //if the opponent is ready to battle
                game.state = 1; //state is set to playing
                world.write_model(@game);
            }
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait{
        fn world_defalt(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"dark_waters")
        }
    }
}