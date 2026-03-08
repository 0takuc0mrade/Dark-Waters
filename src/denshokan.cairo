use starknet::ContractAddress;

pub const IMINIGAME_ID: felt252 =
    0x3d1730c22937da340212dec5546ff5826895259966fa6a92d1191ab068cc2b4;
pub const IMINIGAME_TOKEN_ID: felt252 =
    0x39b3cf4989f3d1493c059433fb1d41a763c166ef2f8f6bd801823f27414bdbc;
pub const IMINIGAME_REGISTRY_ID: felt252 =
    0x2ff8aa8dda405faf0eb17c5f806d7482b7352cf91fa9668e9ddf030f14b2ee9;
pub const SRC5_ID: felt252 =
    0x03f918d17e5ee77373b56385708f855659a07f75997f365cf87748628532a055;

#[derive(Drop, Serde, Copy, Clone)]
pub struct GameContext {
    pub name: felt252,
    pub value: felt252,
}

#[derive(Drop, Serde, Clone)]
pub struct GameContextDetails {
    pub name: ByteArray,
    pub description: ByteArray,
    pub id: Option<u32>,
    pub context: Span<GameContext>,
}

#[derive(Drop, Serde)]
pub struct MintGameParams {
    pub player_name: Option<felt252>,
    pub settings_id: Option<u32>,
    pub start: Option<u64>,
    pub end: Option<u64>,
    pub objective_id: Option<u32>,
    pub context: Option<GameContextDetails>,
    pub client_url: Option<ByteArray>,
    pub renderer_address: Option<ContractAddress>,
    pub skills_address: Option<ContractAddress>,
    pub to: ContractAddress,
    pub soulbound: bool,
    pub paymaster: bool,
    pub salt: u16,
    pub metadata: u16,
}

#[derive(Drop, Serde)]
pub struct MintParams {
    pub game_address: ContractAddress,
    pub player_name: Option<felt252>,
    pub settings_id: Option<u32>,
    pub start: Option<u64>,
    pub end: Option<u64>,
    pub objective_id: Option<u32>,
    pub context: Option<GameContextDetails>,
    pub client_url: Option<ByteArray>,
    pub renderer_address: Option<ContractAddress>,
    pub skills_address: Option<ContractAddress>,
    pub to: ContractAddress,
    pub soulbound: bool,
    pub paymaster: bool,
    pub salt: u16,
    pub metadata: u16,
}

#[starknet::interface]
pub trait IMinigame<TState> {
    fn token_address(self: @TState) -> ContractAddress;
    fn settings_address(self: @TState) -> ContractAddress;
    fn objectives_address(self: @TState) -> ContractAddress;
    fn mint_game(
        self: @TState,
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
    ) -> felt252;
    fn mint_game_batch(self: @TState, mints: Array<MintGameParams>) -> Array<felt252>;
}

#[starknet::interface]
pub trait IMinigameTokenData<TState> {
    fn score(self: @TState, token_id: felt252) -> u64;
    fn game_over(self: @TState, token_id: felt252) -> bool;
    fn score_batch(self: @TState, token_ids: Span<felt252>) -> Array<u64>;
    fn game_over_batch(self: @TState, token_ids: Span<felt252>) -> Array<bool>;
}

#[starknet::interface]
pub trait ISRC5<TState> {
    fn supports_interface(self: @TState, interface_id: felt252) -> bool;
}

#[starknet::interface]
pub trait IERC721<TState> {
    fn owner_of(self: @TState, token_id: u256) -> ContractAddress;
}

#[starknet::interface]
pub trait IMinigameToken<TState> {
    fn assert_is_playable(self: @TState, token_id: felt252);
    fn game_registry_address(self: @TState) -> ContractAddress;
    fn mint(
        ref self: TState,
        game_address: ContractAddress,
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
    ) -> felt252;
    fn mint_batch(ref self: TState, mints: Array<MintParams>) -> Array<felt252>;
    fn update_game(ref self: TState, token_id: felt252);
}

#[starknet::interface]
pub trait IMinigameRegistry<TState> {
    fn game_id_from_address(self: @TState, contract_address: ContractAddress) -> u64;
    fn is_game_registered(self: @TState, contract_address: ContractAddress) -> bool;
    fn register_game(
        ref self: TState,
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
    ) -> u64;
}
