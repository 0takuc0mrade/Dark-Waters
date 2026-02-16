use dark_waters::utils::{
    MOVE_TIMEOUT_SECONDS,
    compute_attack_commitment_hash,
    compute_board_leaf_hash,
    has_timed_out,
    is_in_bounds,
};

#[test]
fn attack_commitment_hash_is_deterministic() {
    let first = compute_attack_commitment_hash(4, 7, 0x123);
    let second = compute_attack_commitment_hash(4, 7, 0x123);
    assert(first == second, 'hash_det');
}

#[test]
fn attack_commitment_hash_changes_with_nonce() {
    let first = compute_attack_commitment_hash(4, 7, 0x123);
    let second = compute_attack_commitment_hash(4, 7, 0x124);
    assert(first != second, 'nonce_diff');
}

#[test]
fn leaf_hash_changes_when_ship_bit_changes() {
    let hit_leaf = compute_board_leaf_hash(1, 2, 0x999, true);
    let miss_leaf = compute_board_leaf_hash(1, 2, 0x999, false);
    assert(hit_leaf != miss_leaf, 'ship_bit');
}

#[test]
fn leaf_hash_changes_when_nonce_changes() {
    let first = compute_board_leaf_hash(1, 2, 0xabc, true);
    let second = compute_board_leaf_hash(1, 2, 0xabd, true);
    assert(first != second, 'leaf_nonce');
}

#[test]
fn board_bounds_check_is_correct() {
    assert(is_in_bounds(0, 0), 'in_00');
    assert(is_in_bounds(9, 9), 'in_99');
    assert(!is_in_bounds(10, 0), 'out_x');
    assert(!is_in_bounds(0, 10), 'out_y');
}

#[test]
fn timeout_boundary_requires_strictly_more_than_threshold() {
    let last_action = 1_000_u64;
    let boundary = last_action + MOVE_TIMEOUT_SECONDS;
    let after = boundary + 1_u64;

    assert(!has_timed_out(last_action, boundary), 'eq_no_to');
    assert(has_timed_out(last_action, after), 'after_to');
}
