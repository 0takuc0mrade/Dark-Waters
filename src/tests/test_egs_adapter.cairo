#[starknet::contract]
pub mod mock_session_token {
    use super::IMockSessionToken;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess,
    };
    use starknet::ContractAddress;

    #[storage]
    struct Storage {
        owners: Map<felt252, ContractAddress>,
    }

    #[abi(embed_v0)]
    impl MockSessionTokenImpl of IMockSessionToken<ContractState> {
        fn set_owner(ref self: ContractState, token_id: felt252, owner: ContractAddress) {
            self.owners.write(token_id, owner);
        }

        fn owner_of(self: @ContractState, token_id: felt252) -> ContractAddress {
            self.owners.read(token_id)
        }
    }
}

#[starknet::contract]
pub mod mock_registry {
    use super::IMockRegistry;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::ContractAddress;

    #[storage]
    struct Storage {
        registered_count: u32,
        game_id: felt252,
        game_name: ByteArray,
        game_description: ByteArray,
        game_client_url: ByteArray,
        game_image_url: ByteArray,
        game_color: felt252,
        genre: ByteArray,
        game_creator: ContractAddress,
        game_renderer: ContractAddress,
        game_token: ContractAddress,
        game_skills: ContractAddress,
        royalty_fraction: u16,
    }

    #[abi(embed_v0)]
    impl MockRegistryImpl of IMockRegistry<ContractState> {
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
            self.game_id.write(game_id);
            self.game_name.write(game_name);
            self.game_description.write(game_description);
            self.game_client_url.write(game_client_url);
            self.game_image_url.write(game_image_url);
            self.game_color.write(game_color);
            self.genre.write(genre);
            self.game_creator.write(option_to_address(game_creator));
            self.game_renderer.write(option_to_address(game_renderer));
            self.game_token.write(game_token);
            self.game_skills.write(option_to_address(game_skills));
            self.royalty_fraction.write(royalty_fraction);
        }

        fn registered_count(self: @ContractState) -> u32 {
            self.registered_count.read()
        }

        fn game_id(self: @ContractState) -> felt252 {
            self.game_id.read()
        }

        fn game_name(self: @ContractState) -> ByteArray {
            self.game_name.read()
        }

        fn game_description(self: @ContractState) -> ByteArray {
            self.game_description.read()
        }

        fn game_client_url(self: @ContractState) -> ByteArray {
            self.game_client_url.read()
        }

        fn game_image_url(self: @ContractState) -> ByteArray {
            self.game_image_url.read()
        }

        fn game_color(self: @ContractState) -> felt252 {
            self.game_color.read()
        }

        fn genre(self: @ContractState) -> ByteArray {
            self.genre.read()
        }

        fn game_creator(self: @ContractState) -> ContractAddress {
            self.game_creator.read()
        }

        fn game_renderer(self: @ContractState) -> ContractAddress {
            self.game_renderer.read()
        }

        fn game_token(self: @ContractState) -> ContractAddress {
            self.game_token.read()
        }

        fn game_skills(self: @ContractState) -> ContractAddress {
            self.game_skills.read()
        }

        fn royalty_fraction(self: @ContractState) -> u16 {
            self.royalty_fraction.read()
        }
    }

    fn option_to_address(value: Option<ContractAddress>) -> ContractAddress {
        match value {
            Option::Some(address) => address,
            Option::None => 0.try_into().unwrap(),
        }
    }
}

#[starknet::interface]
trait IMockPlayerAccount<T> {
    fn link_session(self: @T, adapter: ContractAddress, token_id: felt252, game_id: u32);
}

#[starknet::contract]
pub mod mock_player_account {
    use super::IMockPlayerAccount;
    use dark_waters::systems::egs_adapter::{
        IEgsSessionLinkerDispatcher, IEgsSessionLinkerDispatcherTrait,
    };
    use starknet::ContractAddress;

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl MockPlayerAccountImpl of IMockPlayerAccount<ContractState> {
        fn link_session(
            self: @ContractState, adapter: ContractAddress, token_id: felt252, game_id: u32,
        ) {
            let dispatcher = IEgsSessionLinkerDispatcher { contract_address: adapter };
            dispatcher.link_session(token_id, game_id);
        }
    }
}

use core::traits::{Into, TryInto};
use dojo::model::{ModelStorage, ModelStorageTest};
use dojo::utils::bytearray_hash;
use dojo::world::world;
use dojo_cairo_test::{
    ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait, spawn_test_world,
};
use dark_waters::models::{
    BoardCommitment, EgsSessionLink, Game, m_BoardCommitment, m_EgsSessionLink, m_Game,
};
use dark_waters::systems::egs_adapter::{
    egs_adapter_contract, IMinigameTokenDataDispatcher, IMinigameTokenDataDispatcherTrait,
    IMINIGAME_ID, ISRC5Dispatcher, ISRC5DispatcherTrait, SRC5_ID, GAME_COLOR,
};
use starknet::syscalls::deploy_syscall;
use starknet::ClassHash;
use starknet::ContractAddress;

#[starknet::interface]
trait IMockSessionToken<T> {
    fn set_owner(ref self: T, token_id: felt252, owner: ContractAddress);
    fn owner_of(self: @T, token_id: felt252) -> ContractAddress;
}

#[starknet::interface]
trait IMockRegistry<T> {
    fn register_game(
        ref self: T,
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
    );
    fn registered_count(self: @T) -> u32;
    fn game_id(self: @T) -> felt252;
    fn game_name(self: @T) -> ByteArray;
    fn game_description(self: @T) -> ByteArray;
    fn game_client_url(self: @T) -> ByteArray;
    fn game_image_url(self: @T) -> ByteArray;
    fn game_color(self: @T) -> felt252;
    fn genre(self: @T) -> ByteArray;
    fn game_creator(self: @T) -> ContractAddress;
    fn game_renderer(self: @T) -> ContractAddress;
    fn game_token(self: @T) -> ContractAddress;
    fn game_skills(self: @T) -> ContractAddress;
    fn royalty_fraction(self: @T) -> u16;
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

fn deploy(class_hash: ClassHash, calldata: Span<felt252>) -> ContractAddress {
    let salt = core::testing::get_available_gas().into();
    let (address, _) = deploy_syscall(class_hash, salt, calldata, false).unwrap();
    address
}

fn deploy_adapter(
    world_address: ContractAddress,
    registry: ContractAddress,
    token: ContractAddress,
    creator: ContractAddress,
    renderer: ContractAddress,
    skills: ContractAddress,
    royalty_fraction: u16,
) -> ContractAddress {
    let calldata = array![
        world_address.into(),
        registry.into(),
        token.into(),
        creator.into(),
        renderer.into(),
        skills.into(),
        royalty_fraction.into(),
    ];
    deploy(egs_adapter_contract::TEST_CLASS_HASH, calldata.span())
}

fn seed_token_owner(token_address: ContractAddress, token_id: felt252, owner: ContractAddress) {
    let mut token = IMockSessionTokenDispatcher { contract_address: token_address };
    token.set_owner(token_id, owner);
    assert(token.owner_of(token_id) == owner, 'owner_seed');
}

fn deploy_player_account() -> ContractAddress {
    deploy(mock_player_account::TEST_CLASS_HASH, [].span())
}

fn setup_world_with_adapter(
    creator: ContractAddress, renderer: ContractAddress, skills: ContractAddress,
) -> (
    dojo::world::WorldStorage,
    ContractAddress,
    ContractAddress,
    ContractAddress,
) {
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [namespace_def()].span());
    let registry_address = deploy(mock_registry::TEST_CLASS_HASH, [].span());
    let token_address = deploy(mock_session_token::TEST_CLASS_HASH, [].span());
    let adapter_address =
        deploy_adapter(
            world.dispatcher.contract_address,
            registry_address,
            token_address,
            creator,
            renderer,
            skills,
            250_u16,
        );

    let namespace_selector = bytearray_hash(@"dark_waters");
    let defs =
        [ContractDefTrait::new_address(adapter_address).with_writer_of([namespace_selector].span())]
            .span();
    world.sync_perms_and_inits(defs);

    (world, registry_address, token_address, adapter_address)
}

fn write_game(
    ref world: dojo::world::WorldStorage,
    game_id: u32,
    player_1: ContractAddress,
    player_2: ContractAddress,
    state: u8,
    winner: ContractAddress,
    moves_count: u32,
    p1_hits_taken: u8,
    p2_hits_taken: u8,
) {
    let game = Game {
        game_id,
        player_1,
        player_2,
        turn: player_1,
        state,
        winner,
        last_action: 77_u64,
        moves_count,
        stake_token: 0.try_into().unwrap(),
        stake_amount: 0_u128,
        stake_locked_p1: false,
        stake_locked_p2: false,
        stake_settled: true,
    };
    let p1_commitment = BoardCommitment {
        game_id,
        player: player_1,
        root: 0,
        hits_taken: p1_hits_taken,
        is_committed: true,
    };
    let p2_commitment = BoardCommitment {
        game_id,
        player: player_2,
        root: 0,
        hits_taken: p2_hits_taken,
        is_committed: true,
    };

    world.write_model_test(@game);
    world.write_model_test(@p1_commitment);
    world.write_model_test(@p2_commitment);
}

#[test]
fn adapter_registers_registry_metadata_and_interfaces() {
    let creator = deploy_player_account();
    let renderer = deploy_player_account();
    let skills = deploy_player_account();
    let (_world, registry_address, token_address, adapter_address) =
        setup_world_with_adapter(creator, renderer, skills);

    let registry = IMockRegistryDispatcher { contract_address: registry_address };
    let src5 = ISRC5Dispatcher { contract_address: adapter_address };

    assert(registry.registered_count() == 1_u32, 'reg_count');
    assert(registry.game_id() == IMINIGAME_ID, 'game_id');
    assert(registry.game_name() == "Dark Waters", 'game_name');
    assert(
        registry.game_description() == "Dark Waters v1 by Dark Waters",
        'game_desc',
    );
    assert(
        registry.game_client_url() == "https://dark-waters-m2fn.vercel.app/",
        'game_url',
    );
    assert(registry.game_image_url() == "", 'game_img');
    assert(registry.game_color() == GAME_COLOR, 'game_color');
    assert(registry.genre() == "Strategy", 'genre');
    assert(registry.game_creator() == creator, 'creator');
    assert(registry.game_renderer() == renderer, 'renderer');
    assert(registry.game_token() == token_address, 'token');
    assert(registry.game_skills() == skills, 'skills');
    assert(registry.royalty_fraction() == 250_u16, 'royalty');

    assert(src5.supports_interface(SRC5_ID), 'src5');
    assert(src5.supports_interface(IMINIGAME_ID), 'iminigame');
    assert(!src5.supports_interface(123), 'unknown');
}

#[test]
fn link_session_persists_mapping_for_owned_participant_token() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let token_id = 7;
    let game_id = 11_u32;

    let (mut world, _registry_address, token_address, adapter_address) =
        setup_world_with_adapter(0.try_into().unwrap(), 0.try_into().unwrap(), 0.try_into().unwrap());
    write_game(ref world, game_id, player_1, player_2, 1, 0.try_into().unwrap(), 12_u32, 2_u8, 4_u8);

    seed_token_owner(token_address, token_id, player_1);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.link_session(adapter_address, token_id, game_id);

    let link: EgsSessionLink = world.read_model(token_id);
    assert(link.is_linked, 'is_linked');
    assert(link.game_id == game_id, 'game_id');
    assert(link.player == player_1, 'player');
    assert(link.linked_at == 0, 'timestamp_set');
}

#[test]
fn link_session_is_idempotent_for_same_tuple() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let token_id = 8;
    let game_id = 12_u32;

    let (mut world, _registry_address, token_address, adapter_address) =
        setup_world_with_adapter(0.try_into().unwrap(), 0.try_into().unwrap(), 0.try_into().unwrap());
    write_game(ref world, game_id, player_1, player_2, 1, 0.try_into().unwrap(), 8_u32, 1_u8, 3_u8);

    seed_token_owner(token_address, token_id, player_1);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.link_session(adapter_address, token_id, game_id);
    let first: EgsSessionLink = world.read_model(token_id);

    player_1_account.link_session(adapter_address, token_id, game_id);
    let second: EgsSessionLink = world.read_model(token_id);

    assert(second.is_linked, 'linked');
    assert(second.game_id == first.game_id, 'game_same');
    assert(second.player == first.player, 'player_same');
    assert(second.linked_at == first.linked_at, 'time_same');
}

#[test]
#[should_panic]
fn link_session_rejects_non_owner() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let outsider = deploy_player_account();

    let (mut world, _registry_address, token_address, adapter_address) =
        setup_world_with_adapter(0.try_into().unwrap(), 0.try_into().unwrap(), 0.try_into().unwrap());
    write_game(ref world, 13_u32, player_1, player_2, 1, 0.try_into().unwrap(), 8_u32, 0_u8, 0_u8);

    seed_token_owner(token_address, 9, player_1);

    let outsider_account = IMockPlayerAccountDispatcher { contract_address: outsider };
    outsider_account.link_session(adapter_address, 9, 13_u32);
}

#[test]
#[should_panic]
fn link_session_rejects_relink_to_different_game() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();

    let (mut world, _registry_address, token_address, adapter_address) =
        setup_world_with_adapter(0.try_into().unwrap(), 0.try_into().unwrap(), 0.try_into().unwrap());
    write_game(ref world, 14_u32, player_1, player_2, 1, 0.try_into().unwrap(), 8_u32, 0_u8, 0_u8);
    write_game(ref world, 15_u32, player_1, player_2, 1, 0.try_into().unwrap(), 8_u32, 0_u8, 0_u8);

    seed_token_owner(token_address, 10, player_1);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.link_session(adapter_address, 10, 14_u32);
    player_1_account.link_session(adapter_address, 10, 15_u32);
}

#[test]
fn unfinished_game_returns_zero_score_and_not_game_over() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();

    let (mut world, _registry_address, token_address, adapter_address) =
        setup_world_with_adapter(0.try_into().unwrap(), 0.try_into().unwrap(), 0.try_into().unwrap());
    write_game(ref world, 16_u32, player_1, player_2, 1, 0.try_into().unwrap(), 12_u32, 2_u8, 3_u8);

    seed_token_owner(token_address, 11, player_1);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.link_session(adapter_address, 11, 16_u32);

    let token_data = IMinigameTokenDataDispatcher { contract_address: adapter_address };
    assert(token_data.score(11) == 0_u64, 'score_zero');
    assert(!token_data.game_over(11), 'not_over');
}

#[test]
fn winner_and_loser_scores_use_damage_and_speed_formula() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();

    let (mut world, _registry_address, token_address, adapter_address) =
        setup_world_with_adapter(0.try_into().unwrap(), 0.try_into().unwrap(), 0.try_into().unwrap());
    write_game(ref world, 17_u32, player_1, player_2, 2, player_1, 12_u32, 4_u8, 10_u8);

    seed_token_owner(token_address, 12, player_1);
    seed_token_owner(token_address, 13, player_2);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    let player_2_account = IMockPlayerAccountDispatcher { contract_address: player_2 };
    player_1_account.link_session(adapter_address, 12, 17_u32);
    player_2_account.link_session(adapter_address, 13, 17_u32);

    let token_data = IMinigameTokenDataDispatcher { contract_address: adapter_address };
    assert(token_data.game_over(12), 'winner_over');
    assert(token_data.game_over(13), 'loser_over');
    assert(token_data.score(12) == 11880_u64, 'winner_score');
    assert(token_data.score(13) == 1280_u64, 'loser_score');
}

#[test]
fn timeout_winner_and_cancelled_game_paths_are_reported_correctly() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();

    let (mut world, _registry_address, token_address, adapter_address) =
        setup_world_with_adapter(0.try_into().unwrap(), 0.try_into().unwrap(), 0.try_into().unwrap());
    write_game(ref world, 18_u32, player_1, player_2, 2, player_2, 20_u32, 0_u8, 5_u8);
    write_game(ref world, 19_u32, player_1, player_2, 2, 0.try_into().unwrap(), 15_u32, 3_u8, 3_u8);

    seed_token_owner(token_address, 14, player_2);
    seed_token_owner(token_address, 15, player_1);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    let player_2_account = IMockPlayerAccountDispatcher { contract_address: player_2 };
    player_2_account.link_session(adapter_address, 14, 18_u32);
    player_1_account.link_session(adapter_address, 15, 19_u32);

    let token_data = IMinigameTokenDataDispatcher { contract_address: adapter_address };
    assert(token_data.score(14) == 10800_u64, 'timeout_score');
    assert(token_data.game_over(14), 'timeout_over');
    assert(token_data.score(15) == 0_u64, 'cancel_score');
    assert(token_data.game_over(15), 'cancel_over');
}

#[test]
fn batch_methods_match_scalar_results() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();

    let (mut world, _registry_address, token_address, adapter_address) =
        setup_world_with_adapter(0.try_into().unwrap(), 0.try_into().unwrap(), 0.try_into().unwrap());
    write_game(ref world, 20_u32, player_1, player_2, 2, player_1, 30_u32, 2_u8, 10_u8);
    write_game(ref world, 21_u32, player_1, player_2, 1, 0.try_into().unwrap(), 10_u32, 0_u8, 0_u8);

    seed_token_owner(token_address, 16, player_1);
    seed_token_owner(token_address, 17, player_1);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.link_session(adapter_address, 16, 20_u32);
    player_1_account.link_session(adapter_address, 17, 21_u32);

    let token_data = IMinigameTokenDataDispatcher { contract_address: adapter_address };
    let token_ids = [16, 17].span();
    let scores = token_data.score_batch(token_ids);
    let statuses = token_data.game_over_batch(token_ids);

    assert(*scores.at(0) == token_data.score(16), 'batch_score_0');
    assert(*scores.at(1) == token_data.score(17), 'batch_score_1');
    assert(*statuses.at(0) == token_data.game_over(16), 'batch_over_0');
    assert(*statuses.at(1) == token_data.game_over(17), 'batch_over_1');
}
