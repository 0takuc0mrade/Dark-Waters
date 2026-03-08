# Dark Waters Phase B Implementation Plan

## Overview
Phase B adds tokenized gameplay wrappers so EGS-linked session tokens can drive live matches without changing the canonical Dojo game rules. The implementation should preserve the existing `Actions` behavior, add `_egs` entrypoints for the five gameplay actions, and gate those calls with token ownership plus EGS `pre_action` / `post_action` hooks.

## Goals
- Add `_egs` wrappers for the five gameplay actions used after a session is linked.
- Keep Dojo gameplay logic as the single source of truth.
- Preserve all existing non-EGS entrypoints for backward compatibility.

## Non-Goals
- Tokenized game spawning, engaging, or stake-locking flows.
- Callback automation, tournaments, quests, or leaderboard sync.
- Changes to the Phase A score formula, registry metadata, or discovery surface.

## Assumptions and Constraints
- `EgsSessionLink` remains the canonical `token_id -> game_id + player` mapping.
- Stakes are escrowed and settled from the `Actions` contract context today, so wrappers cannot rely on a separate adapter contract to execute endgame settlement safely.
- `get_caller_address()` checks are part of the current gameplay rules and must keep working for both native and EGS paths.
- `token_id` remains `felt252`.
- Phase A adapter stays in place for discovery, score, and `game_over`.

## Requirements

### Functional
- Add `commit_board_egs(token_id, merkle_root)`.
- Add `commit_attack_egs(token_id, attack_hash)`.
- Add `reveal_attack_egs(token_id, x, y, reveal_nonce)`.
- Add `reveal_egs(token_id, x, y, cell_nonce, is_ship, proof)`.
- Add `claim_timeout_win_egs(token_id)`.
- Each wrapper must:
- resolve the current `EgsSessionLink`
- verify the caller currently owns `token_id`
- verify the caller matches the linked player
- invoke `pre_action`
- run the same gameplay mutation path as the native action
- invoke `post_action`
- revert atomically if any check or hook fails
- Existing non-EGS entrypoints must continue to behave exactly as they do today.

### Non-Functional
- No gameplay divergence between native and `_egs` paths.
- No duplicate state machine implementation for combat, timeout, or stake settlement.
- Wrapper failures must be explicit and deterministic for stale links, stale token ownership, and missing hooks/config.

## Technical Design

### Data Model
- Add a singleton Dojo model such as `EgsConfig` keyed by `id = 1`.
- Store the EGS/session token contract address and any required hook target address in `EgsConfig`.
- Reuse `EgsSessionLink` for token-to-session resolution. Do not add a second linking model.

### API Design
- Extend `IActions` with the five `_egs` entrypoints.
- Keep the current native methods untouched at the ABI level.
- Add minimal internal helper types or constants for action selectors so hooks can identify the attempted action.

### Architecture
- Do not put Phase B gameplay wrappers only in the Phase A adapter contract.
- Reason:
- the current gameplay logic depends on `get_caller_address()`
- stake settlement executes from the `Actions` contract balance
- an external adapter call would shift caller context and break payout semantics
- Refactor the bodies of:
- `commit_board`
- `commit_attack`
- `reveal_attack`
- `reveal`
- `claim_timeout_win`
- into shared internal helpers that accept the resolved player context.
- Native entrypoints call those helpers with `caller = get_caller_address()`.
- `_egs` entrypoints call a shared `resolve_egs_context(token_id)` helper, then run `pre_action`, then the same internal gameplay helper, then `post_action`.
- Keep the Phase A adapter as the read/discovery surface. Phase B should only add gameplay routing, not replace score/discovery.

### UX Flow (if applicable)
- Existing clients can keep using native action entrypoints.
- EGS-aware clients switch only the five gameplay calls to `_egs` entrypoints after a successful `link_session`.
- If token ownership changes after linking, `_egs` calls fail until the owner relinks or governance defines a transfer policy.

---

## Implementation Plan

### Serial Dependencies (Must Complete First)

These tasks create foundations that other work depends on. Complete in order.

#### Phase 0: Shared Gameplay Foundation
**Prerequisite for:** All subsequent phases

| Task | Description | Output |
|------|-------------|--------|
| 0.1 | Add `EgsConfig` model and seed it in migration/test setup. | A world-readable config source for wrappers. |
| 0.2 | Add vendored EGS hook interfaces needed for `pre_action` and `post_action`. | Stable Cairo interfaces usable from `Actions`. |
| 0.3 | Extract the five gameplay bodies into shared internal helpers without changing native behavior. | One canonical gameplay path reused by native and `_egs` entrypoints. |
| 0.4 | Add `resolve_egs_context(token_id)` and ownership/link validation helpers. | A single gate for stale links and ownership mismatches. |

---

### Parallel Workstreams

These workstreams can be executed independently after Phase 0.

#### Workstream A: Wrapper Entry Points
**Dependencies:** Phase 0
**Can parallelize with:** Workstreams B, C

| Task | Description | Output |
|------|-------------|--------|
| A.1 | Extend `IActions` with the five `_egs` entrypoints. | Public ABI for tokenized gameplay. |
| A.2 | Implement `commit_board_egs` and `commit_attack_egs` using the shared helpers and hooks. | Setup and attack-commit wrappers. |
| A.3 | Implement `reveal_attack_egs`, `reveal_egs`, and `claim_timeout_win_egs`. | Reveal and timeout wrappers. |
| A.4 | Standardize hook payload/action IDs so all wrappers report actions consistently. | Deterministic `pre_action` / `post_action` behavior. |

#### Workstream B: Test Coverage
**Dependencies:** Phase 0
**Can parallelize with:** Workstreams A, C

| Task | Description | Output |
|------|-------------|--------|
| B.1 | Add mocks for token ownership and hook behavior in the Cairo test suite. | Deterministic EGS wrapper tests. |
| B.2 | Verify happy-path parity between native and `_egs` actions for all five wrappers. | Regression coverage for canonical gameplay behavior. |
| B.3 | Add failure-path tests for unlinked token, stale ownership, wrong player, hook revert, and completed game. | Safety coverage for wrapper gates. |
| B.4 | Add stake-settlement tests for endgame and timeout wins through `_egs` wrappers. | Confidence that escrow still settles from `Actions`. |

#### Workstream C: Migration and Integration Wiring
**Dependencies:** Phase 0
**Can parallelize with:** Workstreams A, B

| Task | Description | Output |
|------|-------------|--------|
| C.1 | Update world migration or setup tooling to seed `EgsConfig`. | Deployable Phase B world configuration. |
| C.2 | Document client switching rules: native calls remain valid, `_egs` is used only for linked sessions. | Clear integration contract for frontend/platform code. |
| C.3 | Add runtime sanity checks that the wrapper config matches the deployed Phase A adapter/session token setup. | Reduced config drift risk. |

---

### Merge Phase

After parallel workstreams complete, these tasks integrate the work.

#### Phase N: Integration
**Dependencies:** Workstreams A, B, C

| Task | Description | Output |
|------|-------------|--------|
| N.1 | Run the full Cairo suite and compare native vs `_egs` behavior on the same seeded game states. | Verified parity across both call paths. |
| N.2 | Perform a migration dry run with seeded `EgsConfig` and a linked token. | Confidence that deployment wiring is correct. |
| N.3 | Remove any temporary debug surfaces added during implementation. | Clean final ABI. |

---

## Testing and Validation

- Keep existing world and Phase A adapter tests green.
- Add `_egs` wrapper tests for all five gameplay entrypoints.
- Add parity assertions that native and `_egs` paths emit the same game outcomes and mutations.
- Add stale ownership coverage by changing token ownership after `link_session`.
- Add endgame payout and timeout payout coverage through `_egs` wrappers.

## Rollout and Migration

- Deploy the updated `Actions` system and seed `EgsConfig` during migration.
- Keep the Phase A adapter deployed as the discovery/read surface.
- Update clients to use `_egs` only after `link_session` succeeds.
- Rollback is straightforward because native entrypoints remain available; client traffic can return to native calls if wrapper integration is paused.

## Verification Checklist

- `scarb test`
- Confirm native tests remain green.
- Confirm `_egs` tests cover happy paths and failure paths.
- Confirm stake settlement still occurs from the `Actions` contract path.
- Confirm `EgsConfig` matches the deployed token/hook addresses.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Putting wrappers in the Phase A adapter breaks caller-sensitive rules and payout context. | High | High | Keep gameplay wrappers in `Actions`, not only in the adapter. |
| Token ownership changes after linking and causes stale session control. | High | High | Re-check `owner_of(token_id)` on every `_egs` action. |
| Hook ABI drift or misconfiguration causes wrapper-wide reverts. | Medium | High | Vendor minimal interfaces, gate via `EgsConfig`, and test revert behavior explicitly. |
| Shared-helper refactor accidentally changes native action behavior. | Medium | High | Add native-vs-wrapper parity tests and keep public native ABI untouched. |
| Config drift between Phase A adapter and Phase B wrappers causes inconsistent behavior. | Medium | Medium | Add migration sanity checks and one source-of-truth config seeding. |

## Open Questions

- [ ] What exact `pre_action` / `post_action` ABI and payload shape do we want to freeze for Dark Waters Phase B?
- [ ] Should a transferred token require explicit relinking, or should ownership transfer auto-authorize the new owner if `game_id` is unchanged?
- [ ] Do we want `_egs` variants for `lock_stake` or `cancel_staked_game` later, or are those intentionally native-only?

## Decision Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Keep Phase B gameplay wrappers in `Actions` context. | Caller checks and stake settlement already depend on that contract context. | Executing gameplay wrappers entirely in the Phase A adapter. |
| Refactor shared gameplay helpers instead of duplicating logic. | Preserves one canonical rule path for native and `_egs` calls. | Re-implementing combat/timeout logic in a second contract. |
| Limit Phase B to five post-link gameplay actions. | Matches the migration scope and avoids reopening spawn/setup flows. | Tokenizing all setup, spawn, and stake management actions immediately. |
