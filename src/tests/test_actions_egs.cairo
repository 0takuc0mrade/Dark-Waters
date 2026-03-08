#[starknet::interface]
trait IMockEgsRuntime<T> {
    fn set_owner(ref self: T, token_id: felt252, owner: ContractAddress);
    fn set_fail_pre(ref self: T, should_fail: bool);
    fn set_fail_post(ref self: T, should_fail: bool);
    fn arm_owner_reentry(
        ref self: T,
        actions: ContractAddress,
        trigger_token_id: felt252,
        reentry_token_id: felt252,
        merkle_root: felt252,
    );
    fn pre_calls(self: @T) -> u32;
    fn post_calls(self: @T) -> u32;
    fn last_action(self: @T) -> felt252;
    fn last_game_id(self: @T) -> u32;
    fn last_player(self: @T) -> ContractAddress;
}

#[starknet::contract]
pub mod mock_egs_runtime {
    use super::IMockEgsRuntime;
    use dark_waters::systems::actions::{
        IActionsDispatcher, IActionsDispatcherTrait, IEgsActionHooks, ISessionToken,
    };
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::ContractAddress;

    #[storage]
    struct Storage {
        owners: Map<felt252, ContractAddress>,
        fail_pre: bool,
        fail_post: bool,
        pre_calls: u32,
        post_calls: u32,
        last_action: felt252,
        last_game_id: u32,
        last_player: ContractAddress,
        reenter_on_owner: bool,
        reentry_actions: ContractAddress,
        reentry_trigger_token_id: felt252,
        reentry_token_id: felt252,
        reentry_merkle_root: felt252,
    }

    #[abi(embed_v0)]
    impl MockRuntimeImpl of IMockEgsRuntime<ContractState> {
        fn set_owner(ref self: ContractState, token_id: felt252, owner: ContractAddress) {
            self.owners.write(token_id, owner);
        }

        fn set_fail_pre(ref self: ContractState, should_fail: bool) {
            self.fail_pre.write(should_fail);
        }

        fn set_fail_post(ref self: ContractState, should_fail: bool) {
            self.fail_post.write(should_fail);
        }

        fn arm_owner_reentry(
            ref self: ContractState,
            actions: ContractAddress,
            trigger_token_id: felt252,
            reentry_token_id: felt252,
            merkle_root: felt252,
        ) {
            self.reenter_on_owner.write(true);
            self.reentry_actions.write(actions);
            self.reentry_trigger_token_id.write(trigger_token_id);
            self.reentry_token_id.write(reentry_token_id);
            self.reentry_merkle_root.write(merkle_root);
        }

        fn pre_calls(self: @ContractState) -> u32 {
            self.pre_calls.read()
        }

        fn post_calls(self: @ContractState) -> u32 {
            self.post_calls.read()
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
    impl SessionTokenImpl of ISessionToken<ContractState> {
        fn owner_of(self: @ContractState, token_id: felt252) -> ContractAddress {
            if self.reenter_on_owner.read() && token_id == self.reentry_trigger_token_id.read() {
                let dispatcher =
                    IActionsDispatcher { contract_address: self.reentry_actions.read() };
                dispatcher.commit_board_egs(
                    self.reentry_token_id.read(), self.reentry_merkle_root.read(),
                );
            }
            self.owners.read(token_id)
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
            let _ = token_id;
            assert(!self.fail_pre.read(), 'pre_fail');
            self.pre_calls.write(self.pre_calls.read() + 1_u32);
            self.last_action.write(action);
            self.last_game_id.write(game_id);
            self.last_player.write(player);
        }

        fn post_action(
            ref self: ContractState,
            token_id: felt252,
            action: felt252,
            game_id: u32,
            player: ContractAddress,
        ) {
            let _ = token_id;
            assert(!self.fail_post.read(), 'post_fail');
            self.post_calls.write(self.post_calls.read() + 1_u32);
            self.last_action.write(action);
            self.last_game_id.write(game_id);
            self.last_player.write(player);
        }
    }
}

#[starknet::interface]
trait IMockErc20<T> {
    fn mint(ref self: T, account: ContractAddress, amount: u128);
    fn balance_of(self: @T, account: ContractAddress) -> u128;
}

#[starknet::contract]
pub mod mock_erc20 {
    use super::IMockErc20;
    use dark_waters::systems::actions::IERC20;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u128>,
    }

    #[abi(embed_v0)]
    impl MockErc20Impl of IMockErc20<ContractState> {
        fn mint(ref self: ContractState, account: ContractAddress, amount: u128) {
            let balance = self.balances.read(account);
            self.balances.write(account, balance + amount);
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u128 {
            self.balances.read(account)
        }
    }

    #[abi(embed_v0)]
    impl Erc20Impl of IERC20<ContractState> {
        fn transfer_from(
            ref self: ContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
        ) -> bool {
            assert(amount.high == 0_u128, 'high');
            move_balance(ref self, sender, recipient, amount.low);
            true
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            assert(amount.high == 0_u128, 'high');
            move_balance(ref self, get_caller_address(), recipient, amount.low);
            true
        }
    }

    fn move_balance(
        ref self: ContractState, sender: ContractAddress, recipient: ContractAddress, amount: u128,
    ) {
        let sender_balance = self.balances.read(sender);
        assert(sender_balance >= amount, 'balance');
        self.balances.write(sender, sender_balance - amount);

        let recipient_balance = self.balances.read(recipient);
        self.balances.write(recipient, recipient_balance + amount);
    }
}

#[starknet::interface]
trait IMockPlayerAccount<T> {
    fn commit_board(self: @T, actions: ContractAddress, game_id: u32, merkle_root: felt252);
    fn commit_attack(self: @T, actions: ContractAddress, game_id: u32, attack_hash: felt252);
    fn reveal_attack(
        self: @T, actions: ContractAddress, game_id: u32, x: u8, y: u8, reveal_nonce: felt252,
    );
    fn reveal(
        self: @T,
        actions: ContractAddress,
        game_id: u32,
        x: u8,
        y: u8,
        cell_nonce: felt252,
        is_ship: bool,
        proof: Span<felt252>,
    );
    fn claim_timeout_win(self: @T, actions: ContractAddress, game_id: u32);
    fn commit_board_egs(self: @T, actions: ContractAddress, token_id: felt252, merkle_root: felt252);
    fn commit_attack_egs(self: @T, actions: ContractAddress, token_id: felt252, attack_hash: felt252);
    fn reveal_attack_egs(
        self: @T, actions: ContractAddress, token_id: felt252, x: u8, y: u8, reveal_nonce: felt252,
    );
    fn reveal_egs(
        self: @T,
        actions: ContractAddress,
        token_id: felt252,
        x: u8,
        y: u8,
        cell_nonce: felt252,
        is_ship: bool,
        proof: Span<felt252>,
    );
    fn claim_timeout_win_egs(self: @T, actions: ContractAddress, token_id: felt252);
    fn configure_egs(
        self: @T,
        actions: ContractAddress,
        session_token: ContractAddress,
        hooks_contract: ContractAddress,
        is_enabled: bool,
    );
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
        fn commit_board(
            self: @ContractState, actions: ContractAddress, game_id: u32, merkle_root: felt252,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.commit_board(game_id, merkle_root);
        }

        fn commit_attack(
            self: @ContractState, actions: ContractAddress, game_id: u32, attack_hash: felt252,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.commit_attack(game_id, attack_hash);
        }

        fn reveal_attack(
            self: @ContractState,
            actions: ContractAddress,
            game_id: u32,
            x: u8,
            y: u8,
            reveal_nonce: felt252,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.reveal_attack(game_id, x, y, reveal_nonce);
        }

        fn reveal(
            self: @ContractState,
            actions: ContractAddress,
            game_id: u32,
            x: u8,
            y: u8,
            cell_nonce: felt252,
            is_ship: bool,
            proof: Span<felt252>,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.reveal(game_id, x, y, cell_nonce, is_ship, proof);
        }

        fn claim_timeout_win(
            self: @ContractState, actions: ContractAddress, game_id: u32,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.claim_timeout_win(game_id);
        }

        fn commit_board_egs(
            self: @ContractState, actions: ContractAddress, token_id: felt252, merkle_root: felt252,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.commit_board_egs(token_id, merkle_root);
        }

        fn commit_attack_egs(
            self: @ContractState, actions: ContractAddress, token_id: felt252, attack_hash: felt252,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.commit_attack_egs(token_id, attack_hash);
        }

        fn reveal_attack_egs(
            self: @ContractState,
            actions: ContractAddress,
            token_id: felt252,
            x: u8,
            y: u8,
            reveal_nonce: felt252,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.reveal_attack_egs(token_id, x, y, reveal_nonce);
        }

        fn reveal_egs(
            self: @ContractState,
            actions: ContractAddress,
            token_id: felt252,
            x: u8,
            y: u8,
            cell_nonce: felt252,
            is_ship: bool,
            proof: Span<felt252>,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.reveal_egs(token_id, x, y, cell_nonce, is_ship, proof);
        }

        fn claim_timeout_win_egs(
            self: @ContractState, actions: ContractAddress, token_id: felt252,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.claim_timeout_win_egs(token_id);
        }

        fn configure_egs(
            self: @ContractState,
            actions: ContractAddress,
            session_token: ContractAddress,
            hooks_contract: ContractAddress,
            is_enabled: bool,
        ) {
            let dispatcher = IActionsDispatcher { contract_address: actions };
            dispatcher.configure_egs(session_token, hooks_contract, is_enabled);
        }
    }
}

use core::result::ResultTrait;
use core::traits::{Into, TryInto};
use dojo::model::{ModelStorage, ModelStorageTest};
use dojo::utils::{bytearray_hash, selector_from_names};
use dojo::world::{WorldStorageTrait, world};
use dojo_cairo_test::{
    ContractDef, ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait,
    spawn_test_world,
};
use dark_waters::models::{
    Attack, AttackCommitment, BoardCommitment, EgsConfig, EgsSessionLink, Game, PendingAttack,
    Vec2, m_Attack, m_AttackCommitment, m_BoardCommitment, m_EgsConfig, m_EgsSessionLink, m_Game,
    m_GameCounter, m_PendingAttack,
};
use dark_waters::systems::actions::Actions;
use dark_waters::utils::{MOVE_TIMEOUT_SECONDS, compute_attack_commitment_hash, compute_board_leaf_hash};
use starknet::syscalls::deploy_syscall;
use starknet::{ClassHash, ContractAddress, testing};

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
            TestResource::Event(Actions::e_stake_settled::TEST_CLASS_HASH),
            TestResource::Contract(Actions::TEST_CLASS_HASH),
        ]
            .span(),
    }
}

fn contract_defs(
    session_token: ContractAddress, hooks_contract: ContractAddress,
) -> Span<ContractDef> {
    let namespace_selector = bytearray_hash(@"dark_waters");
    [ContractDefTrait::new(@"dark_waters", @"Actions")
        .with_writer_of([namespace_selector].span())
        .with_init_calldata([session_token.into(), hooks_contract.into()].span())]
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
    dojo::world::WorldStorage, ContractAddress, ContractAddress,
) {
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [namespace_def()].span());
    let runtime_address = deploy(mock_egs_runtime::TEST_CLASS_HASH, [].span());
    world.sync_perms_and_inits(contract_defs(runtime_address, runtime_address));

    let actions_address = world.dns_address(@"Actions").unwrap();

    let config: EgsConfig = world.read_model(1_u8);
    assert(config.session_token == runtime_address, 'init_token');
    assert(config.hooks_contract == runtime_address, 'init_hooks');
    assert(config.is_enabled, 'init_enabled');

    (world, actions_address, runtime_address)
}

fn seed_link(
    ref world: dojo::world::WorldStorage, token_id: felt252, game_id: u32, player: ContractAddress,
) {
    world.write_model_test(
        @EgsSessionLink {
            token_id,
            game_id,
            player,
            linked_at: 0_u64,
            is_linked: true,
        },
    );
}

fn seed_game(
    ref world: dojo::world::WorldStorage,
    game_id: u32,
    player_1: ContractAddress,
    player_2: ContractAddress,
    turn: ContractAddress,
    state: u8,
    winner: ContractAddress,
    last_action: u64,
    moves_count: u32,
    stake_token: ContractAddress,
    stake_amount: u128,
    stake_locked_p1: bool,
    stake_locked_p2: bool,
    stake_settled: bool,
) {
    world.write_model_test(
        @Game {
            game_id,
            player_1,
            player_2,
            turn,
            state,
            winner,
            last_action,
            moves_count,
            stake_token,
            stake_amount,
            stake_locked_p1,
            stake_locked_p2,
            stake_settled,
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

fn seed_attack_commitment(
    ref world: dojo::world::WorldStorage,
    game_id: u32,
    attacker: ContractAddress,
    attack_hash: felt252,
    timestamp: u64,
    is_revealed: bool,
) {
    world.write_model_test(
        @AttackCommitment { game_id, attacker, attack_hash, timestamp, is_revealed },
    );
}

fn seed_attack(
    ref world: dojo::world::WorldStorage,
    game_id: u32,
    attacker: ContractAddress,
    x: u8,
    y: u8,
    timestamp: u64,
    is_revealed: bool,
    is_hit: bool,
) {
    world.write_model_test(
        @Attack {
            game_id,
            attacker,
            position: Vec2 { x, y },
            timestamp,
            is_revealed,
            is_hit,
        },
    );
}

fn seed_pending_attack(
    ref world: dojo::world::WorldStorage,
    game_id: u32,
    attacker: ContractAddress,
    x: u8,
    y: u8,
    is_pending: bool,
) {
    world.write_model_test(@PendingAttack { game_id, attacker, x, y, is_pending });
}

fn assert_games_equal(left: Game, right: Game) {
    assert(left.game_id == right.game_id, 'game_id');
    assert(left.player_1 == right.player_1, 'game_p1');
    assert(left.player_2 == right.player_2, 'game_p2');
    assert(left.turn == right.turn, 'game_turn');
    assert(left.state == right.state, 'game_state');
    assert(left.winner == right.winner, 'game_winner');
    assert(left.last_action == right.last_action, 'game_last');
    assert(left.moves_count == right.moves_count, 'game_moves');
    assert(left.stake_token == right.stake_token, 'game_token');
    assert(left.stake_amount == right.stake_amount, 'game_amount');
    assert(left.stake_locked_p1 == right.stake_locked_p1, 'game_lock1');
    assert(left.stake_locked_p2 == right.stake_locked_p2, 'game_lock2');
    assert(left.stake_settled == right.stake_settled, 'game_settled');
}

fn assert_games_equal_without_stake_token(left: Game, right: Game) {
    assert(left.game_id == right.game_id, 'game2_id');
    assert(left.player_1 == right.player_1, 'game2_p1');
    assert(left.player_2 == right.player_2, 'game2_p2');
    assert(left.turn == right.turn, 'game2_turn');
    assert(left.state == right.state, 'game2_state');
    assert(left.winner == right.winner, 'game2_winner');
    assert(left.last_action == right.last_action, 'game2_last');
    assert(left.moves_count == right.moves_count, 'game2_moves');
    assert(left.stake_amount == right.stake_amount, 'game2_amount');
    assert(left.stake_locked_p1 == right.stake_locked_p1, 'game2_lock1');
    assert(left.stake_locked_p2 == right.stake_locked_p2, 'game2_lock2');
    assert(left.stake_settled == right.stake_settled, 'game2_settled');
}

fn assert_boards_equal(left: BoardCommitment, right: BoardCommitment) {
    assert(left.game_id == right.game_id, 'board_game');
    assert(left.player == right.player, 'board_player');
    assert(left.root == right.root, 'board_root');
    assert(left.hits_taken == right.hits_taken, 'board_hits');
    assert(left.is_committed == right.is_committed, 'board_commit');
}

fn assert_attack_commitments_equal(left: AttackCommitment, right: AttackCommitment) {
    assert(left.game_id == right.game_id, 'atk_commit_game');
    assert(left.attacker == right.attacker, 'atk_commit_player');
    assert(left.attack_hash == right.attack_hash, 'atk_commit_hash');
    assert(left.timestamp == right.timestamp, 'atk_commit_ts');
    assert(left.is_revealed == right.is_revealed, 'atk_commit_reveal');
}

fn assert_attacks_equal(left: Attack, right: Attack) {
    assert(left.game_id == right.game_id, 'attack_game');
    assert(left.attacker == right.attacker, 'attack_player');
    assert(left.position.x == right.position.x, 'attack_x');
    assert(left.position.y == right.position.y, 'attack_y');
    assert(left.timestamp == right.timestamp, 'attack_ts');
    assert(left.is_revealed == right.is_revealed, 'attack_reveal');
    assert(left.is_hit == right.is_hit, 'attack_hit');
}

fn assert_pending_attacks_equal(left: PendingAttack, right: PendingAttack) {
    assert(left.game_id == right.game_id, 'pending_game');
    assert(left.attacker == right.attacker, 'pending_player');
    assert(left.x == right.x, 'pending_x');
    assert(left.y == right.y, 'pending_y');
    assert(left.is_pending == right.is_pending, 'pending_flag');
}

#[test]
fn configure_egs_updates_config_for_contract_owner() {
    let (world, actions_address, _) = setup_actions_world();
    let owner_account = deploy_player_account();
    let new_session_token = deploy(mock_egs_runtime::TEST_CLASS_HASH, [].span());
    let new_hooks_contract = deploy(mock_egs_runtime::TEST_CLASS_HASH, [].span());
    let actions_selector = selector_from_names(@"dark_waters", @"Actions");

    world.sync_perms_and_inits(
        [ContractDefTrait::new_address(owner_account).with_owner_of([actions_selector].span())]
            .span(),
    );

    let owner = IMockPlayerAccountDispatcher { contract_address: owner_account };
    owner.configure_egs(actions_address, new_session_token, new_hooks_contract, true);

    let config: EgsConfig = world.read_model(1_u8);
    assert(config.session_token == new_session_token, 'cfg_token');
    assert(config.hooks_contract == new_hooks_contract, 'cfg_hooks');
    assert(config.is_enabled, 'cfg_enabled');
}

#[test]
#[should_panic]
fn configure_egs_rejects_unauthorized_caller() {
    let (_world, actions_address, _) = setup_actions_world();
    let outsider = deploy_player_account();
    let new_session_token = deploy(mock_egs_runtime::TEST_CLASS_HASH, [].span());
    let new_hooks_contract = deploy(mock_egs_runtime::TEST_CLASS_HASH, [].span());

    let outsider_account = IMockPlayerAccountDispatcher { contract_address: outsider };
    outsider_account.configure_egs(
        actions_address, new_session_token, new_hooks_contract, true,
    );
}

#[test]
fn commit_board_egs_writes_board_and_calls_hooks() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut world, actions_address, runtime_address) = setup_actions_world();
    let token_id = 1;
    let game_id = 44_u32;

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: runtime_address };
    runtime.set_owner(token_id, player_1);

    seed_game(
        ref world,
        game_id,
        player_1,
        player_2,
        player_1,
        0_u8,
        0.try_into().unwrap(),
        0_u64,
        0_u32,
        0.try_into().unwrap(),
        0_u128,
        false,
        false,
        true,
    );
    seed_board(ref world, game_id, player_2, 777, 0_u8, true);
    seed_link(ref world, token_id, game_id, player_1);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.commit_board_egs(actions_address, token_id, 999);

    let commitment: BoardCommitment = world.read_model((game_id, player_1));
    let game: Game = world.read_model(game_id);

    assert(commitment.root == 999, 'root');
    assert(commitment.is_committed, 'committed');
    assert(game.state == 1_u8, 'active');
    assert(runtime.pre_calls() == 1_u32, 'pre');
    assert(runtime.post_calls() == 1_u32, 'post');
    assert(runtime.last_game_id() == game_id, 'hook_game');
    assert(runtime.last_player() == player_1, 'hook_player');
}

#[test]
#[should_panic]
fn commit_board_egs_rejects_stale_owner() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let outsider = deploy_player_account();
    let (mut world, actions_address, runtime_address) = setup_actions_world();
    let token_id = 2;
    let game_id = 45_u32;

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: runtime_address };
    runtime.set_owner(token_id, outsider);

    seed_game(
        ref world,
        game_id,
        player_1,
        player_2,
        player_1,
        0_u8,
        0.try_into().unwrap(),
        0_u64,
        0_u32,
        0.try_into().unwrap(),
        0_u128,
        false,
        false,
        true,
    );
    seed_link(ref world, token_id, game_id, player_1);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.commit_board_egs(actions_address, token_id, 111);
}

#[test]
fn commit_attack_and_reveal_attack_egs_use_linked_game_context() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut world, actions_address, runtime_address) = setup_actions_world();
    let token_id = 3;
    let game_id = 46_u32;
    let attack_hash = compute_attack_commitment_hash(3_u8, 4_u8, 0xabc);

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: runtime_address };
    runtime.set_owner(token_id, player_1);

    seed_game(
        ref world,
        game_id,
        player_1,
        player_2,
        player_1,
        1_u8,
        0.try_into().unwrap(),
        0_u64,
        0_u32,
        0.try_into().unwrap(),
        0_u128,
        false,
        false,
        true,
    );
    seed_link(ref world, token_id, game_id, player_1);
    seed_pending_attack(ref world, game_id, 0.try_into().unwrap(), 0_u8, 0_u8, false);

    testing::set_block_timestamp(1_u64);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.commit_attack_egs(actions_address, token_id, attack_hash);
    player_1_account.reveal_attack_egs(actions_address, token_id, 3_u8, 4_u8, 0xabc);

    let commitment: AttackCommitment = world.read_model((game_id, player_1));
    let attack: Attack = world.read_model((game_id, player_1, Vec2 { x: 3_u8, y: 4_u8 }));
    let pending: PendingAttack = world.read_model(game_id);
    let game: Game = world.read_model(game_id);

    assert(commitment.is_revealed, 'reveal_marked');
    assert(commitment.attack_hash == attack_hash, 'attack_hash');
    assert(attack.timestamp != 0_u64, 'attack_written');
    assert(!attack.is_revealed, 'awaiting_defense');
    assert(pending.is_pending, 'pending');
    assert(game.moves_count == 1_u32, 'moves');
    assert(runtime.pre_calls() == 2_u32, 'pre_count');
    assert(runtime.post_calls() == 2_u32, 'post_count');
}

#[test]
fn reveal_egs_finishes_game_and_settles_stake() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut world, actions_address, runtime_address) = setup_actions_world();
    let erc20_address = deploy(mock_erc20::TEST_CLASS_HASH, [].span());
    let token_id = 4;
    let game_id = 47_u32;
    let x = 5_u8;
    let y = 6_u8;
    let cell_nonce = 0x1234;
    let leaf = compute_board_leaf_hash(x, y, cell_nonce, true);

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: runtime_address };
    runtime.set_owner(token_id, player_2);

    let mut erc20 = IMockErc20Dispatcher { contract_address: erc20_address };
    erc20.mint(actions_address, 40_u128);

    seed_game(
        ref world,
        game_id,
        player_1,
        player_2,
        player_1,
        1_u8,
        0.try_into().unwrap(),
        0_u64,
        9_u32,
        erc20_address,
        20_u128,
        true,
        true,
        false,
    );
    seed_board(ref world, game_id, player_1, 555, 0_u8, true);
    seed_board(ref world, game_id, player_2, leaf, 9_u8, true);
    seed_attack(ref world, game_id, player_1, x, y, 1_u64, false, false);
    seed_pending_attack(ref world, game_id, player_1, x, y, true);
    seed_link(ref world, token_id, game_id, player_2);

    let player_2_account = IMockPlayerAccountDispatcher { contract_address: player_2 };
    player_2_account.reveal_egs(actions_address, token_id, x, y, cell_nonce, true, [].span());

    let game: Game = world.read_model(game_id);
    let defender: BoardCommitment = world.read_model((game_id, player_2));
    let attack: Attack = world.read_model((game_id, player_1, Vec2 { x, y }));

    assert(game.state == 2_u8, 'finished');
    assert(game.winner == player_1, 'winner');
    assert(game.stake_settled, 'settled');
    assert(defender.hits_taken == 10_u8, 'hits');
    assert(attack.is_revealed && attack.is_hit, 'attack_hit');
    assert(erc20.balance_of(player_1) == 40_u128, 'winner_paid');
    assert(erc20.balance_of(actions_address) == 0_u128, 'vault_empty');
}

#[test]
fn claim_timeout_win_egs_sets_winner_for_active_game() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut world, actions_address, runtime_address) = setup_actions_world();
    let token_id = 5;
    let game_id = 48_u32;

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: runtime_address };
    runtime.set_owner(token_id, player_2);

    seed_game(
        ref world,
        game_id,
        player_1,
        player_2,
        player_1,
        1_u8,
        0.try_into().unwrap(),
        10_u64,
        2_u32,
        0.try_into().unwrap(),
        0_u128,
        false,
        false,
        true,
    );
    seed_link(ref world, token_id, game_id, player_2);

    testing::set_block_timestamp(10_u64 + MOVE_TIMEOUT_SECONDS + 1_u64);

    let player_2_account = IMockPlayerAccountDispatcher { contract_address: player_2 };
    player_2_account.claim_timeout_win_egs(actions_address, token_id);

    let game: Game = world.read_model(game_id);
    assert(game.state == 2_u8, 'finished');
    assert(game.winner == player_2, 'winner');
    assert(runtime.pre_calls() == 1_u32, 'pre');
    assert(runtime.post_calls() == 1_u32, 'post');
}

#[test]
#[should_panic]
fn pre_action_failure_reverts_wrapper_path() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut world, actions_address, runtime_address) = setup_actions_world();
    let token_id = 6;
    let game_id = 49_u32;

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: runtime_address };
    runtime.set_owner(token_id, player_1);
    runtime.set_fail_pre(true);

    seed_game(
        ref world,
        game_id,
        player_1,
        player_2,
        player_1,
        0_u8,
        0.try_into().unwrap(),
        0_u64,
        0_u32,
        0.try_into().unwrap(),
        0_u128,
        false,
        false,
        true,
    );
    seed_link(ref world, token_id, game_id, player_1);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.commit_board_egs(actions_address, token_id, 222);
}

#[test]
#[should_panic]
fn commit_board_egs_rejects_unlinked_token() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (_world, actions_address, runtime_address) = setup_actions_world();
    let token_id = 7;

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: runtime_address };
    runtime.set_owner(token_id, player_1);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    let _ = player_2;
    player_1_account.commit_board_egs(actions_address, token_id, 333);
}

#[test]
#[should_panic]
fn post_action_failure_reverts_wrapper_path() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut world, actions_address, runtime_address) = setup_actions_world();
    let token_id = 8;
    let game_id = 50_u32;

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: runtime_address };
    runtime.set_owner(token_id, player_1);
    runtime.set_fail_post(true);

    seed_game(
        ref world,
        game_id,
        player_1,
        player_2,
        player_1,
        0_u8,
        0.try_into().unwrap(),
        0_u64,
        0_u32,
        0.try_into().unwrap(),
        0_u128,
        false,
        false,
        true,
    );
    seed_link(ref world, token_id, game_id, player_1);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.commit_board_egs(actions_address, token_id, 444);
}

#[test]
fn commit_board_egs_matches_native_path() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut native_world, native_actions, _native_runtime) = setup_actions_world();
    let (mut egs_world, egs_actions, egs_runtime_address) = setup_actions_world();
    let token_id = 9;
    let game_id = 51_u32;
    let zero: ContractAddress = 0.try_into().unwrap();

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: egs_runtime_address };
    runtime.set_owner(token_id, player_1);

    testing::set_block_timestamp(77_u64);

    seed_game(
        ref native_world,
        game_id,
        player_1,
        player_2,
        player_1,
        0_u8,
        zero,
        0_u64,
        0_u32,
        zero,
        0_u128,
        false,
        false,
        true,
    );
    seed_game(
        ref egs_world,
        game_id,
        player_1,
        player_2,
        player_1,
        0_u8,
        zero,
        0_u64,
        0_u32,
        zero,
        0_u128,
        false,
        false,
        true,
    );
    seed_board(ref native_world, game_id, player_2, 777, 0_u8, true);
    seed_board(ref egs_world, game_id, player_2, 777, 0_u8, true);
    seed_link(ref egs_world, token_id, game_id, player_1);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.commit_board(native_actions, game_id, 999);
    player_1_account.commit_board_egs(egs_actions, token_id, 999);

    let native_commitment: BoardCommitment = native_world.read_model((game_id, player_1));
    let egs_commitment: BoardCommitment = egs_world.read_model((game_id, player_1));
    let native_game: Game = native_world.read_model(game_id);
    let egs_game: Game = egs_world.read_model(game_id);

    assert_boards_equal(native_commitment, egs_commitment);
    assert_games_equal(native_game, egs_game);
    assert(runtime.pre_calls() == 1_u32, 'parity_pre');
    assert(runtime.post_calls() == 1_u32, 'parity_post');
}

#[test]
fn commit_attack_and_reveal_attack_egs_match_native_path() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut native_world, native_actions, _native_runtime) = setup_actions_world();
    let (mut egs_world, egs_actions, egs_runtime_address) = setup_actions_world();
    let token_id = 10;
    let game_id = 52_u32;
    let zero: ContractAddress = 0.try_into().unwrap();
    let attack_hash = compute_attack_commitment_hash(3_u8, 4_u8, 0xabc);

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: egs_runtime_address };
    runtime.set_owner(token_id, player_1);

    seed_game(
        ref native_world,
        game_id,
        player_1,
        player_2,
        player_1,
        1_u8,
        zero,
        0_u64,
        0_u32,
        zero,
        0_u128,
        false,
        false,
        true,
    );
    seed_game(
        ref egs_world,
        game_id,
        player_1,
        player_2,
        player_1,
        1_u8,
        zero,
        0_u64,
        0_u32,
        zero,
        0_u128,
        false,
        false,
        true,
    );
    seed_pending_attack(ref native_world, game_id, zero, 0_u8, 0_u8, false);
    seed_pending_attack(ref egs_world, game_id, zero, 0_u8, 0_u8, false);
    seed_link(ref egs_world, token_id, game_id, player_1);

    testing::set_block_timestamp(88_u64);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.commit_attack(native_actions, game_id, attack_hash);
    player_1_account.reveal_attack(native_actions, game_id, 3_u8, 4_u8, 0xabc);
    player_1_account.commit_attack_egs(egs_actions, token_id, attack_hash);
    player_1_account.reveal_attack_egs(egs_actions, token_id, 3_u8, 4_u8, 0xabc);

    let native_commitment: AttackCommitment = native_world.read_model((game_id, player_1));
    let egs_commitment: AttackCommitment = egs_world.read_model((game_id, player_1));
    let native_attack: Attack = native_world.read_model((game_id, player_1, Vec2 { x: 3_u8, y: 4_u8 }));
    let egs_attack: Attack = egs_world.read_model((game_id, player_1, Vec2 { x: 3_u8, y: 4_u8 }));
    let native_pending: PendingAttack = native_world.read_model(game_id);
    let egs_pending: PendingAttack = egs_world.read_model(game_id);
    let native_game: Game = native_world.read_model(game_id);
    let egs_game: Game = egs_world.read_model(game_id);

    assert_attack_commitments_equal(native_commitment, egs_commitment);
    assert_attacks_equal(native_attack, egs_attack);
    assert_pending_attacks_equal(native_pending, egs_pending);
    assert_games_equal(native_game, egs_game);
    assert(runtime.pre_calls() == 2_u32, 'attack_pre');
    assert(runtime.post_calls() == 2_u32, 'attack_post');
}

#[test]
fn reveal_egs_matches_native_path_for_endgame_stake_settlement() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut native_world, native_actions, _native_runtime) = setup_actions_world();
    let (mut egs_world, egs_actions, egs_runtime_address) = setup_actions_world();
    let native_erc20_address = deploy(mock_erc20::TEST_CLASS_HASH, [].span());
    let egs_erc20_address = deploy(mock_erc20::TEST_CLASS_HASH, [].span());
    let token_id = 11;
    let game_id = 53_u32;
    let x = 5_u8;
    let y = 6_u8;
    let cell_nonce = 0x1234;
    let zero: ContractAddress = 0.try_into().unwrap();
    let leaf = compute_board_leaf_hash(x, y, cell_nonce, true);

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: egs_runtime_address };
    runtime.set_owner(token_id, player_2);

    let mut native_erc20 = IMockErc20Dispatcher { contract_address: native_erc20_address };
    let mut egs_erc20 = IMockErc20Dispatcher { contract_address: egs_erc20_address };
    native_erc20.mint(native_actions, 40_u128);
    egs_erc20.mint(egs_actions, 40_u128);

    seed_game(
        ref native_world,
        game_id,
        player_1,
        player_2,
        player_1,
        1_u8,
        zero,
        0_u64,
        9_u32,
        native_erc20_address,
        20_u128,
        true,
        true,
        false,
    );
    seed_game(
        ref egs_world,
        game_id,
        player_1,
        player_2,
        player_1,
        1_u8,
        zero,
        0_u64,
        9_u32,
        egs_erc20_address,
        20_u128,
        true,
        true,
        false,
    );
    seed_board(ref native_world, game_id, player_1, 555, 0_u8, true);
    seed_board(ref egs_world, game_id, player_1, 555, 0_u8, true);
    seed_board(ref native_world, game_id, player_2, leaf, 9_u8, true);
    seed_board(ref egs_world, game_id, player_2, leaf, 9_u8, true);
    seed_attack(ref native_world, game_id, player_1, x, y, 1_u64, false, false);
    seed_attack(ref egs_world, game_id, player_1, x, y, 1_u64, false, false);
    seed_pending_attack(ref native_world, game_id, player_1, x, y, true);
    seed_pending_attack(ref egs_world, game_id, player_1, x, y, true);
    seed_link(ref egs_world, token_id, game_id, player_2);

    testing::set_block_timestamp(99_u64);

    let player_2_account = IMockPlayerAccountDispatcher { contract_address: player_2 };
    player_2_account.reveal(native_actions, game_id, x, y, cell_nonce, true, [].span());
    player_2_account.reveal_egs(egs_actions, token_id, x, y, cell_nonce, true, [].span());

    let native_game: Game = native_world.read_model(game_id);
    let egs_game: Game = egs_world.read_model(game_id);
    let native_defender: BoardCommitment = native_world.read_model((game_id, player_2));
    let egs_defender: BoardCommitment = egs_world.read_model((game_id, player_2));
    let native_attack: Attack = native_world.read_model((game_id, player_1, Vec2 { x, y }));
    let egs_attack: Attack = egs_world.read_model((game_id, player_1, Vec2 { x, y }));

    assert_games_equal_without_stake_token(native_game, egs_game);
    assert_boards_equal(native_defender, egs_defender);
    assert_attacks_equal(native_attack, egs_attack);
    assert(native_erc20.balance_of(player_1) == 40_u128, 'native_payout');
    assert(egs_erc20.balance_of(player_1) == 40_u128, 'egs_payout');
    assert(native_erc20.balance_of(native_actions) == 0_u128, 'native_vault');
    assert(egs_erc20.balance_of(egs_actions) == 0_u128, 'egs_vault');
    assert(runtime.pre_calls() == 1_u32, 'reveal_pre');
    assert(runtime.post_calls() == 1_u32, 'reveal_post');
}

#[test]
fn claim_timeout_win_egs_matches_native_setup_timeout_path() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut native_world, native_actions, _native_runtime) = setup_actions_world();
    let (mut egs_world, egs_actions, egs_runtime_address) = setup_actions_world();
    let native_erc20_address = deploy(mock_erc20::TEST_CLASS_HASH, [].span());
    let egs_erc20_address = deploy(mock_erc20::TEST_CLASS_HASH, [].span());
    let token_id = 12;
    let game_id = 54_u32;
    let zero: ContractAddress = 0.try_into().unwrap();

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: egs_runtime_address };
    runtime.set_owner(token_id, player_1);

    let mut native_erc20 = IMockErc20Dispatcher { contract_address: native_erc20_address };
    let mut egs_erc20 = IMockErc20Dispatcher { contract_address: egs_erc20_address };
    native_erc20.mint(native_actions, 40_u128);
    egs_erc20.mint(egs_actions, 40_u128);

    seed_game(
        ref native_world,
        game_id,
        player_1,
        player_2,
        player_1,
        0_u8,
        zero,
        10_u64,
        0_u32,
        native_erc20_address,
        20_u128,
        true,
        true,
        false,
    );
    seed_game(
        ref egs_world,
        game_id,
        player_1,
        player_2,
        player_1,
        0_u8,
        zero,
        10_u64,
        0_u32,
        egs_erc20_address,
        20_u128,
        true,
        true,
        false,
    );
    seed_board(ref native_world, game_id, player_1, 999, 0_u8, true);
    seed_board(ref native_world, game_id, player_2, 0, 0_u8, false);
    seed_board(ref egs_world, game_id, player_1, 999, 0_u8, true);
    seed_board(ref egs_world, game_id, player_2, 0, 0_u8, false);
    seed_link(ref egs_world, token_id, game_id, player_1);

    testing::set_block_timestamp(10_u64 + MOVE_TIMEOUT_SECONDS + 1_u64);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.claim_timeout_win(native_actions, game_id);
    player_1_account.claim_timeout_win_egs(egs_actions, token_id);

    let native_game: Game = native_world.read_model(game_id);
    let egs_game: Game = egs_world.read_model(game_id);

    assert_games_equal_without_stake_token(native_game, egs_game);
    assert(native_erc20.balance_of(player_1) == 40_u128, 'native_setup_pay');
    assert(egs_erc20.balance_of(player_1) == 40_u128, 'egs_setup_pay');
    assert(native_erc20.balance_of(native_actions) == 0_u128, 'native_setup_vault');
    assert(egs_erc20.balance_of(egs_actions) == 0_u128, 'egs_setup_vault');
    assert(runtime.pre_calls() == 1_u32, 'timeout_pre');
    assert(runtime.post_calls() == 1_u32, 'timeout_post');
}

#[test]
#[should_panic]
fn commit_board_egs_rejects_wrong_linked_player() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut world, actions_address, runtime_address) = setup_actions_world();
    let token_id = 13;
    let game_id = 55_u32;
    let zero: ContractAddress = 0.try_into().unwrap();

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: runtime_address };
    runtime.set_owner(token_id, player_1);

    seed_game(
        ref world,
        game_id,
        player_1,
        player_2,
        player_1,
        0_u8,
        zero,
        0_u64,
        0_u32,
        zero,
        0_u128,
        false,
        false,
        true,
    );
    seed_link(ref world, token_id, game_id, player_2);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.commit_board_egs(actions_address, token_id, 777);
}

#[test]
#[should_panic]
fn commit_board_egs_rejects_missing_linked_game() {
    let player_1 = deploy_player_account();
    let (mut world, actions_address, runtime_address) = setup_actions_world();
    let token_id = 14;

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: runtime_address };
    runtime.set_owner(token_id, player_1);

    seed_link(ref world, token_id, 999_u32, player_1);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.commit_board_egs(actions_address, token_id, 888);
}

#[test]
#[should_panic]
fn commit_attack_egs_rejects_finished_game() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut world, actions_address, runtime_address) = setup_actions_world();
    let token_id = 15;
    let game_id = 56_u32;
    let zero: ContractAddress = 0.try_into().unwrap();

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: runtime_address };
    runtime.set_owner(token_id, player_1);

    seed_game(
        ref world,
        game_id,
        player_1,
        player_2,
        player_1,
        2_u8,
        player_1,
        0_u64,
        1_u32,
        zero,
        0_u128,
        false,
        false,
        true,
    );
    seed_link(ref world, token_id, game_id, player_1);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.commit_attack_egs(actions_address, token_id, 123);
}

#[test]
#[should_panic]
fn commit_board_egs_blocks_session_token_reentrancy() {
    let player_1 = deploy_player_account();
    let player_2 = deploy_player_account();
    let (mut world, actions_address, runtime_address) = setup_actions_world();
    let token_id = 16;
    let reentry_token_id = 17;
    let game_id = 57_u32;
    let reentry_game_id = 58_u32;
    let zero: ContractAddress = 0.try_into().unwrap();

    let mut runtime = IMockEgsRuntimeDispatcher { contract_address: runtime_address };
    runtime.set_owner(token_id, player_1);
    runtime.set_owner(reentry_token_id, runtime_address);
    runtime.arm_owner_reentry(actions_address, token_id, reentry_token_id, 555);

    seed_game(
        ref world,
        game_id,
        player_1,
        player_2,
        player_1,
        0_u8,
        zero,
        0_u64,
        0_u32,
        zero,
        0_u128,
        false,
        false,
        true,
    );
    seed_link(ref world, token_id, game_id, player_1);
    seed_game(
        ref world,
        reentry_game_id,
        runtime_address,
        player_2,
        runtime_address,
        0_u8,
        zero,
        0_u64,
        0_u32,
        zero,
        0_u128,
        false,
        false,
        true,
    );
    seed_link(ref world, reentry_token_id, reentry_game_id, runtime_address);

    let player_1_account = IMockPlayerAccountDispatcher { contract_address: player_1 };
    player_1_account.commit_board_egs(actions_address, token_id, 999);
}
