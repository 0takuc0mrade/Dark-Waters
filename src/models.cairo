use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, Introspect, Debug)]
pub struct Vec2 {
    pub x: u8,
    pub y: u8,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct Game {
    #[key]
    pub game_id: u32,
    pub player_1: ContractAddress,
    pub player_2: ContractAddress,
    pub turn: ContractAddress,
    pub state: u8, //0 = setup, 1 = playing, 2 = finished
    pub winner: ContractAddress,

    //timestamp of the last action carried out in the game
    pub last_action: u64,

    //how many moves the game has
    pub moves_count: u32,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct GameCounter{
    #[key]
    pub id: u32,
    pub count: u32,
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct BoardCommitment{
    #[key]
    pub game_id: u32,
    #[key]
    pub player: ContractAddress,
    pub root: felt252, //merkle root of the board
    pub hits_taken: u8, //how many hits a player has taken
    pub is_committed: bool, //player has committed gameplay or not
}

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct Attack{
    #[key]
    pub game_id: u32,
    #[key]
    pub attacker: ContractAddress,
    #[key]
    pub position: Vec2,

    pub timestamp: u64,
    pub is_revealed: bool,
    pub is_hit: bool,
}