use starknet::ContractAddress;

pub const IMINIGAME_ID: felt252 =
    0x073b3287f401a3f004e179f5f6f4d52aa1f8854b51080f94a6f47895f43d33c0;
pub const SRC5_ID: felt252 =
    0x03f918d17e5ee77373b56385708f855659a07f75997f365cf87748628532a055;
pub const GAME_COLOR: felt252 = 0x0b1117;

#[starknet::interface]
pub trait IEgsSessionLinker<T> {
    fn link_session(ref self: T, token_id: felt252, game_id: u32);
}

#[starknet::interface]
pub trait IMinigameTokenData<T> {
    fn score(self: @T, token_id: felt252) -> u64;
    fn game_over(self: @T, token_id: felt252) -> bool;
    fn score_batch(self: @T, token_ids: Span<felt252>) -> Array<u64>;
    fn game_over_batch(self: @T, token_ids: Span<felt252>) -> Array<bool>;
}

#[starknet::interface]
pub trait ISRC5<T> {
    fn supports_interface(self: @T, interface_id: felt252) -> bool;
}

#[starknet::interface]
pub trait ISessionToken<T> {
    fn owner_of(self: @T, token_id: felt252) -> ContractAddress;
}

#[starknet::interface]
pub trait IMinigameRegistry<T> {
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
}

#[starknet::contract]
pub mod egs_adapter_contract {
    use super::{
        GAME_COLOR, IEgsSessionLinker, IMinigameRegistryDispatcher,
        IMinigameRegistryDispatcherTrait, IMinigameTokenData, IMINIGAME_ID, ISRC5,
        ISessionTokenDispatcher, ISessionTokenDispatcherTrait, SRC5_ID,
    };
    use dark_waters::models::{BoardCommitment, EgsSessionLink, Game};
    use dojo::model::ModelStorage;
    use dojo::world::{IWorldDispatcher, WorldStorage, WorldStorageTrait};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};

    #[storage]
    struct Storage {
        world_address: ContractAddress,
        registry: ContractAddress,
        session_token: ContractAddress,
        creator: ContractAddress,
        renderer: ContractAddress,
        skills: ContractAddress,
        royalty_fraction: u16,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        SessionLinked: SessionLinked,
        RegistrySynced: RegistrySynced,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SessionLinked {
        #[key]
        pub token_id: felt252,
        pub game_id: u32,
        pub player: ContractAddress,
        pub linked_at: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RegistrySynced {
        pub registry: ContractAddress,
        pub token: ContractAddress,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        world_address: ContractAddress,
        registry: ContractAddress,
        session_token: ContractAddress,
        creator: ContractAddress,
        renderer: ContractAddress,
        skills: ContractAddress,
        royalty_fraction: u16,
    ) {
        let zero = zero_address();

        assert!(world_address != zero, "invalid world");
        assert!(registry != zero, "invalid registry");
        assert!(session_token != zero, "invalid token");

        self.world_address.write(world_address);
        self.registry.write(registry);
        self.session_token.write(session_token);
        self.creator.write(creator);
        self.renderer.write(renderer);
        self.skills.write(skills);
        self.royalty_fraction.write(royalty_fraction);

        sync_registry(
            registry,
            session_token,
            creator,
            renderer,
            skills,
            royalty_fraction,
        );

        self.emit(
            Event::RegistrySynced(
                RegistrySynced { registry, token: session_token },
            ),
        );
    }

    #[abi(embed_v0)]
    impl SessionLinkerImpl of IEgsSessionLinker<ContractState> {
        fn link_session(ref self: ContractState, token_id: felt252, game_id: u32) {
            let caller = get_caller_address();
            let zero = zero_address();
            let token_dispatcher =
                ISessionTokenDispatcher { contract_address: self.session_token.read() };
            let owner = token_dispatcher.owner_of(token_id);
            assert!(owner == caller, "not token owner");

            let world = self.world_default();
            let game: Game = world.read_model(game_id);
            assert!(game.game_id == game_id, "game missing");
            assert!(
                game.player_1 == caller || game.player_2 == caller,
                "not game player",
            );
            assert!(caller != zero, "invalid caller");

            let existing: EgsSessionLink = world.read_model(token_id);
            if existing.is_linked {
                assert!(
                    existing.game_id == game_id && existing.player == caller,
                    "session already linked",
                );
                return;
            }

            let linked_at = get_block_timestamp();
            let link = EgsSessionLink {
                token_id,
                game_id,
                player: caller,
                linked_at,
                is_linked: true,
            };
            let mut world = world;
            world.write_model(@link);

            self.emit(
                Event::SessionLinked(
                    SessionLinked { token_id, game_id, player: caller, linked_at },
                ),
            );
        }
    }

    #[abi(embed_v0)]
    impl MinigameTokenDataImpl of IMinigameTokenData<ContractState> {
        fn score(self: @ContractState, token_id: felt252) -> u64 {
            let world = self.world_default();
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

            let winner_bonus = if game.winner == link.player { 10000_u64 } else { 0_u64 };
            let damage_bonus = u8_into_u64(opponent_commitment.hits_taken) * 100_u64;
            let speed_penalty = u32_into_u64(game.moves_count) * 10_u64;
            let speed_bonus = if speed_penalty >= 1000_u64 {
                0_u64
            } else {
                1000_u64 - speed_penalty
            };

            winner_bonus + damage_bonus + speed_bonus
        }

        fn game_over(self: @ContractState, token_id: felt252) -> bool {
            let world = self.world_default();
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

    #[abi(embed_v0)]
    impl SRC5Impl of ISRC5<ContractState> {
        fn supports_interface(self: @ContractState, interface_id: felt252) -> bool {
            interface_id == SRC5_ID || interface_id == IMINIGAME_ID
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> WorldStorage {
            WorldStorageTrait::new(
                IWorldDispatcher { contract_address: self.world_address.read() },
                @"dark_waters",
            )
        }
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

    fn sync_registry(
        registry: ContractAddress,
        session_token: ContractAddress,
        creator: ContractAddress,
        renderer: ContractAddress,
        skills: ContractAddress,
        royalty_fraction: u16,
    ) {
        let registry_dispatcher = IMinigameRegistryDispatcher { contract_address: registry };
        registry_dispatcher.register_game(
            IMINIGAME_ID,
            "Dark Waters",
            "Dark Waters v1 by Dark Waters",
            "https://dark-waters-m2fn.vercel.app/",
            "",
            GAME_COLOR,
            "Strategy",
            option_address(creator),
            option_address(renderer),
            session_token,
            option_address(skills),
            royalty_fraction,
        );
    }

    fn option_address(address: ContractAddress) -> Option<ContractAddress> {
        if address == zero_address() {
            Option::None
        } else {
            Option::Some(address)
        }
    }

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }

    fn u8_into_u64(value: u8) -> u64 {
        value.into()
    }

    fn u32_into_u64(value: u32) -> u64 {
        value.into()
    }
}
