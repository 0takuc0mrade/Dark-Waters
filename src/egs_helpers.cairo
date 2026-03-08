use starknet::ContractAddress;

#[starknet::interface]
pub trait IMinimalSessionTokenAdmin<T> {
    fn admin(self: @T) -> ContractAddress;
    fn mint(ref self: T, to: ContractAddress, token_id: felt252);
    fn set_owner(ref self: T, token_id: felt252, to: ContractAddress);
}

#[starknet::interface]
pub trait IMinimalActionHooksAdmin<T> {
    fn admin(self: @T) -> ContractAddress;
    fn set_fail_pre(ref self: T, should_fail: bool);
    fn set_fail_post(ref self: T, should_fail: bool);
    fn reset(ref self: T);
    fn pre_calls(self: @T) -> u32;
    fn post_calls(self: @T) -> u32;
    fn last_token_id(self: @T) -> felt252;
    fn last_action(self: @T) -> felt252;
    fn last_game_id(self: @T) -> u32;
    fn last_player(self: @T) -> ContractAddress;
}

#[starknet::interface]
pub trait IMinimalMinigameRegistryView<T> {
    fn registered_count(self: @T) -> u32;
    fn last_game_id(self: @T) -> felt252;
    fn last_game_name(self: @T) -> ByteArray;
    fn last_game_description(self: @T) -> ByteArray;
    fn last_game_client_url(self: @T) -> ByteArray;
    fn last_game_image_url(self: @T) -> ByteArray;
    fn last_game_color(self: @T) -> felt252;
    fn last_genre(self: @T) -> ByteArray;
    fn last_game_creator(self: @T) -> ContractAddress;
    fn last_game_renderer(self: @T) -> ContractAddress;
    fn last_game_token(self: @T) -> ContractAddress;
    fn last_game_skills(self: @T) -> ContractAddress;
    fn last_royalty_fraction(self: @T) -> u16;
}

#[starknet::contract]
pub mod minimal_session_token {
    use super::IMinimalSessionTokenAdmin;
    use dark_waters::systems::actions::ISessionToken as ActionsSessionToken;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        admin: ContractAddress,
        owners: Map<felt252, ContractAddress>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        OwnershipUpdated: OwnershipUpdated,
    }

    #[derive(Drop, starknet::Event)]
    struct OwnershipUpdated {
        #[key]
        token_id: felt252,
        owner: ContractAddress,
        operator: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, admin: ContractAddress) {
        assert!(admin != zero_address(), "invalid admin");
        self.admin.write(admin);
    }

    #[abi(embed_v0)]
    impl AdminImpl of IMinimalSessionTokenAdmin<ContractState> {
        fn admin(self: @ContractState) -> ContractAddress {
            self.admin.read()
        }

        fn mint(ref self: ContractState, to: ContractAddress, token_id: felt252) {
            assert_only_admin(@self);
            assert!(to != zero_address(), "invalid owner");
            assert!(self.owners.read(token_id) == zero_address(), "token exists");
            self.owners.write(token_id, to);
            self.emit(
                Event::OwnershipUpdated(
                    OwnershipUpdated {
                        token_id,
                        owner: to,
                        operator: get_caller_address(),
                    },
                ),
            );
        }

        fn set_owner(ref self: ContractState, token_id: felt252, to: ContractAddress) {
            assert_only_admin(@self);
            assert!(to != zero_address(), "invalid owner");
            self.owners.write(token_id, to);
            self.emit(
                Event::OwnershipUpdated(
                    OwnershipUpdated {
                        token_id,
                        owner: to,
                        operator: get_caller_address(),
                    },
                ),
            );
        }
    }

    #[abi(embed_v0)]
    impl ActionsSessionTokenImpl of ActionsSessionToken<ContractState> {
        fn owner_of(self: @ContractState, token_id: felt252) -> ContractAddress {
            self.owners.read(token_id)
        }
    }

    fn assert_only_admin(self: @ContractState) {
        assert!(get_caller_address() == self.admin.read(), "not admin");
    }

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }
}

#[starknet::contract]
pub mod minimal_action_hooks {
    use super::IMinimalActionHooksAdmin;
    use dark_waters::systems::actions::IEgsActionHooks;
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        admin: ContractAddress,
        fail_pre: bool,
        fail_post: bool,
        pre_calls: u32,
        post_calls: u32,
        last_token_id: felt252,
        last_action: felt252,
        last_game_id: u32,
        last_player: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        FailureModeUpdated: FailureModeUpdated,
        ActionObserved: ActionObserved,
    }

    #[derive(Drop, starknet::Event)]
    struct FailureModeUpdated {
        fail_pre: bool,
        fail_post: bool,
        operator: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct ActionObserved {
        #[key]
        token_id: felt252,
        action: felt252,
        game_id: u32,
        player: ContractAddress,
        phase: felt252,
    }

    #[constructor]
    fn constructor(ref self: ContractState, admin: ContractAddress) {
        assert!(admin != zero_address(), "invalid admin");
        self.admin.write(admin);
    }

    #[abi(embed_v0)]
    impl AdminImpl of IMinimalActionHooksAdmin<ContractState> {
        fn admin(self: @ContractState) -> ContractAddress {
            self.admin.read()
        }

        fn set_fail_pre(ref self: ContractState, should_fail: bool) {
            assert_only_admin(@self);
            self.fail_pre.write(should_fail);
            self.emit(
                Event::FailureModeUpdated(
                    FailureModeUpdated {
                        fail_pre: should_fail,
                        fail_post: self.fail_post.read(),
                        operator: get_caller_address(),
                    },
                ),
            );
        }

        fn set_fail_post(ref self: ContractState, should_fail: bool) {
            assert_only_admin(@self);
            self.fail_post.write(should_fail);
            self.emit(
                Event::FailureModeUpdated(
                    FailureModeUpdated {
                        fail_pre: self.fail_pre.read(),
                        fail_post: should_fail,
                        operator: get_caller_address(),
                    },
                ),
            );
        }

        fn reset(ref self: ContractState) {
            assert_only_admin(@self);
            self.pre_calls.write(0_u32);
            self.post_calls.write(0_u32);
            self.last_token_id.write(0);
            self.last_action.write(0);
            self.last_game_id.write(0_u32);
            self.last_player.write(zero_address());
        }

        fn pre_calls(self: @ContractState) -> u32 {
            self.pre_calls.read()
        }

        fn post_calls(self: @ContractState) -> u32 {
            self.post_calls.read()
        }

        fn last_token_id(self: @ContractState) -> felt252 {
            self.last_token_id.read()
        }

        fn last_action(self: @ContractState) -> felt252 {
            self.last_action.read()
        }

        fn last_game_id(self: @ContractState) -> u32 {
            self.last_game_id.read()
        }

        fn last_player(self: @ContractState) -> ContractAddress {
            self.last_player.read()
        }
    }

    #[abi(embed_v0)]
    impl HooksImpl of IEgsActionHooks<ContractState> {
        fn pre_action(
            ref self: ContractState,
            token_id: felt252,
            action: felt252,
            game_id: u32,
            player: ContractAddress,
        ) {
            assert!(!self.fail_pre.read(), "pre_action_failed");
            self.pre_calls.write(self.pre_calls.read() + 1_u32);
            write_last(ref self, token_id, action, game_id, player);
            self.emit(
                Event::ActionObserved(
                    ActionObserved {
                        token_id,
                        action,
                        game_id,
                        player,
                        phase: 'pre',
                    },
                ),
            );
        }

        fn post_action(
            ref self: ContractState,
            token_id: felt252,
            action: felt252,
            game_id: u32,
            player: ContractAddress,
        ) {
            assert!(!self.fail_post.read(), "post_action_failed");
            self.post_calls.write(self.post_calls.read() + 1_u32);
            write_last(ref self, token_id, action, game_id, player);
            self.emit(
                Event::ActionObserved(
                    ActionObserved {
                        token_id,
                        action,
                        game_id,
                        player,
                        phase: 'post',
                    },
                ),
            );
        }
    }

    fn write_last(
        ref self: ContractState,
        token_id: felt252,
        action: felt252,
        game_id: u32,
        player: ContractAddress,
    ) {
        self.last_token_id.write(token_id);
        self.last_action.write(action);
        self.last_game_id.write(game_id);
        self.last_player.write(player);
    }

    fn assert_only_admin(self: @ContractState) {
        assert!(get_caller_address() == self.admin.read(), "not admin");
    }

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }
}

#[starknet::contract]
pub mod minimal_minigame_registry {
    use super::IMinimalMinigameRegistryView;
    use dark_waters::systems::egs_adapter::IMinigameRegistry;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::ContractAddress;

    #[storage]
    struct Storage {
        registered_count: u32,
        last_game_id: felt252,
        last_game_name: ByteArray,
        last_game_description: ByteArray,
        last_game_client_url: ByteArray,
        last_game_image_url: ByteArray,
        last_game_color: felt252,
        last_genre: ByteArray,
        last_game_creator: ContractAddress,
        last_game_renderer: ContractAddress,
        last_game_token: ContractAddress,
        last_game_skills: ContractAddress,
        last_royalty_fraction: u16,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        GameRegistered: GameRegistered,
    }

    #[derive(Drop, starknet::Event)]
    struct GameRegistered {
        #[key]
        game_id: felt252,
        game_token: ContractAddress,
        royalty_fraction: u16,
    }

    #[abi(embed_v0)]
    impl RegistryImpl of IMinigameRegistry<ContractState> {
        fn register_game(
            ref self: ContractState,
            game_id: felt252,
            game_name: ByteArray,
            game_description: ByteArray,
            game_client_url: ByteArray,
            game_image_url: ByteArray,
            game_color: felt252,
            genre: ByteArray,
            game_creator: Option<ContractAddress>,
            game_renderer: Option<ContractAddress>,
            game_token: ContractAddress,
            game_skills: Option<ContractAddress>,
            royalty_fraction: u16,
        ) {
            self.registered_count.write(self.registered_count.read() + 1_u32);
            self.last_game_id.write(game_id);
            self.last_game_name.write(game_name);
            self.last_game_description.write(game_description);
            self.last_game_client_url.write(game_client_url);
            self.last_game_image_url.write(game_image_url);
            self.last_game_color.write(game_color);
            self.last_genre.write(genre);
            self.last_game_creator.write(option_to_address(game_creator));
            self.last_game_renderer.write(option_to_address(game_renderer));
            self.last_game_token.write(game_token);
            self.last_game_skills.write(option_to_address(game_skills));
            self.last_royalty_fraction.write(royalty_fraction);
            self.emit(
                Event::GameRegistered(
                    GameRegistered { game_id, game_token, royalty_fraction },
                ),
            );
        }
    }

    #[abi(embed_v0)]
    impl ViewImpl of IMinimalMinigameRegistryView<ContractState> {
        fn registered_count(self: @ContractState) -> u32 {
            self.registered_count.read()
        }

        fn last_game_id(self: @ContractState) -> felt252 {
            self.last_game_id.read()
        }

        fn last_game_name(self: @ContractState) -> ByteArray {
            self.last_game_name.read()
        }

        fn last_game_description(self: @ContractState) -> ByteArray {
            self.last_game_description.read()
        }

        fn last_game_client_url(self: @ContractState) -> ByteArray {
            self.last_game_client_url.read()
        }

        fn last_game_image_url(self: @ContractState) -> ByteArray {
            self.last_game_image_url.read()
        }

        fn last_game_color(self: @ContractState) -> felt252 {
            self.last_game_color.read()
        }

        fn last_genre(self: @ContractState) -> ByteArray {
            self.last_genre.read()
        }

        fn last_game_creator(self: @ContractState) -> ContractAddress {
            self.last_game_creator.read()
        }

        fn last_game_renderer(self: @ContractState) -> ContractAddress {
            self.last_game_renderer.read()
        }

        fn last_game_token(self: @ContractState) -> ContractAddress {
            self.last_game_token.read()
        }

        fn last_game_skills(self: @ContractState) -> ContractAddress {
            self.last_game_skills.read()
        }

        fn last_royalty_fraction(self: @ContractState) -> u16 {
            self.last_royalty_fraction.read()
        }
    }

    fn option_to_address(value: Option<ContractAddress>) -> ContractAddress {
        match value {
            Option::Some(address) => address,
            Option::None => zero_address(),
        }
    }

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }
}
