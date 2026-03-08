#[starknet::interface]
trait IMockHelperAdminAccount<T> {
    fn mint_session_token(
        self: @T, token: ContractAddress, to: ContractAddress, token_id: felt252,
    );
    fn set_session_token_owner(
        self: @T, token: ContractAddress, token_id: felt252, to: ContractAddress,
    );
    fn set_hooks_fail_post(self: @T, hooks: ContractAddress, should_fail: bool);
    fn link_session(self: @T, adapter: ContractAddress, token_id: felt252, game_id: u32);
}

#[starknet::contract]
pub mod mock_helper_admin_account {
    use super::IMockHelperAdminAccount;
    use dark_waters::egs_helpers::{
        IMinimalActionHooksAdminDispatcher, IMinimalActionHooksAdminDispatcherTrait,
        IMinimalSessionTokenAdminDispatcher, IMinimalSessionTokenAdminDispatcherTrait,
    };
    use dark_waters::systems::egs_adapter::{
        IEgsSessionLinkerDispatcher, IEgsSessionLinkerDispatcherTrait,
    };
    use starknet::ContractAddress;

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl MockHelperAdminAccountImpl of IMockHelperAdminAccount<ContractState> {
        fn mint_session_token(
            self: @ContractState, token: ContractAddress, to: ContractAddress, token_id: felt252,
        ) {
            let mut dispatcher = IMinimalSessionTokenAdminDispatcher { contract_address: token };
            dispatcher.mint(to, token_id);
        }

        fn set_session_token_owner(
            self: @ContractState, token: ContractAddress, token_id: felt252, to: ContractAddress,
        ) {
            let mut dispatcher = IMinimalSessionTokenAdminDispatcher { contract_address: token };
            dispatcher.set_owner(token_id, to);
        }

        fn set_hooks_fail_post(
            self: @ContractState, hooks: ContractAddress, should_fail: bool,
        ) {
            let mut dispatcher = IMinimalActionHooksAdminDispatcher { contract_address: hooks };
            dispatcher.set_fail_post(should_fail);
        }

        fn link_session(
            self: @ContractState, adapter: ContractAddress, token_id: felt252, game_id: u32,
        ) {
            let mut dispatcher = IEgsSessionLinkerDispatcher { contract_address: adapter };
            dispatcher.link_session(token_id, game_id);
        }
    }
}

use core::traits::{Into, TryInto};
use dark_waters::egs_helpers::{
    IMinimalActionHooksAdminDispatcher, IMinimalActionHooksAdminDispatcherTrait,
    IMinimalMinigameRegistryViewDispatcher, IMinimalMinigameRegistryViewDispatcherTrait,
    minimal_action_hooks, minimal_minigame_registry, minimal_session_token,
};
use dark_waters::systems::actions::{
    IEgsActionHooksDispatcher, IEgsActionHooksDispatcherTrait,
    ISessionTokenDispatcher as ActionsSessionTokenDispatcher,
    ISessionTokenDispatcherTrait as ActionsSessionTokenDispatcherTrait,
};
use dark_waters::systems::egs_adapter::{
    GAME_COLOR, IMinigameRegistryDispatcher, IMinigameRegistryDispatcherTrait, IMINIGAME_ID,
    ISessionTokenDispatcher as AdapterSessionTokenDispatcher,
    ISessionTokenDispatcherTrait as AdapterSessionTokenDispatcherTrait, egs_adapter_contract,
};
use dojo::model::{ModelStorage, ModelStorageTest};
use dojo::utils::bytearray_hash;
use dojo::world::world;
use dojo_cairo_test::{
    ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait, spawn_test_world,
};
use dark_waters::models::{
    EgsSessionLink, Game, BoardCommitment, m_BoardCommitment, m_EgsSessionLink, m_Game,
};
use starknet::syscalls::deploy_syscall;
use starknet::{ClassHash, ContractAddress, testing};

fn deploy(class_hash: ClassHash, calldata: Span<felt252>) -> ContractAddress {
    let salt = core::testing::get_available_gas().into();
    let (address, _) = deploy_syscall(class_hash, salt, calldata, false).unwrap();
    address
}

fn deploy_admin_account() -> ContractAddress {
    deploy(mock_helper_admin_account::TEST_CLASS_HASH, [].span())
}

#[test]
fn minimal_session_token_supports_actions_and_adapter_owner_queries() {
    let player: ContractAddress = 202.try_into().unwrap();
    let admin_account_address = deploy_admin_account();
    let admin_account =
        IMockHelperAdminAccountDispatcher { contract_address: admin_account_address };

    let token_address =
        deploy(minimal_session_token::TEST_CLASS_HASH, [admin_account_address.into()].span());
    admin_account.mint_session_token(token_address, player, 7);

    let actions_dispatcher =
        ActionsSessionTokenDispatcher { contract_address: token_address };
    let adapter_dispatcher =
        AdapterSessionTokenDispatcher { contract_address: token_address };

    assert(actions_dispatcher.owner_of(7) == player, 'actions_owner');
    assert(adapter_dispatcher.owner_of(7) == player, 'adapter_owner');

    admin_account.set_session_token_owner(token_address, 7, admin_account_address);
    assert(actions_dispatcher.owner_of(7) == admin_account_address, 'updated_owner');
}

#[test]
fn minimal_action_hooks_record_calls() {
    let admin: ContractAddress = 303.try_into().unwrap();
    let player: ContractAddress = 404.try_into().unwrap();

    testing::set_caller_address(admin);
    let hooks_address = deploy(minimal_action_hooks::TEST_CLASS_HASH, [admin.into()].span());

    let admin_dispatcher =
        IMinimalActionHooksAdminDispatcher { contract_address: hooks_address };
    let mut hooks_dispatcher = IEgsActionHooksDispatcher { contract_address: hooks_address };

    hooks_dispatcher.pre_action(9, 1, 77_u32, player);
    hooks_dispatcher.post_action(9, 1, 77_u32, player);

    assert(admin_dispatcher.pre_calls() == 1_u32, 'pre_calls');
    assert(admin_dispatcher.post_calls() == 1_u32, 'post_calls');
    assert(admin_dispatcher.last_token_id() == 9, 'token_id');
    assert(admin_dispatcher.last_action() == 1, 'action');
    assert(admin_dispatcher.last_game_id() == 77_u32, 'game_id');
    assert(admin_dispatcher.last_player() == player, 'player');
}

#[test]
#[should_panic]
fn minimal_action_hooks_can_fail_post_action() {
    let player: ContractAddress = 606.try_into().unwrap();
    let admin_account_address = deploy_admin_account();
    let admin_account =
        IMockHelperAdminAccountDispatcher { contract_address: admin_account_address };

    let hooks_address =
        deploy(minimal_action_hooks::TEST_CLASS_HASH, [admin_account_address.into()].span());
    admin_account.set_hooks_fail_post(hooks_address, true);

    let mut hooks_dispatcher = IEgsActionHooksDispatcher { contract_address: hooks_address };
    hooks_dispatcher.post_action(11, 2, 88_u32, player);
}

#[test]
fn minimal_registry_records_registration_via_adapter_interface() {
    let registry_address = deploy(minimal_minigame_registry::TEST_CLASS_HASH, [].span());
    let token: ContractAddress = 707.try_into().unwrap();
    let renderer: ContractAddress = 808.try_into().unwrap();

    let mut registry_dispatcher =
        IMinigameRegistryDispatcher { contract_address: registry_address };
    registry_dispatcher.register_game(
        IMINIGAME_ID,
        "Dark Waters",
        "Dark Waters helper registry",
        "https://dark-waters-m2fn.vercel.app/",
        "",
        GAME_COLOR,
        "Strategy",
        Option::None,
        Option::Some(renderer),
        token,
        Option::None,
        0_u16,
    );

    let view_dispatcher =
        IMinimalMinigameRegistryViewDispatcher { contract_address: registry_address };
    assert(view_dispatcher.registered_count() == 1_u32, 'count');
    assert(view_dispatcher.last_game_id() == IMINIGAME_ID, 'game_id');
    assert(view_dispatcher.last_game_name() == "Dark Waters", 'game_name');
    assert(view_dispatcher.last_game_token() == token, 'token');
    assert(view_dispatcher.last_game_renderer() == renderer, 'renderer');
    assert(view_dispatcher.last_game_color() == GAME_COLOR, 'color');
    assert(view_dispatcher.last_royalty_fraction() == 0_u16, 'royalty');
}

fn namespace_def() -> NamespaceDef {
    NamespaceDef {
        namespace: "dark_waters",
        resources: [
            TestResource::Model(m_Game::TEST_CLASS_HASH),
            TestResource::Model(m_BoardCommitment::TEST_CLASS_HASH),
            TestResource::Model(m_EgsSessionLink::TEST_CLASS_HASH),
        ]
            .span(),
    }
}

#[test]
fn deployable_helpers_work_with_adapter_linking_flow() {
    let player = deploy_admin_account();
    let game_id = 12_u32;
    let token_id = 77;

    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [namespace_def()].span());
    let admin_account_address = deploy_admin_account();
    let admin_account =
        IMockHelperAdminAccountDispatcher { contract_address: admin_account_address };
    let token_address =
        deploy(minimal_session_token::TEST_CLASS_HASH, [admin_account_address.into()].span());
    let registry_address = deploy(minimal_minigame_registry::TEST_CLASS_HASH, [].span());

    admin_account.mint_session_token(token_address, player, token_id);

    world.write_model_test(
        @Game {
            game_id,
            player_1: player,
            player_2: 0.try_into().unwrap(),
            turn: player,
            state: 0_u8,
            winner: 0.try_into().unwrap(),
            last_action: 0_u64,
            moves_count: 0_u32,
            stake_token: 0.try_into().unwrap(),
            stake_amount: 0_u128,
            stake_locked_p1: false,
            stake_locked_p2: false,
            stake_settled: true,
        },
    );
    world.write_model_test(
        @BoardCommitment {
            game_id,
            player,
            root: 0,
            hits_taken: 0_u8,
            is_committed: false,
        },
    );

    let adapter_address = deploy(
        egs_adapter_contract::TEST_CLASS_HASH,
        [
            world.dispatcher.contract_address.into(),
            registry_address.into(),
            token_address.into(),
            0,
            0,
            0,
            0,
        ]
            .span(),
    );

    let namespace_selector = bytearray_hash(@"dark_waters");
    world.sync_perms_and_inits(
        [ContractDefTrait::new_address(adapter_address)
            .with_writer_of([namespace_selector].span())]
            .span(),
    );

    let player_account = IMockHelperAdminAccountDispatcher { contract_address: player };
    player_account.link_session(adapter_address, token_id, game_id);

    let link: EgsSessionLink = world.read_model(token_id);
    assert(link.is_linked, 'linked');
    assert(link.game_id == game_id, 'link_game');
    assert(link.player == player, 'link_player');
}
