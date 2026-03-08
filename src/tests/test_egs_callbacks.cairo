#[starknet::interface]
trait IMockMinigameTokenDataAdmin<T> {
    fn set_token_state(ref self: T, token_id: felt252, score: u64, game_over: bool);
}

#[starknet::interface]
trait IMockCallbackAdminAccount<T> {
    fn set_token_state(
        self: @T, adapter: ContractAddress, token_id: felt252, score: u64, game_over: bool,
    );
    fn set_callback_adapter(self: @T, callback: ContractAddress, adapter: ContractAddress);
    fn set_callback_trusted_caller(
        self: @T, callback: ContractAddress, trusted_caller: ContractAddress,
    );
}

#[starknet::interface]
trait IMockMetagameCaller<T> {
    fn on_game_action(self: @T, callback: ContractAddress, token_id: felt252, player: ContractAddress);
    fn on_game_over(self: @T, callback: ContractAddress, token_id: felt252, player: ContractAddress);
    fn on_objective_complete(
        self: @T,
        callback: ContractAddress,
        token_id: felt252,
        player: ContractAddress,
        objective_id: felt252,
    );
}

#[starknet::contract]
pub mod mock_minigame_token_data {
    use super::IMockMinigameTokenDataAdmin;
    use dark_waters::systems::egs_adapter::IMinigameTokenData;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        admin: ContractAddress,
        scores: Map<felt252, u64>,
        statuses: Map<felt252, bool>,
    }

    #[constructor]
    fn constructor(ref self: ContractState, admin: ContractAddress) {
        assert!(admin != zero_address(), "invalid admin");
        self.admin.write(admin);
    }

    #[abi(embed_v0)]
    impl AdminImpl of IMockMinigameTokenDataAdmin<ContractState> {
        fn set_token_state(
            ref self: ContractState, token_id: felt252, score: u64, game_over: bool,
        ) {
            assert!(get_caller_address() == self.admin.read(), "not admin");
            self.scores.write(token_id, score);
            self.statuses.write(token_id, game_over);
        }
    }

    #[abi(embed_v0)]
    impl TokenDataImpl of IMinigameTokenData<ContractState> {
        fn score(self: @ContractState, token_id: felt252) -> u64 {
            self.scores.read(token_id)
        }

        fn game_over(self: @ContractState, token_id: felt252) -> bool {
            self.statuses.read(token_id)
        }

        fn score_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<u64> {
            let mut scores = array![];
            for token_id in token_ids {
                scores.append(self.score(*token_id));
            }
            scores
        }

        fn game_over_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<bool> {
            let mut statuses = array![];
            for token_id in token_ids {
                statuses.append(self.game_over(*token_id));
            }
            statuses
        }
    }

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }
}

#[starknet::contract]
pub mod mock_callback_admin_account {
    use super::{IMockCallbackAdminAccount, IMockMinigameTokenDataAdminDispatcher, IMockMinigameTokenDataAdminDispatcherTrait};
    use dark_waters::egs_callbacks::{
        IMetagameCallbackAdminDispatcher, IMetagameCallbackAdminDispatcherTrait,
    };
    use starknet::ContractAddress;

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl MockCallbackAdminAccountImpl of IMockCallbackAdminAccount<ContractState> {
        fn set_token_state(
            self: @ContractState, adapter: ContractAddress, token_id: felt252, score: u64,
            game_over: bool,
        ) {
            let mut dispatcher =
                IMockMinigameTokenDataAdminDispatcher { contract_address: adapter };
            dispatcher.set_token_state(token_id, score, game_over);
        }

        fn set_callback_adapter(
            self: @ContractState, callback: ContractAddress, adapter: ContractAddress,
        ) {
            let mut dispatcher = IMetagameCallbackAdminDispatcher { contract_address: callback };
            dispatcher.set_adapter(adapter);
        }

        fn set_callback_trusted_caller(
            self: @ContractState, callback: ContractAddress, trusted_caller: ContractAddress,
        ) {
            let mut dispatcher = IMetagameCallbackAdminDispatcher { contract_address: callback };
            dispatcher.set_trusted_caller(trusted_caller);
        }
    }
}

#[starknet::contract]
pub mod mock_metagame_caller {
    use super::IMockMetagameCaller;
    use dark_waters::egs_callbacks::{
        IMetagameCallbackDispatcher, IMetagameCallbackDispatcherTrait,
    };
    use starknet::ContractAddress;

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl MockMetagameCallerImpl of IMockMetagameCaller<ContractState> {
        fn on_game_action(
            self: @ContractState, callback: ContractAddress, token_id: felt252,
            player: ContractAddress,
        ) {
            let mut dispatcher = IMetagameCallbackDispatcher { contract_address: callback };
            dispatcher.on_game_action(token_id, player);
        }

        fn on_game_over(
            self: @ContractState, callback: ContractAddress, token_id: felt252,
            player: ContractAddress,
        ) {
            let mut dispatcher = IMetagameCallbackDispatcher { contract_address: callback };
            dispatcher.on_game_over(token_id, player);
        }

        fn on_objective_complete(
            self: @ContractState,
            callback: ContractAddress,
            token_id: felt252,
            player: ContractAddress,
            objective_id: felt252,
        ) {
            let mut dispatcher = IMetagameCallbackDispatcher { contract_address: callback };
            dispatcher.on_objective_complete(token_id, player, objective_id);
        }
    }
}

use core::traits::{Into, TryInto};
use dark_waters::egs_callbacks::{
    IMetagameCallbackAdminDispatcher, IMetagameCallbackAdminDispatcherTrait,
    minimal_metagame_callback,
};
use starknet::syscalls::deploy_syscall;
use starknet::{ClassHash, ContractAddress};

fn deploy(class_hash: ClassHash, calldata: Span<felt252>) -> ContractAddress {
    let salt = core::testing::get_available_gas().into();
    let (address, _) = deploy_syscall(class_hash, salt, calldata, false).unwrap();
    address
}

fn deploy_mock_token_data(admin: ContractAddress) -> ContractAddress {
    deploy(mock_minigame_token_data::TEST_CLASS_HASH, [admin.into()].span())
}

fn deploy_admin_account() -> ContractAddress {
    deploy(mock_callback_admin_account::TEST_CLASS_HASH, [].span())
}

fn deploy_metagame_caller() -> ContractAddress {
    deploy(mock_metagame_caller::TEST_CLASS_HASH, [].span())
}

fn deploy_callback(
    admin: ContractAddress, adapter: ContractAddress, trusted_caller: ContractAddress,
) -> ContractAddress {
    deploy(
        minimal_metagame_callback::TEST_CLASS_HASH,
        [admin.into(), adapter.into(), trusted_caller.into()].span(),
    )
}

#[test]
fn minimal_metagame_callback_records_action_snapshots() {
    let admin = deploy_admin_account();
    let trusted_caller = deploy_metagame_caller();
    let player: ContractAddress = 303.try_into().unwrap();

    let adapter = deploy_mock_token_data(admin);
    let callback = deploy_callback(admin, adapter, trusted_caller);

    let admin_dispatcher =
        IMockCallbackAdminAccountDispatcher { contract_address: admin };
    admin_dispatcher.set_token_state(adapter, 7, 444_u64, false);

    let trusted_dispatcher =
        IMockMetagameCallerDispatcher { contract_address: trusted_caller };
    trusted_dispatcher.on_game_action(callback, 7, player);

    let callback_admin = IMetagameCallbackAdminDispatcher { contract_address: callback };
    assert(callback_admin.action_calls() == 1_u32, 'action_calls');
    assert(callback_admin.game_over_calls() == 0_u32, 'game_over_calls');
    assert(callback_admin.objective_calls() == 0_u32, 'objective_calls');
    assert(callback_admin.last_token_id() == 7, 'last_token');
    assert(callback_admin.last_player() == player, 'last_player');
    assert(callback_admin.last_objective_id() == 0, 'last_objective');
    assert(callback_admin.last_score() == 444_u64, 'last_score');
    assert(!callback_admin.last_game_over(), 'last_not_over');
    assert(!callback_admin.token_completed(7), 'token_not_done');
}

#[test]
fn minimal_metagame_callback_records_game_over_and_objective_completion() {
    let admin = deploy_admin_account();
    let trusted_caller = deploy_metagame_caller();
    let player: ContractAddress = 333.try_into().unwrap();
    let objective_id = 'pvp_win';

    let adapter = deploy_mock_token_data(admin);
    let callback = deploy_callback(admin, adapter, trusted_caller);

    let admin_dispatcher =
        IMockCallbackAdminAccountDispatcher { contract_address: admin };
    admin_dispatcher.set_token_state(adapter, 8, 10_500_u64, true);

    let trusted_dispatcher =
        IMockMetagameCallerDispatcher { contract_address: trusted_caller };
    trusted_dispatcher.on_game_over(callback, 8, player);
    trusted_dispatcher.on_objective_complete(callback, 8, player, objective_id);

    let callback_admin = IMetagameCallbackAdminDispatcher { contract_address: callback };
    assert(callback_admin.action_calls() == 0_u32, 'no_actions');
    assert(callback_admin.game_over_calls() == 1_u32, 'game_over_count');
    assert(callback_admin.objective_calls() == 1_u32, 'objective_count');
    assert(callback_admin.last_token_id() == 8, 'last_token');
    assert(callback_admin.last_player() == player, 'last_player');
    assert(callback_admin.last_objective_id() == objective_id, 'objective_id');
    assert(callback_admin.last_score() == 10_500_u64, 'score');
    assert(callback_admin.last_game_over(), 'game_over');
    assert(callback_admin.token_completed(8), 'token_done');
    assert(
        callback_admin.objective_completed(8, objective_id),
        'objective_done',
    );
}

#[test]
#[should_panic]
fn minimal_metagame_callback_rejects_unauthorized_caller() {
    let admin = deploy_admin_account();
    let trusted_caller = deploy_metagame_caller();
    let attacker = deploy_metagame_caller();
    let player: ContractAddress = 454.try_into().unwrap();

    let adapter = deploy_mock_token_data(admin);
    let callback = deploy_callback(admin, adapter, trusted_caller);

    let admin_dispatcher =
        IMockCallbackAdminAccountDispatcher { contract_address: admin };
    admin_dispatcher.set_token_state(adapter, 9, 900_u64, false);

    let attacker_dispatcher = IMockMetagameCallerDispatcher { contract_address: attacker };
    attacker_dispatcher.on_game_action(callback, 9, player);
}

#[test]
#[should_panic]
fn minimal_metagame_callback_rejects_false_game_over_notifications() {
    let admin = deploy_admin_account();
    let trusted_caller = deploy_metagame_caller();
    let player: ContractAddress = 353.try_into().unwrap();

    let adapter = deploy_mock_token_data(admin);
    let callback = deploy_callback(admin, adapter, trusted_caller);

    let admin_dispatcher =
        IMockCallbackAdminAccountDispatcher { contract_address: admin };
    admin_dispatcher.set_token_state(adapter, 10, 1_200_u64, false);

    let trusted_dispatcher =
        IMockMetagameCallerDispatcher { contract_address: trusted_caller };
    trusted_dispatcher.on_game_over(callback, 10, player);
}

#[test]
fn minimal_metagame_callback_allows_admin_rotation_of_platform_config() {
    let admin = deploy_admin_account();
    let trusted_caller_1 = deploy_metagame_caller();
    let trusted_caller_2 = deploy_metagame_caller();
    let player: ContractAddress = 474.try_into().unwrap();
    let objective_id = 'quest_1';

    let adapter_1 = deploy_mock_token_data(admin);
    let adapter_2 = deploy_mock_token_data(admin);
    let callback = deploy_callback(admin, adapter_1, trusted_caller_1);

    let admin_dispatcher =
        IMockCallbackAdminAccountDispatcher { contract_address: admin };
    admin_dispatcher.set_token_state(adapter_1, 11, 111_u64, false);
    admin_dispatcher.set_token_state(adapter_2, 11, 777_u64, true);
    admin_dispatcher.set_callback_adapter(callback, adapter_2);
    admin_dispatcher.set_callback_trusted_caller(callback, trusted_caller_2);

    let trusted_dispatcher =
        IMockMetagameCallerDispatcher { contract_address: trusted_caller_2 };
    trusted_dispatcher.on_objective_complete(callback, 11, player, objective_id);

    let callback_view = IMetagameCallbackAdminDispatcher { contract_address: callback };
    assert(callback_view.adapter() == adapter_2, 'adapter_rotated');
    assert(callback_view.trusted_caller() == trusted_caller_2, 'caller_rotated');
    assert(callback_view.objective_calls() == 1_u32, 'objective_calls');
    assert(callback_view.last_score() == 777_u64, 'rotated_score');
    assert(callback_view.last_game_over(), 'rotated_game_over');
    assert(callback_view.token_completed(11), 'rotated_completed');
    assert(
        callback_view.objective_completed(11, objective_id),
        'rotated_objective',
    );
}
