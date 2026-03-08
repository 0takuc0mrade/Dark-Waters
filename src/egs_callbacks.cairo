use starknet::ContractAddress;

#[starknet::interface]
pub trait IMetagameCallback<T> {
    fn on_game_action(ref self: T, token_id: felt252, player: ContractAddress);
    fn on_game_over(ref self: T, token_id: felt252, player: ContractAddress);
    fn on_objective_complete(
        ref self: T,
        token_id: felt252,
        player: ContractAddress,
        objective_id: felt252,
    );
}

#[starknet::interface]
pub trait IMetagameCallbackAdmin<T> {
    fn admin(self: @T) -> ContractAddress;
    fn adapter(self: @T) -> ContractAddress;
    fn trusted_caller(self: @T) -> ContractAddress;
    fn set_adapter(ref self: T, adapter: ContractAddress);
    fn set_trusted_caller(ref self: T, trusted_caller: ContractAddress);
    fn action_calls(self: @T) -> u32;
    fn game_over_calls(self: @T) -> u32;
    fn objective_calls(self: @T) -> u32;
    fn last_token_id(self: @T) -> felt252;
    fn last_player(self: @T) -> ContractAddress;
    fn last_objective_id(self: @T) -> felt252;
    fn last_score(self: @T) -> u64;
    fn last_game_over(self: @T) -> bool;
    fn token_completed(self: @T, token_id: felt252) -> bool;
    fn objective_completed(self: @T, token_id: felt252, objective_id: felt252) -> bool;
}

#[starknet::contract]
pub mod minimal_metagame_callback {
    use super::{IMetagameCallback, IMetagameCallbackAdmin};
    use dark_waters::systems::egs_adapter::{
        IMinigameTokenDataDispatcher, IMinigameTokenDataDispatcherTrait,
    };
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        admin: ContractAddress,
        adapter: ContractAddress,
        trusted_caller: ContractAddress,
        callback_lock: bool,
        action_calls: u32,
        game_over_calls: u32,
        objective_calls: u32,
        last_token_id: felt252,
        last_player: ContractAddress,
        last_objective_id: felt252,
        last_score: u64,
        last_game_over: bool,
        token_completed: Map<felt252, bool>,
        objective_completed: Map<(felt252, felt252), bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        CallbackConfigUpdated: CallbackConfigUpdated,
        GameActionSynced: GameActionSynced,
        GameOverSynced: GameOverSynced,
        ObjectiveCompleted: ObjectiveCompleted,
    }

    #[derive(Drop, starknet::Event)]
    struct CallbackConfigUpdated {
        adapter: ContractAddress,
        trusted_caller: ContractAddress,
        operator: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct GameActionSynced {
        #[key]
        token_id: felt252,
        player: ContractAddress,
        score: u64,
        game_over: bool,
    }

    #[derive(Drop, starknet::Event)]
    struct GameOverSynced {
        #[key]
        token_id: felt252,
        player: ContractAddress,
        score: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct ObjectiveCompleted {
        #[key]
        token_id: felt252,
        player: ContractAddress,
        objective_id: felt252,
        score: u64,
        game_over: bool,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        admin: ContractAddress,
        adapter: ContractAddress,
        trusted_caller: ContractAddress,
    ) {
        assert!(admin != zero_address(), "invalid admin");
        assert!(adapter != zero_address(), "invalid adapter");
        assert!(trusted_caller != zero_address(), "invalid caller");

        self.admin.write(admin);
        self.adapter.write(adapter);
        self.trusted_caller.write(trusted_caller);
    }

    #[abi(embed_v0)]
    impl AdminImpl of IMetagameCallbackAdmin<ContractState> {
        fn admin(self: @ContractState) -> ContractAddress {
            self.admin.read()
        }

        fn adapter(self: @ContractState) -> ContractAddress {
            self.adapter.read()
        }

        fn trusted_caller(self: @ContractState) -> ContractAddress {
            self.trusted_caller.read()
        }

        fn set_adapter(ref self: ContractState, adapter: ContractAddress) {
            assert_only_admin(@self);
            assert!(adapter != zero_address(), "invalid adapter");
            self.adapter.write(adapter);
            emit_config_update(ref self);
        }

        fn set_trusted_caller(ref self: ContractState, trusted_caller: ContractAddress) {
            assert_only_admin(@self);
            assert!(trusted_caller != zero_address(), "invalid caller");
            self.trusted_caller.write(trusted_caller);
            emit_config_update(ref self);
        }

        fn action_calls(self: @ContractState) -> u32 {
            self.action_calls.read()
        }

        fn game_over_calls(self: @ContractState) -> u32 {
            self.game_over_calls.read()
        }

        fn objective_calls(self: @ContractState) -> u32 {
            self.objective_calls.read()
        }

        fn last_token_id(self: @ContractState) -> felt252 {
            self.last_token_id.read()
        }

        fn last_player(self: @ContractState) -> ContractAddress {
            self.last_player.read()
        }

        fn last_objective_id(self: @ContractState) -> felt252 {
            self.last_objective_id.read()
        }

        fn last_score(self: @ContractState) -> u64 {
            self.last_score.read()
        }

        fn last_game_over(self: @ContractState) -> bool {
            self.last_game_over.read()
        }

        fn token_completed(self: @ContractState, token_id: felt252) -> bool {
            self.token_completed.read(token_id)
        }

        fn objective_completed(
            self: @ContractState, token_id: felt252, objective_id: felt252,
        ) -> bool {
            self.objective_completed.read((token_id, objective_id))
        }
    }

    #[abi(embed_v0)]
    impl CallbackImpl of IMetagameCallback<ContractState> {
        fn on_game_action(ref self: ContractState, token_id: felt252, player: ContractAddress) {
            with_callback_lock(ref self);
            assert_only_trusted_caller(@self);

            let (score, game_over) = read_game_state(@self, token_id);

            self.action_calls.write(self.action_calls.read() + 1_u32);
            write_last(ref self, token_id, player, 0, score, game_over);
            if game_over {
                self.token_completed.write(token_id, true);
            }

            self.emit(
                Event::GameActionSynced(
                    GameActionSynced { token_id, player, score, game_over },
                ),
            );
            clear_callback_lock(ref self);
        }

        fn on_game_over(ref self: ContractState, token_id: felt252, player: ContractAddress) {
            with_callback_lock(ref self);
            assert_only_trusted_caller(@self);

            let (score, game_over) = read_game_state(@self, token_id);
            assert!(game_over, "game not over");

            self.game_over_calls.write(self.game_over_calls.read() + 1_u32);
            self.token_completed.write(token_id, true);
            write_last(ref self, token_id, player, 0, score, true);

            self.emit(Event::GameOverSynced(GameOverSynced { token_id, player, score }));
            clear_callback_lock(ref self);
        }

        fn on_objective_complete(
            ref self: ContractState,
            token_id: felt252,
            player: ContractAddress,
            objective_id: felt252,
        ) {
            with_callback_lock(ref self);
            assert_only_trusted_caller(@self);

            let (score, game_over) = read_game_state(@self, token_id);

            self.objective_calls.write(self.objective_calls.read() + 1_u32);
            self.objective_completed.write((token_id, objective_id), true);
            if game_over {
                self.token_completed.write(token_id, true);
            }
            write_last(ref self, token_id, player, objective_id, score, game_over);

            self.emit(
                Event::ObjectiveCompleted(
                    ObjectiveCompleted {
                        token_id,
                        player,
                        objective_id,
                        score,
                        game_over,
                    },
                ),
            );
            clear_callback_lock(ref self);
        }
    }

    fn read_game_state(self: @ContractState, token_id: felt252) -> (u64, bool) {
        let dispatcher = IMinigameTokenDataDispatcher { contract_address: self.adapter.read() };
        let score = dispatcher.score(token_id);
        let game_over = dispatcher.game_over(token_id);
        (score, game_over)
    }

    fn write_last(
        ref self: ContractState,
        token_id: felt252,
        player: ContractAddress,
        objective_id: felt252,
        score: u64,
        game_over: bool,
    ) {
        self.last_token_id.write(token_id);
        self.last_player.write(player);
        self.last_objective_id.write(objective_id);
        self.last_score.write(score);
        self.last_game_over.write(game_over);
    }

    fn emit_config_update(ref self: ContractState) {
        self.emit(
            Event::CallbackConfigUpdated(
                CallbackConfigUpdated {
                    adapter: self.adapter.read(),
                    trusted_caller: self.trusted_caller.read(),
                    operator: get_caller_address(),
                },
            ),
        );
    }

    fn assert_only_admin(self: @ContractState) {
        assert!(get_caller_address() == self.admin.read(), "not admin");
    }

    fn assert_only_trusted_caller(self: @ContractState) {
        assert!(get_caller_address() == self.trusted_caller.read(), "not trusted caller");
    }

    fn with_callback_lock(ref self: ContractState) {
        assert!(!self.callback_lock.read(), "callback locked");
        self.callback_lock.write(true);
    }

    fn clear_callback_lock(ref self: ContractState) {
        self.callback_lock.write(false);
    }

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }
}
