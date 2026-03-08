#[starknet::interface]
trait IMockDenshokanTokenAdmin<T> {
    fn set_owner(ref self: T, token_id: felt252, owner: ContractAddress);
    fn set_playable(ref self: T, token_id: felt252, playable: bool);
    fn set_registry_address(ref self: T, registry_address: ContractAddress);
    fn update_calls(self: @T) -> u32;
    fn last_updated_token(self: @T) -> felt252;
    fn mint_calls(self: @T) -> u32;
    fn last_mint_to(self: @T) -> ContractAddress;
    fn last_mint_game_address(self: @T) -> ContractAddress;
}

#[starknet::contract]
pub mod mock_denshokan_token {
    use super::IMockDenshokanTokenAdmin;
    use dark_waters::denshokan::{IERC721, IMinigameToken, MintParams};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::ContractAddress;

    #[storage]
    struct Storage {
        owners: Map<felt252, ContractAddress>,
        playables: Map<felt252, bool>,
        registry_address: ContractAddress,
        update_calls: u32,
        last_updated_token: felt252,
        mint_calls: u32,
        last_mint_to: ContractAddress,
        last_mint_game_address: ContractAddress,
        next_token_id: felt252,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.next_token_id.write(1);
    }

    #[abi(embed_v0)]
    impl AdminImpl of IMockDenshokanTokenAdmin<ContractState> {
        fn set_owner(ref self: ContractState, token_id: felt252, owner: ContractAddress) {
            self.owners.write(token_id, owner);
        }

        fn set_playable(ref self: ContractState, token_id: felt252, playable: bool) {
            self.playables.write(token_id, playable);
        }

        fn set_registry_address(ref self: ContractState, registry_address: ContractAddress) {
            self.registry_address.write(registry_address);
        }

        fn update_calls(self: @ContractState) -> u32 {
            self.update_calls.read()
        }

        fn last_updated_token(self: @ContractState) -> felt252 {
            self.last_updated_token.read()
        }

        fn mint_calls(self: @ContractState) -> u32 {
            self.mint_calls.read()
        }

        fn last_mint_to(self: @ContractState) -> ContractAddress {
            self.last_mint_to.read()
        }

        fn last_mint_game_address(self: @ContractState) -> ContractAddress {
            self.last_mint_game_address.read()
        }
    }

    #[abi(embed_v0)]
    impl Erc721Impl of IERC721<ContractState> {
        fn owner_of(self: @ContractState, token_id: u256) -> ContractAddress {
            let felt_token_id: felt252 = token_id.try_into().unwrap();
            self.owners.read(felt_token_id)
        }
    }

    #[abi(embed_v0)]
    impl MinigameTokenImpl of IMinigameToken<ContractState> {
        fn assert_is_playable(self: @ContractState, token_id: felt252) {
            assert(self.playables.read(token_id), 'not_playable');
        }

        fn game_registry_address(self: @ContractState) -> ContractAddress {
            self.registry_address.read()
        }

        fn mint(
            ref self: ContractState,
            game_address: ContractAddress,
            player_name: Option<felt252>,
            settings_id: Option<u32>,
            start: Option<u64>,
            end: Option<u64>,
            objective_id: Option<u32>,
            context: Option<dark_waters::denshokan::GameContextDetails>,
            client_url: Option<ByteArray>,
            renderer_address: Option<ContractAddress>,
            skills_address: Option<ContractAddress>,
            to: ContractAddress,
            soulbound: bool,
            paymaster: bool,
            salt: u16,
            metadata: u16,
        ) -> felt252 {
            let _ = player_name;
            let _ = settings_id;
            let _ = start;
            let _ = end;
            let _ = objective_id;
            let _ = context;
            let _ = client_url;
            let _ = renderer_address;
            let _ = skills_address;
            let _ = soulbound;
            let _ = paymaster;
            let _ = salt;
            let _ = metadata;

            let token_id = self.next_token_id.read();
            self.next_token_id.write(token_id + 1);
            self.owners.write(token_id, to);
            self.playables.write(token_id, true);
            self.mint_calls.write(self.mint_calls.read() + 1_u32);
            self.last_mint_to.write(to);
            self.last_mint_game_address.write(game_address);
            token_id
        }

        fn mint_batch(ref self: ContractState, mints: Array<MintParams>) -> Array<felt252> {
            let mut minted = array![];
            let mut index = 0;
            loop {
                if index >= mints.len() {
                    break;
                }
                let mint = mints.at(index);
                let token_id = self.next_token_id.read();
                self.next_token_id.write(token_id + 1);
                self.owners.write(token_id, *mint.to);
                self.playables.write(token_id, true);
                self.mint_calls.write(self.mint_calls.read() + 1_u32);
                self.last_mint_to.write(*mint.to);
                self.last_mint_game_address.write(*mint.game_address);
                minted.append(token_id);
                index += 1;
            }
            minted
        }

        fn update_game(ref self: ContractState, token_id: felt252) {
            self.update_calls.write(self.update_calls.read() + 1_u32);
            self.last_updated_token.write(token_id);
        }
    }
}

#[starknet::interface]
trait IMockRegistry<T> {
    fn registered_count(self: @T) -> u32;
    fn registered_game_id(self: @T, contract_address: ContractAddress) -> u64;
    fn registered_for_address(self: @T, contract_address: ContractAddress) -> bool;
}

#[starknet::contract]
pub mod mock_registry {
    use super::IMockRegistry;
    use dark_waters::denshokan::IMinigameRegistry;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::ContractAddress;

    #[storage]
    struct Storage {
        registered_count: u32,
        game_id: u64,
        registered_address: ContractAddress,
        is_registered: bool,
    }

    #[abi(embed_v0)]
    impl RegistryImpl of IMinigameRegistry<ContractState> {
        fn game_id_from_address(self: @ContractState, contract_address: ContractAddress) -> u64 {
            if self.is_registered.read() && self.registered_address.read() == contract_address {
                self.game_id.read()
            } else {
                0_u64
            }
        }

        fn is_game_registered(self: @ContractState, contract_address: ContractAddress) -> bool {
            self.is_registered.read() && self.registered_address.read() == contract_address
        }

        fn register_game(
            ref self: ContractState,
            creator_address: ContractAddress,
            name: ByteArray,
            description: ByteArray,
            developer: ByteArray,
            publisher: ByteArray,
            genre: ByteArray,
            image: ByteArray,
            color: Option<ByteArray>,
            client_url: Option<ByteArray>,
            renderer_address: Option<ContractAddress>,
            royalty_fraction: Option<u128>,
            skills_address: Option<ContractAddress>,
            version: u64,
        ) -> u64 {
            let _ = creator_address;
            let _ = name;
            let _ = description;
            let _ = developer;
            let _ = publisher;
            let _ = genre;
            let _ = image;
            let _ = color;
            let _ = client_url;
            let _ = renderer_address;
            let _ = royalty_fraction;
            let _ = skills_address;
            let _ = version;

            let next_id = if self.game_id.read() == 0_u64 { 1_u64 } else { self.game_id.read() };
            self.game_id.write(next_id);
            self.registered_count.write(self.registered_count.read() + 1_u32);
            self.registered_address.write(starknet::get_caller_address());
            self.is_registered.write(true);
            next_id
        }
    }

    #[abi(embed_v0)]
    impl MockViewImpl of IMockRegistry<ContractState> {
        fn registered_count(self: @ContractState) -> u32 {
            self.registered_count.read()
        }

        fn registered_game_id(self: @ContractState, contract_address: ContractAddress) -> u64 {
            if self.is_registered.read() && self.registered_address.read() == contract_address {
                self.game_id.read()
            } else {
                0_u64
            }
        }

        fn registered_for_address(self: @ContractState, contract_address: ContractAddress) -> bool {
            self.is_registered.read() && self.registered_address.read() == contract_address
        }
    }
}

#[starknet::interface]
trait IMockPlayerAccount<T> {
    fn configure_denshokan(
        self: @T, actions: ContractAddress, denshokan_token: ContractAddress, is_enabled: bool,
    );
    fn initialize_denshokan(self: @T, actions: ContractAddress) -> u64;
    fn link_session(self: @T, actions: ContractAddress, token_id: felt252, game_id: u32);
    fn commit_board(self: @T, actions: ContractAddress, game_id: u32, merkle_root: felt252);
    fn commit_board_egs(self: @T, actions: ContractAddress, token_id: felt252, merkle_root: felt252);
}

#[starknet::contract]
pub mod mock_player_account {
    use super::IMockPlayerAccount;
    use dark_waters::systems::actions::{IActionsDispatcher, IActionsDispatcherTrait};
    use starknet::ContractAddress;

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl MockPlayerAccountImpl of IMockPlayerAccount<ContractState> {
        fn configure_denshokan(
            self: @ContractState,
            actions: ContractAddress,
            denshokan_token: ContractAddress,
            is_enabled: bool,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.configure_denshokan(denshokan_token, is_enabled);
        }

        fn initialize_denshokan(self: @ContractState, actions: ContractAddress) -> u64 {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.initialize_denshokan()
        }

        fn link_session(
            self: @ContractState, actions: ContractAddress, token_id: felt252, game_id: u32,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.link_session(token_id, game_id);
        }

        fn commit_board(
            self: @ContractState, actions: ContractAddress, game_id: u32, merkle_root: felt252,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.commit_board(game_id, merkle_root);
        }

        fn commit_board_egs(
            self: @ContractState, actions: ContractAddress, token_id: felt252, merkle_root: felt252,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.commit_board_egs(token_id, merkle_root);
        }
    }
}

use core::traits::{Into, TryInto};
use dojo::model::{ModelStorage, ModelStorageTest};
use dojo::utils::{bytearray_hash, selector_from_names};
use dojo::world::{WorldStorageTrait, world};
use dojo_cairo_test::{
    ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait, spawn_test_world,
};
use dark_waters::denshokan::{
    IMinigameDispatcher, IMinigameDispatcherTrait, IMinigameTokenDataDispatcher,
    IMinigameTokenDataDispatcherTrait, ISRC5Dispatcher, ISRC5DispatcherTrait, IMINIGAME_ID,
};
use dark_waters::models::{
    BoardCommitment, EgsConfig, EgsSessionLink, Game, m_Attack, m_AttackCommitment,
    m_BoardCommitment, m_EgsConfig, m_EgsSessionLink, m_Game, m_GameCounter, m_PendingAttack,
};
use dark_waters::systems::actions::Actions;
use starknet::syscalls::deploy_syscall;
use starknet::{ClassHash, ContractAddress};

fn namespace_def() -> NamespaceDef {
    NamespaceDef {
        namespace: "dark_waters",
        resources: [
            TestResource::Model(m_GameCounter::TEST_CLASS_HASH),
            TestResource::Model(m_Game::TEST_CLASS_HASH),
            TestResource::Model(m_BoardCommitment::TEST_CLASS_HASH),
            TestResource::Model(m_Attack::TEST_CLASS_HASH),
            TestResource::Model(m_AttackCommitment::TEST_CLASS_HASH),
            TestResource::Model(m_PendingAttack::TEST_CLASS_HASH),
            TestResource::Model(m_EgsSessionLink::TEST_CLASS_HASH),
            TestResource::Model(m_EgsConfig::TEST_CLASS_HASH),
            TestResource::Event(Actions::e_board_committed::TEST_CLASS_HASH),
            TestResource::Event(Actions::e_attack_committed::TEST_CLASS_HASH),
            TestResource::Event(Actions::e_attack_made::TEST_CLASS_HASH),
            TestResource::Event(Actions::e_attack_revealed::TEST_CLASS_HASH),
            TestResource::Event(Actions::e_game_ended::TEST_CLASS_HASH),
            TestResource::Event(Actions::e_stake_locked::TEST_CLASS_HASH),
            TestResource::Event(Actions::e_stake_settled::TEST_CLASS_HASH),
            TestResource::Contract(Actions::TEST_CLASS_HASH),
        ]
            .span(),
    }
}

fn contract_defs() -> Span<dojo_cairo_test::ContractDef> {
    let namespace_selector = bytearray_hash(@"dark_waters");
    [ContractDefTrait::new(@"dark_waters", @"Actions")
        .with_writer_of([namespace_selector].span())
        .with_init_calldata([].span())]
        .span()
}

fn deploy(class_hash: ClassHash, calldata: Span<felt252>) -> ContractAddress {
    let salt = core::testing::get_available_gas().into();
    let (address, _) = deploy_syscall(class_hash, salt, calldata, false).unwrap();
    address
}

fn deploy_player_account() -> ContractAddress {
    deploy(mock_player_account::TEST_CLASS_HASH, [].span())
}

fn setup_actions_world() -> (
    dojo::world::WorldStorage, ContractAddress, ContractAddress, ContractAddress,
) {
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [namespace_def()].span());
    let token_address = deploy(mock_denshokan_token::TEST_CLASS_HASH, [].span());
    let registry_address = deploy(mock_registry::TEST_CLASS_HASH, [].span());

    let mut token_admin = IMockDenshokanTokenAdminDispatcher { contract_address: token_address };
    token_admin.set_registry_address(registry_address);

    world.sync_perms_and_inits(contract_defs());

    let actions_address = world.dns_address(@"Actions").unwrap();
    let config: EgsConfig = world.read_model(1_u8);
    assert(config.denshokan_token == 0.try_into().unwrap(), 'init_token');
    assert(!config.is_enabled, 'init_disabled');
    assert(!config.is_initialized, 'init_not_initialized');

    (world, actions_address, token_address, registry_address)
}

fn seed_game(
    ref world: dojo::world::WorldStorage,
    game_id: u32,
    player_1: ContractAddress,
    player_2: ContractAddress,
    turn: ContractAddress,
    state: u8,
    winner: ContractAddress,
    moves_count: u32,
) {
    world.write_model_test(
        @Game {
            game_id,
            player_1,
            player_2,
            turn,
            state,
            winner,
            last_action: 0_u64,
            moves_count,
            stake_token: 0.try_into().unwrap(),
            stake_amount: 0_u128,
            stake_locked_p1: false,
            stake_locked_p2: false,
            stake_settled: true,
        },
    );
}

fn seed_board(
    ref world: dojo::world::WorldStorage,
    game_id: u32,
    player: ContractAddress,
    root: felt252,
    hits_taken: u8,
    is_committed: bool,
) {
    world.write_model_test(
        @BoardCommitment { game_id, player, root, hits_taken, is_committed },
    );
}

#[test]
fn configure_denshokan_updates_config_for_contract_owner() {
    let (world, actions_address, _token_address, _registry_address) = setup_actions_world();
    let owner_account = deploy_player_account();
    let new_token = deploy(mock_denshokan_token::TEST_CLASS_HASH, [].span());
    let actions_selector = selector_from_names(@"dark_waters", @"Actions");

    world.sync_perms_and_inits(
        [ContractDefTrait::new_address(owner_account).with_owner_of([actions_selector].span())]
            .span(),
    );

    let owner = IMockPlayerAccountDispatcher { contract_address: owner_account };
    owner.configure_denshokan(actions_address, new_token, true);

    let config: EgsConfig = world.read_model(1_u8);
    assert(config.denshokan_token == new_token, 'cfg_token');
    assert(config.is_enabled, 'cfg_enabled');
    assert(!config.is_initialized, 'cfg_not_initialized');
}

#[test]
fn initialize_denshokan_registers_game_and_src5() {
    let (world, actions_address, _token_address, registry_address) = setup_actions_world();
    let owner_account = deploy_player_account();
    let actions_selector = selector_from_names(@"dark_waters", @"Actions");

    world.sync_perms_and_inits(
        [ContractDefTrait::new_address(owner_account).with_owner_of([actions_selector].span())]
            .span(),
    );

    let owner = IMockPlayerAccountDispatcher { contract_address: owner_account };
    owner.configure_denshokan(actions_address, _token_address, true);
    let game_id = owner.initialize_denshokan(actions_address);
    assert(game_id == 1_u64, 'game_id');

    let config: EgsConfig = world.read_model(1_u8);
    assert(config.is_initialized, 'initialized');

    let registry = IMockRegistryDispatcher { contract_address: registry_address };
    assert(registry.registered_count() == 1_u32, 'registered_once');
    assert(registry.registered_game_id(actions_address) == 1_u64, 'registry_game');
    assert(registry.registered_for_address(actions_address), 'is_registered');

    let src5 = ISRC5Dispatcher { contract_address: actions_address };
    assert(src5.supports_interface(IMINIGAME_ID), 'supports_minigame');
}

#[test]
fn mint_game_proxies_to_denshokan_token() {
    let (world, actions_address, token_address, _registry_address) = setup_actions_world();
    let owner_account = deploy_player_account();
    let player = deploy_player_account();
    let actions_selector = selector_from_names(@"dark_waters", @"Actions");

    world.sync_perms_and_inits(
        [ContractDefTrait::new_address(owner_account).with_owner_of([actions_selector].span())]
            .span(),
    );

    let owner = IMockPlayerAccountDispatcher { contract_address: owner_account };
    owner.configure_denshokan(actions_address, token_address, true);
    owner.initialize_denshokan(actions_address);

    let minigame = IMinigameDispatcher { contract_address: actions_address };
    let token_id = minigame.mint_game(
        Option::None,
        Option::None,
        Option::None,
        Option::None,
        Option::None,
        Option::None,
        Option::None,
        Option::None,
        Option::None,
        player,
        false,
        false,
        7_u16,
        0_u16,
    );

    let token_admin = IMockDenshokanTokenAdminDispatcher { contract_address: token_address };
    assert(token_id == 1, 'minted_id');
    assert(token_admin.mint_calls() == 1_u32, 'mint_calls');
    assert(token_admin.last_mint_to() == player, 'mint_to');
    assert(token_admin.last_mint_game_address() == actions_address, 'mint_game_addr');
}

#[test]
fn link_session_is_idempotent_for_same_player_and_game() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut world, actions_address, token_address, _registry_address) = setup_actions_world();
    let owner_account = deploy_player_account();
    let token_id = 77;
    let game_id = 9_u32;

    let actions_selector = selector_from_names(@"dark_waters", @"Actions");
    world.sync_perms_and_inits(
        [ContractDefTrait::new_address(owner_account).with_owner_of([actions_selector].span())]
            .span(),
    );
    let owner = IMockPlayerAccountDispatcher { contract_address: owner_account };
    owner.configure_denshokan(actions_address, token_address, true);

    let mut token_admin = IMockDenshokanTokenAdminDispatcher { contract_address: token_address };
    token_admin.set_owner(token_id, player_1);
    token_admin.set_playable(token_id, true);

    seed_game(ref world, game_id, player_1, player_2, player_1, 0_u8, 0.try_into().unwrap(), 0_u32);

    let player = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player.link_session(actions_address, token_id, game_id);
    player.link_session(actions_address, token_id, game_id);

    let link: EgsSessionLink = world.read_model(token_id);
    assert(link.is_linked, 'linked');
    assert(link.game_id == game_id, 'linked_game');
    assert(link.player == player_1, 'linked_player');
}

#[test]
fn link_session_supports_large_denshokan_token_ids() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut world, actions_address, token_address, _registry_address) = setup_actions_world();
    let owner_account = deploy_player_account();
    let token_id =
        0x2d69e40000000000000069ad9d93000000000000000000000004c0000013;
    let game_id = 10_u32;

    let actions_selector = selector_from_names(@"dark_waters", @"Actions");
    world.sync_perms_and_inits(
        [ContractDefTrait::new_address(owner_account).with_owner_of([actions_selector].span())]
            .span(),
    );
    let owner = IMockPlayerAccountDispatcher { contract_address: owner_account };
    owner.configure_denshokan(actions_address, token_address, true);

    let mut token_admin = IMockDenshokanTokenAdminDispatcher { contract_address: token_address };
    token_admin.set_owner(token_id, player_1);
    token_admin.set_playable(token_id, true);

    seed_game(ref world, game_id, player_1, player_2, player_1, 0_u8, 0.try_into().unwrap(), 0_u32);

    let player = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player.link_session(actions_address, token_id, game_id);

    let link: EgsSessionLink = world.read_model(token_id);
    assert(link.is_linked, 'linked');
    assert(link.game_id == game_id, 'linked_game');
    assert(link.player == player_1, 'linked_player');
}

#[test]
fn commit_board_egs_updates_game_and_token_state() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut world, actions_address, token_address, _registry_address) = setup_actions_world();
    let owner_account = deploy_player_account();
    let token_id = 55;
    let game_id = 14_u32;

    let actions_selector = selector_from_names(@"dark_waters", @"Actions");
    world.sync_perms_and_inits(
        [ContractDefTrait::new_address(owner_account).with_owner_of([actions_selector].span())]
            .span(),
    );
    let owner = IMockPlayerAccountDispatcher { contract_address: owner_account };
    owner.configure_denshokan(actions_address, token_address, true);

    let mut token_admin = IMockDenshokanTokenAdminDispatcher { contract_address: token_address };
    token_admin.set_owner(token_id, player_1);
    token_admin.set_playable(token_id, true);

    seed_game(ref world, game_id, player_1, player_2, player_1, 0_u8, 0.try_into().unwrap(), 0_u32);
    seed_board(ref world, game_id, player_2, 123, 0_u8, true);
    world.write_model_test(
        @EgsSessionLink {
            token_id,
            game_id,
            player: player_1,
            linked_at: 0_u64,
            is_linked: true,
        },
    );

    let player = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player.commit_board_egs(actions_address, token_id, 999);

    let commitment: BoardCommitment = world.read_model((game_id, player_1));
    let game: Game = world.read_model(game_id);
    let token_admin = IMockDenshokanTokenAdminDispatcher { contract_address: token_address };

    assert(commitment.root == 999, 'root');
    assert(commitment.is_committed, 'committed');
    assert(game.state == 1_u8, 'active');
    assert(token_admin.update_calls() == 1_u32, 'update_calls');
    assert(token_admin.last_updated_token() == token_id, 'updated_token');
}

#[test]
fn score_and_game_over_follow_finished_game_state() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut world, actions_address, _token_address, _registry_address) = setup_actions_world();
    let token_id = 42;
    let game_id = 23_u32;

    seed_game(ref world, game_id, player_1, player_2, player_1, 2_u8, player_1, 12_u32);
    seed_board(ref world, game_id, player_2, 555, 4_u8, true);
    world.write_model_test(
        @EgsSessionLink {
            token_id,
            game_id,
            player: player_1,
            linked_at: 0_u64,
            is_linked: true,
        },
    );

    let token_data = IMinigameTokenDataDispatcher { contract_address: actions_address };
    assert(token_data.score(token_id) == 11_280_u64, 'score');
    assert(token_data.game_over(token_id), 'game_over');
    assert(token_data.score(999) == 0_u64, 'unlinked_score');
    assert(!token_data.game_over(999), 'unlinked_game_over');
}
