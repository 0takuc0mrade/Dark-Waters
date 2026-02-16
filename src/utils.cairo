use core::poseidon::poseidon_hash_span;

pub const MOVE_TIMEOUT_SECONDS: u64 = 120;

pub fn compute_attack_commitment_hash(x: u8, y: u8, reveal_nonce: felt252) -> felt252 {
    let mut payload = ArrayTrait::new();
    payload.append(x.into());
    payload.append(y.into());
    payload.append(reveal_nonce);
    poseidon_hash_span(payload.span())
}

pub fn compute_board_leaf_hash(x: u8, y: u8, cell_nonce: felt252, is_ship: bool) -> felt252 {
    let mut leaf_data = ArrayTrait::new();
    leaf_data.append(x.into());
    leaf_data.append(y.into());
    leaf_data.append(cell_nonce);
    leaf_data.append(if is_ship { 1 } else { 0 });
    poseidon_hash_span(leaf_data.span())
}

pub fn is_in_bounds(x: u8, y: u8) -> bool {
    x < 10 && y < 10
}

pub fn has_timed_out(last_action: u64, current_ts: u64) -> bool {
    current_ts - last_action > MOVE_TIMEOUT_SECONDS
}
