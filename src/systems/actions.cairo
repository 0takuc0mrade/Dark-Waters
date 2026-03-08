use starknet::ContractAddress;

#[starknet::interface]
pub trait IActions<T> {
    fn spawn_game(ref self: T, opponent: ContractAddress);
    fn spawn_open_game(ref self: T);
    fn spawn_game_with_stake(
        ref self: T, opponent: ContractAddress, stake_token: ContractAddress, stake_amount: u128,
    );
    fn spawn_open_game_with_stake(
        ref self: T, stake_token: ContractAddress, stake_amount: u128,
    );
    fn engage_game(ref self: T, game_id: u32);
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
    fn link_session(ref self: T, token_id: felt252, game_id: u32);
    fn commit_board_egs(ref self: T, token_id: felt252, merkle_root: felt252);
    fn commit_attack_egs(ref self: T, token_id: felt252, attack_hash: felt252);
    fn reveal_attack_egs(ref self: T, token_id: felt252, x: u8, y: u8, reveal_nonce: felt252);
    fn reveal_egs(
        ref self: T,
        token_id: felt252,
        x: u8,
        y: u8,
        cell_nonce: felt252,
        is_ship: bool,
        proof: Span<felt252>,
    );
    fn claim_timeout_win_egs(ref self: T, token_id: felt252);
    fn configure_denshokan(ref self: T, denshokan_token: ContractAddress, is_enabled: bool);
    fn initialize_denshokan(ref self: T) -> u64;
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
    use super::{
        IActions, IERC20Dispatcher, IERC20DispatcherTrait,
    };
    use core::traits::TryInto;
    use dark_waters::denshokan::{
        GameContextDetails, IERC721Dispatcher, IERC721DispatcherTrait, IMinigame,
        IMinigameRegistryDispatcher, IMinigameRegistryDispatcherTrait,
        IMinigameTokenData, IMinigameTokenDispatcher, IMinigameTokenDispatcherTrait,
        IMINIGAME_ID, ISRC5, MintGameParams, MintParams, SRC5_ID,
    };

    use starknet::{
        ContractAddress, contract_address_const, get_block_timestamp, get_caller_address,
        get_contract_address,
    };
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    use alexandria_merkle_tree::merkle_tree::poseidon::PoseidonHasherImpl;
    use alexandria_merkle_tree::merkle_tree::{Hasher, MerkleTree, MerkleTreeTrait};

    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use dojo::world::world::WORLD;
    use dojo::world::{IWorldDispatcherTrait, WorldStorage, WorldStorageTrait};

    use dark_waters::models::{
        Attack, AttackCommitment, BoardCommitment, EgsConfig, EgsSessionLink, Game, GameCounter,
        PendingAttack, Vec2,
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

    #[storage]
    struct Storage {
        egs_action_lock: bool,
    }

    const EGS_CONFIG_ID: u8 = 1_u8;
    const ACTION_COMMIT_BOARD: felt252 = 1;
    const ACTION_COMMIT_ATTACK: felt252 = 2;
    const ACTION_REVEAL_ATTACK: felt252 = 3;
    const ACTION_REVEAL: felt252 = 4;
    const ACTION_CLAIM_TIMEOUT_WIN: felt252 = 5;

    #[derive(Copy, Drop)]
    struct EgsActionContext {
        pub token_id: felt252,
        pub game_id: u32,
        pub player: ContractAddress,
        pub denshokan_token: ContractAddress,
    }

    fn dojo_init(ref self: ContractState) {
        let mut world = self.world_defalt();
        write_egs_config(ref world, zero_address(), false, false);
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

        fn spawn_open_game(ref self: ContractState) {
            let mut world = self.world_defalt();
            let caller = get_caller_address();
            let now = get_block_timestamp();

            let mut counter: GameCounter = world.read_model(1);
            let new_game_id = counter.count + 1;

            let new_game: Game = Game {
                game_id: new_game_id,
                player_1: caller,
                player_2: contract_address_const::<0>(),
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
                    player_2: contract_address_const::<0>(),
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

        fn spawn_open_game_with_stake(
            ref self: ContractState, stake_token: ContractAddress, stake_amount: u128,
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
                player_2: contract_address_const::<0>(),
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
                    player_2: contract_address_const::<0>(),
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

        fn engage_game(ref self: ContractState, game_id: u32) {
            let mut world = self.world_defalt();
            let caller = get_caller_address();
            let mut game: Game = world.read_model(game_id);

            assert!(game.state == 0, "Game is not in setup phase");
            assert!(game.player_1 != caller, "Host cannot engage own game");
            assert!(game.player_2 == contract_address_const::<0>(), "Game already engaged");

            game.player_2 = caller;
            game.last_action = get_block_timestamp();
            world.write_model(@game);

            // Re-emit canonical game snapshot so clients can update participant state from events only.
            world.emit_event(
                @game_spawned {
                    game_id,
                    player_1: game.player_1,
                    player_2: game.player_2,
                    turn: game.turn,
                    state: game.state,
                    winner: game.winner,
                    last_action: game.last_action,
                    moves_count: game.moves_count,
                    stake_token: game.stake_token,
                    stake_amount: game.stake_amount,
                    stake_locked_p1: game.stake_locked_p1,
                    stake_locked_p2: game.stake_locked_p2,
                    stake_settled: game.stake_settled,
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
            commit_board_internal(ref world, caller, game_id, merkle_root);
        }

        fn commit_attack(ref self: ContractState, game_id: u32, attack_hash: felt252) {
            let mut world = self.world_defalt();
            let caller = get_caller_address();
            commit_attack_internal(ref world, caller, game_id, attack_hash);
        }

        fn reveal_attack(ref self: ContractState, game_id: u32, x: u8, y: u8, reveal_nonce: felt252) {
            let mut world = self.world_defalt();
            let caller = get_caller_address();
            reveal_attack_internal(ref world, caller, game_id, x, y, reveal_nonce);
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
            reveal_internal(ref world, caller, game_id, x, y, cell_nonce, is_ship, proof);
        }

        fn claim_timeout_win(ref self: ContractState, game_id: u32) {
            let mut world = self.world_defalt();
            let caller = get_caller_address();
            claim_timeout_win_internal(ref world, caller, game_id);
        }

        fn link_session(ref self: ContractState, token_id: felt252, game_id: u32) {
            let caller = get_caller_address();
            let mut world = self.world_defalt();
            let config: EgsConfig = world.read_model(EGS_CONFIG_ID);

            assert!(config.is_enabled, "Denshokan disabled");
            assert!(config.denshokan_token != zero_address(), "Denshokan token unset");

            assert_token_owner(config.denshokan_token, token_id, caller);

            let game: Game = world.read_model(game_id);
            assert!(game.game_id == game_id, "game missing");
            assert!(game.player_1 == caller || game.player_2 == caller, "not game player");

            let existing: EgsSessionLink = world.read_model(token_id);
            if existing.is_linked {
                assert!(
                    existing.game_id == game_id && existing.player == caller,
                    "session already linked",
                );
                return;
            }

            world.write_model(
                @EgsSessionLink {
                    token_id,
                    game_id,
                    player: caller,
                    linked_at: get_block_timestamp(),
                    is_linked: true,
                },
            );
        }

        fn commit_board_egs(ref self: ContractState, token_id: felt252, merkle_root: felt252) {
            let caller = get_caller_address();
            with_egs_action_lock(ref self);
            let context = resolve_egs_context(self.world_defalt(), caller, token_id);
            run_pre_action(context);

            let mut world = self.world_defalt();
            commit_board_internal(ref world, caller, context.game_id, merkle_root);

            run_post_action(context);
            clear_egs_action_lock(ref self);
        }

        fn commit_attack_egs(ref self: ContractState, token_id: felt252, attack_hash: felt252) {
            let caller = get_caller_address();
            with_egs_action_lock(ref self);
            let context = resolve_egs_context(self.world_defalt(), caller, token_id);
            run_pre_action(context);

            let mut world = self.world_defalt();
            commit_attack_internal(ref world, caller, context.game_id, attack_hash);

            run_post_action(context);
            clear_egs_action_lock(ref self);
        }

        fn reveal_attack_egs(
            ref self: ContractState, token_id: felt252, x: u8, y: u8, reveal_nonce: felt252,
        ) {
            let caller = get_caller_address();
            with_egs_action_lock(ref self);
            let context = resolve_egs_context(self.world_defalt(), caller, token_id);
            run_pre_action(context);

            let mut world = self.world_defalt();
            reveal_attack_internal(ref world, caller, context.game_id, x, y, reveal_nonce);

            run_post_action(context);
            clear_egs_action_lock(ref self);
        }

        fn reveal_egs(
            ref self: ContractState,
            token_id: felt252,
            x: u8,
            y: u8,
            cell_nonce: felt252,
            is_ship: bool,
            proof: Span<felt252>,
        ) {
            let caller = get_caller_address();
            with_egs_action_lock(ref self);
            let context = resolve_egs_context(self.world_defalt(), caller, token_id);
            run_pre_action(context);

            let mut world = self.world_defalt();
            reveal_internal(ref world, caller, context.game_id, x, y, cell_nonce, is_ship, proof);

            run_post_action(context);
            clear_egs_action_lock(ref self);
        }

        fn claim_timeout_win_egs(ref self: ContractState, token_id: felt252) {
            let caller = get_caller_address();
            with_egs_action_lock(ref self);
            let context = resolve_egs_context(self.world_defalt(), caller, token_id);
            run_pre_action(context);

            let mut world = self.world_defalt();
            claim_timeout_win_internal(ref world, caller, context.game_id);

            run_post_action(context);
            clear_egs_action_lock(ref self);
        }

        fn configure_denshokan(
            ref self: ContractState, denshokan_token: ContractAddress, is_enabled: bool,
        ) {
            assert_can_configure_denshokan(self.world_defalt(), get_caller_address());

            let mut world = self.world_defalt();
            let current: EgsConfig = world.read_model(EGS_CONFIG_ID);
            write_egs_config(ref world, denshokan_token, is_enabled, current.is_initialized);
        }

        fn initialize_denshokan(ref self: ContractState) -> u64 {
            assert_can_configure_denshokan(self.world_defalt(), get_caller_address());

            let mut world = self.world_defalt();
            initialize_denshokan_internal(ref world, get_caller_address())
        }

        fn check_hits_taken(self: @ContractState, game_id: u32) -> u8 {
            let world = self.world_defalt();
            let caller = get_caller_address();
            let player_commitment: BoardCommitment = world.read_model((game_id, caller));
            player_commitment.hits_taken
        }
    }

    #[abi(embed_v0)]
    impl MinigameImpl of IMinigame<ContractState> {
        fn token_address(self: @ContractState) -> ContractAddress {
            let world = self.world_defalt();
            let config: EgsConfig = world.read_model(EGS_CONFIG_ID);
            config.denshokan_token
        }

        fn settings_address(self: @ContractState) -> ContractAddress {
            zero_address()
        }

        fn objectives_address(self: @ContractState) -> ContractAddress {
            zero_address()
        }

        fn mint_game(
            self: @ContractState,
            player_name: Option<felt252>,
            settings_id: Option<u32>,
            start: Option<u64>,
            end: Option<u64>,
            objective_id: Option<u32>,
            context: Option<GameContextDetails>,
            client_url: Option<ByteArray>,
            renderer_address: Option<ContractAddress>,
            skills_address: Option<ContractAddress>,
            to: ContractAddress,
            soulbound: bool,
            paymaster: bool,
            salt: u16,
            metadata: u16,
        ) -> felt252 {
            let world = self.world_defalt();
            let config: EgsConfig = world.read_model(EGS_CONFIG_ID);
            assert!(config.is_enabled, "Denshokan disabled");
            assert!(config.is_initialized, "Denshokan uninitialized");
            assert!(config.denshokan_token != zero_address(), "Denshokan token unset");

            let mut token = IMinigameTokenDispatcher { contract_address: config.denshokan_token };
            token.mint(
                get_contract_address(),
                player_name,
                settings_id,
                start,
                end,
                objective_id,
                context,
                client_url,
                renderer_address,
                skills_address,
                to,
                soulbound,
                paymaster,
                salt,
                metadata,
            )
        }

        fn mint_game_batch(self: @ContractState, mints: Array<MintGameParams>) -> Array<felt252> {
            let world = self.world_defalt();
            let config: EgsConfig = world.read_model(EGS_CONFIG_ID);
            assert!(config.is_enabled, "Denshokan disabled");
            assert!(config.is_initialized, "Denshokan uninitialized");
            assert!(config.denshokan_token != zero_address(), "Denshokan token unset");

            let mut token = IMinigameTokenDispatcher { contract_address: config.denshokan_token };
            let mut batch = array![];
            let mut index = 0;
            loop {
                if index >= mints.len() {
                    break;
                }

                let mint = mints.at(index);
                let context = match mint.context {
                    Option::Some(ctx) => Option::Some(ctx.clone()),
                    Option::None => Option::None,
                };
                let client_url = match mint.client_url {
                    Option::Some(url) => Option::Some(url.clone()),
                    Option::None => Option::None,
                };
                batch.append(
                    MintParams {
                        game_address: get_contract_address(),
                        player_name: *mint.player_name,
                        settings_id: *mint.settings_id,
                        start: *mint.start,
                        end: *mint.end,
                        objective_id: *mint.objective_id,
                        context,
                        client_url,
                        renderer_address: *mint.renderer_address,
                        skills_address: *mint.skills_address,
                        to: *mint.to,
                        soulbound: *mint.soulbound,
                        paymaster: *mint.paymaster,
                        salt: *mint.salt,
                        metadata: *mint.metadata,
                    },
                );
                index += 1;
            }

            token.mint_batch(batch)
        }
    }

    #[abi(embed_v0)]
    impl MinigameTokenDataImpl of IMinigameTokenData<ContractState> {
        fn score(self: @ContractState, token_id: felt252) -> u64 {
            score_for_token(self.world_defalt(), token_id)
        }

        fn game_over(self: @ContractState, token_id: felt252) -> bool {
            game_over_for_token(self.world_defalt(), token_id)
        }

        fn score_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<u64> {
            let mut scores = array![];
            for token_id in token_ids {
                scores.append(score_for_token(self.world_defalt(), *token_id));
            }
            scores
        }

        fn game_over_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<bool> {
            let mut statuses = array![];
            for token_id in token_ids {
                statuses.append(game_over_for_token(self.world_defalt(), *token_id));
            }
            statuses
        }
    }

    #[abi(embed_v0)]
    impl SRC5Impl of ISRC5<ContractState> {
        fn supports_interface(self: @ContractState, interface_id: felt252) -> bool {
            let _ = self;
            interface_id == SRC5_ID || interface_id == IMINIGAME_ID
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

    fn with_egs_action_lock(ref self: ContractState) {
        assert!(!self.egs_action_lock.read(), "EGS action locked");
        self.egs_action_lock.write(true);
    }

    fn clear_egs_action_lock(ref self: ContractState) {
        self.egs_action_lock.write(false);
    }

    fn resolve_egs_context(
        world: dojo::world::WorldStorage, caller: ContractAddress, token_id: felt252,
    ) -> EgsActionContext {
        let zero = zero_address();
        let config: EgsConfig = world.read_model(EGS_CONFIG_ID);
        assert!(config.is_enabled, "Denshokan disabled");
        assert!(config.denshokan_token != zero, "Denshokan token unset");

        let link: EgsSessionLink = world.read_model(token_id);
        assert!(link.is_linked, "session not linked");
        assert!(link.player == caller, "not linked player");

        let game: Game = world.read_model(link.game_id);
        assert!(game.game_id == link.game_id, "linked game missing");
        assert!(
            link.player == game.player_1 || link.player == game.player_2,
            "stale session link",
        );

        assert_token_owner(config.denshokan_token, token_id, caller);

        EgsActionContext {
            token_id,
            game_id: link.game_id,
            player: caller,
            denshokan_token: config.denshokan_token,
        }
    }

    fn assert_can_configure_denshokan(world: WorldStorage, caller: ContractAddress) {
        let actions_selector = world.resource_selector(@"Actions");
        let dispatcher = world.dispatcher;
        let is_authorized = dispatcher.is_owner(actions_selector, caller)
            || dispatcher.is_owner(world.namespace_hash, caller)
            || dispatcher.is_owner(WORLD, caller);
        assert!(is_authorized, "not authorized");
    }

    fn write_egs_config(
        ref world: WorldStorage,
        denshokan_token: ContractAddress,
        is_enabled: bool,
        is_initialized: bool,
    ) {
        let zero = zero_address();
        if is_enabled {
            assert!(denshokan_token != zero, "Denshokan token unset");
        }

        world.write_model(
            @EgsConfig {
                id: EGS_CONFIG_ID,
                denshokan_token,
                is_enabled,
                is_initialized,
            },
        );
    }

    fn initialize_denshokan_internal(
        ref world: WorldStorage, creator_address: ContractAddress,
    ) -> u64 {
        let mut config: EgsConfig = world.read_model(EGS_CONFIG_ID);
        assert!(config.is_enabled, "Denshokan disabled");
        assert!(config.denshokan_token != zero_address(), "Denshokan token unset");

        let token = IMinigameTokenDispatcher { contract_address: config.denshokan_token };
        let registry_address = token.game_registry_address();
        assert!(registry_address != zero_address(), "Denshokan registry unset");

        let mut registry = IMinigameRegistryDispatcher { contract_address: registry_address };
        let existing_id = registry.game_id_from_address(get_contract_address());
        let game_id = if existing_id != 0_u64 || registry.is_game_registered(get_contract_address()) {
            existing_id
        } else {
            registry.register_game(
                creator_address,
                "Dark Waters",
                "Dark Waters is an onchain naval strategy duel built on Dojo.",
                "Dark Waters",
                "Dark Waters",
                "Strategy",
                "https://dark-waters-m2fn.vercel.app/dark-waters-anchor.svg",
                Option::Some("#0b1117"),
                Option::Some("https://dark-waters-m2fn.vercel.app/"),
                Option::Some(
                    0x035d01a7689ade1f5b27e50b07c923812580bb91bd0931042a9a2f8ff07dc7ec
                        .try_into()
                        .unwrap(),
                ),
                Option::Some(0_u128),
                Option::None,
                1_u64,
            )
        };

        config.is_initialized = true;
        world.write_model(@config);
        game_id
    }

    fn run_pre_action(context: EgsActionContext) {
        let dispatcher = IMinigameTokenDispatcher { contract_address: context.denshokan_token };
        dispatcher.assert_is_playable(context.token_id);
    }

    fn run_post_action(context: EgsActionContext) {
        let mut dispatcher = IMinigameTokenDispatcher { contract_address: context.denshokan_token };
        dispatcher.update_game(context.token_id);
    }

    fn assert_token_owner(
        token_address: ContractAddress, token_id: felt252, expected_owner: ContractAddress,
    ) {
        let dispatcher = IERC721Dispatcher { contract_address: token_address };
        let owner = dispatcher.owner_of(token_id_to_u256(token_id));
        assert!(owner == expected_owner, "not token owner");
    }

    fn token_id_to_u256(token_id: felt252) -> u256 {
        token_id.into()
    }

    fn clone_context_option(value: Option<GameContextDetails>) -> Option<GameContextDetails> {
        match value {
            Option::Some(context) => Option::Some(context.clone()),
            Option::None => Option::None,
        }
    }

    fn clone_bytearray_option(value: Option<ByteArray>) -> Option<ByteArray> {
        match value {
            Option::Some(text) => Option::Some(text.clone()),
            Option::None => Option::None,
        }
    }

    fn score_for_token(world: WorldStorage, token_id: felt252) -> u64 {
        let link: EgsSessionLink = world.read_model(token_id);
        if !link.is_linked {
            return 0;
        }

        let game: Game = world.read_model(link.game_id);
        if !is_valid_link(@game, @link) || game.state != 2 {
            return 0;
        }

        if game.winner == zero_address() {
            return 0;
        }

        let opponent = opponent_of(@game, link.player);
        let opponent_commitment: BoardCommitment = world.read_model((link.game_id, opponent));

        let winner_bonus = if game.winner == link.player { 10_000_u64 } else { 0_u64 };
        let damage_bonus = u8_into_u64(opponent_commitment.hits_taken) * 100_u64;
        let speed_penalty = u32_into_u64(game.moves_count) * 10_u64;
        let speed_bonus = if speed_penalty >= 1000_u64 {
            0_u64
        } else {
            1000_u64 - speed_penalty
        };

        winner_bonus + damage_bonus + speed_bonus
    }

    fn game_over_for_token(world: WorldStorage, token_id: felt252) -> bool {
        let link: EgsSessionLink = world.read_model(token_id);
        if !link.is_linked {
            return false;
        }

        let game: Game = world.read_model(link.game_id);
        if !is_valid_link(@game, @link) {
            return false;
        }

        game.state == 2
    }

    fn is_valid_link(game: @Game, link: @EgsSessionLink) -> bool {
        if (*game).game_id != (*link).game_id {
            return false;
        }

        (*link).player == (*game).player_1 || (*link).player == (*game).player_2
    }

    fn opponent_of(game: @Game, player: ContractAddress) -> ContractAddress {
        if player == (*game).player_1 {
            (*game).player_2
        } else if player == (*game).player_2 {
            (*game).player_1
        } else {
            zero_address()
        }
    }

    fn u8_into_u64(value: u8) -> u64 {
        value.into()
    }

    fn u32_into_u64(value: u32) -> u64 {
        value.into()
    }

    fn commit_board_internal(
        ref world: dojo::world::WorldStorage,
        caller: ContractAddress,
        game_id: u32,
        merkle_root: felt252,
    ) {
        let mut game: Game = world.read_model(game_id);

        assert!(game.state == 0, "Game is not in setup phase");
        assert!(game.player_1 == caller || game.player_2 == caller, "You are not in this game");

        if game.stake_amount > 0_u128 {
            if caller == game.player_1 {
                assert!(game.stake_locked_p1, "Stake not locked");
            } else {
                assert!(game.stake_locked_p2, "Stake not locked");
            }
        }

        let opponent_address = if caller == game.player_2 { game.player_1 } else { game.player_2 };

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

    fn commit_attack_internal(
        ref world: dojo::world::WorldStorage,
        caller: ContractAddress,
        game_id: u32,
        attack_hash: felt252,
    ) {
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

    fn reveal_attack_internal(
        ref world: dojo::world::WorldStorage,
        caller: ContractAddress,
        game_id: u32,
        x: u8,
        y: u8,
        reveal_nonce: felt252,
    ) {
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

    fn reveal_internal(
        ref world: dojo::world::WorldStorage,
        caller: ContractAddress,
        game_id: u32,
        x: u8,
        y: u8,
        cell_nonce: felt252,
        is_ship: bool,
        proof: Span<felt252>,
    ) {
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

    fn claim_timeout_win_internal(
        ref world: dojo::world::WorldStorage, caller: ContractAddress, game_id: u32,
    ) {
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

        let winner = if p1_commitment.is_committed { game.player_1 } else { game.player_2 };
        assert!(winner == caller, "Only committed player can claim");

        game.state = 2;
        game.winner = winner;
        settle_stake_if_needed(ref world, ref game);
        world.write_model(@game);
        world.emit_event(@game_ended { game_id, winner, reason: 'setup_timeout' });
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

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }
}
