# Dark Waters

Dark Waters is an on-chain, turn-based naval strategy game built with Dojo and Starknet.
Two players commit hidden boards, attack each other, and prove hit/miss outcomes against committed data.
Core design concept: **Fog of War**. Opponents cannot see each other's board state or attack intent until protocol-defined reveal steps.

I ran internal playtest sessions with other devs on Sepolia, collected their gameplay and reliability feedback, and used that feedback to drive this upgrade pass.

## Judge Snapshot

1. Fog of War by design: both board state and attack intent stay hidden until reveal.
2. Verifiable fairness: hit/miss outcomes are proven against committed board data.
3. Hardened secret handling: board secrets are encrypted at rest with recovery support.
4. Robust sync model: replay-safe event processing with checkpointed incremental indexing.
5. Practical player UX: onboarding checklist, wallet utilities, and combat sync diagnostics.

## Fog of War Model

1. Board Fog: each player commits only a root on-chain, not ship coordinates.
2. Attack Fog: attacker submits a hidden attack commitment before revealing `(x, y)`.
3. Resolution Fog: defender reveals only the attacked cell outcome (hit/miss), not full board layout.
4. Integrity: all reveals are checked against prior commitments, so hidden state is still trustless.

## Dev Playtest Feedback -> Fixes

During dev playtests, the biggest issues reported were:

1. Attack coordinates were visible too early.
2. Board secret handling in browser storage was too fragile.
3. Event sync could drift or duplicate state after refresh/reconnect.
4. Turn/state reconstruction got unstable as event history grew.
5. First-time users got blocked by wallet funding confusion.
6. Debugging desync and reveal failures was too slow.

I addressed those directly in this pass with the following implemented changes:

1. Attack intent privacy via commit-reveal (`commit_attack` -> `reveal_attack`)
2. Per-cell randomness via deterministic per-cell nonces (derived from one master secret)
3. Stronger local secret management (encrypted at rest + recovery package flow)
4. Event replay/confusion hardening (persistent dedupe + explicit matching with attacker identity)
5. Incremental event indexing/checkpointing (no full-history re-poll on every cycle)
6. Dev observability (structured logs + sync health telemetry in combat UI)
7. Wallet onboarding checklist in lobby (funding gate before spawn)
8. Test coverage for core protocol helpers (6 Cairo tests)
9. Threat model and privacy guarantees documented below

Still not implemented in this pass:

1. Full ZK hit/miss proof system (`P0.3`)
2. Framework extraction into multi-game package (`#10`)

## Current Protocol (On-Chain)

### Setup

1. Each player builds a local 10x10 board.
2. Each cell leaf is hashed as:
   - `hash(x, y, cell_nonce, is_ship)`
3. The player calls:
   - `commit_board(game_id, merkle_root)`

### Attack Intent Privacy

The attacking flow is now two-step:

1. `commit_attack(game_id, attack_hash)`
2. `reveal_attack(game_id, x, y, reveal_nonce)`

Where:

- `attack_hash = hash(x, y, reveal_nonce)`
- raw coordinates are hidden until `reveal_attack`

### Defender Reveal

Defender responds with:

- `reveal(game_id, x, y, cell_nonce, is_ship, proof)`

Contract verifies:

1. there is a pending attack for `(x, y)` and current attacker
2. Merkle proof against defender commitment root
3. updates attack record, hit count, turn state, and win state

## Contract Changes Walkthrough

### `src/models.cairo`

Added:

1. `AttackCommitment`
   - stores per-attacker attack commitment hash before coordinate reveal
2. `PendingAttack`
   - stores exactly one unresolved attack per game
   - enforces reveal-to-attack matching invariants

### `src/systems/actions.cairo`

Key upgrades:

1. New entrypoints:
   - `commit_attack`
   - `reveal_attack`
2. `reveal(...)` now uses `cell_nonce` semantics (per-cell nonce), not global board salt
3. Strict pending attack checks:
   - no second attack can be progressed before pending one is resolved
   - defender reveal must match pending `(attacker, x, y)`
4. `attack_revealed` event now includes `attacker`
   - frontend matching is deterministic even under repeated coordinates
5. `game_ended` now emitted for destruction wins and timeout wins
6. Timeout logic uses shared helper (`has_timed_out`)

### `src/utils.cairo` (new)

Shared protocol helper functions:

1. `compute_attack_commitment_hash`
2. `compute_board_leaf_hash`
3. `is_in_bounds`
4. `has_timed_out`

These are used by contract logic and unit-tested.

## Frontend Changes Walkthrough

### Transaction API

File: `dark-waters-layout/src/hooks/useGameActions.ts`

Added:

1. `commitAttack(gameId, attackHash)`
2. `revealAttack(gameId, x, y, revealNonce)`

Updated:

1. `reveal(...)` now passes `cellNonce`
2. structured dev logging for tx lifecycle and errors

### Wallet Policies

File: `dark-waters-layout/components/wallet-provider.tsx`

Policies now include:

1. `commit_attack`
2. `reveal_attack`

(`attack` policy removed from gameplay flow)

### Merkle + Nonce Model

File: `dark-waters-layout/src/utils/merkle.ts`

Changes:

1. added deterministic per-cell nonce derivation:
   - `deriveCellNonce(masterSecret, x, y)`
2. leaf generation switched to:
   - `hash(x, y, derived_cell_nonce, is_ship)`
3. added:
   - `computeAttackCommitmentHash(...)`
   - `getCellNonceHex(x, y)`
   - `randomFeltHex(...)`

### Secret Storage Hardening

File: `dark-waters-layout/src/utils/secret-storage.ts` (new)

Changes:

1. board + master secret are encrypted with `AES-GCM`
2. encrypted payload stored in localStorage
3. decryption key stored in sessionStorage
4. recovery package format implemented:
   - `{ gameId, address, secretKey, encryptedPayload }`
5. legacy plaintext migration added for old saved states

### Placement Flow

File: `dark-waters-layout/components/placement/ship-placement.tsx`

Changes:

1. generates master secret (instead of global board salt)
2. stores encrypted secrets before commit tx
3. copies recovery package to clipboard after successful commit

### Combat Flow

File: `dark-waters-layout/hooks/use-combat.ts`

Changes:

1. attack submission now:
   - computes attack commitment hash
   - sends `commit_attack`
   - sends `reveal_attack`
2. decrypted board secrets loaded from encrypted store
3. combat UI state persisted for reconnect/refresh continuity

### Event Sync, Replay Safety, Incremental Indexing

Files:

1. `dark-waters-layout/src/utils/event-checkpoint.ts` (new)
2. `dark-waters-layout/hooks/use-attack-listener.ts`
3. `dark-waters-layout/hooks/useGameState.ts`

Changes:

1. checkpointed polling from last processed block
2. persistent event-id dedupe
3. explicit attacker-aware reveal parsing
4. deterministic state rebuild from cached parsed history
5. no repeated full-history replay on each poll cycle

### Observability

Files:

1. `dark-waters-layout/src/utils/logger.ts` (new)
2. `dark-waters-layout/components/combat/combat-dashboard.tsx`

Changes:

1. structured logs with error codes in dev mode
2. combat sync health telemetry:
   - cursor block
   - processed event count
   - polling error count
3. secret-restore panel shown when encrypted secrets are locked

### Onboarding UX

File: `dark-waters-layout/app/page.tsx`

Changes:

1. first-time funding checklist card in host tab
2. spawn button gated until checklist is marked complete
3. explicit Sepolia STRK funding guidance in-app

File: `dark-waters-layout/components/wallet-status.tsx`

Changes:

1. copy address now actually copies
2. explorer link opens Voyager Sepolia for connected address

## Threat Model And Privacy Guarantees

### Private

1. Full board layout before and during game
2. Attack coordinate before `reveal_attack`
3. Board secret material at rest in browser storage (encrypted)

### Public

1. Game metadata (players, phase, turn, winner)
2. Commitment hashes and board roots
3. Revealed attack coordinates (after `reveal_attack`)
4. Revealed hit/miss outcomes
5. Timing/transaction metadata

### Attacker Assumptions

Assume attacker can:

1. read all on-chain data and events
2. inspect browser localStorage/sessionStorage if local machine compromised
3. observe tx timing/order

### Guarantees

1. Coordinate secrecy until reveal step
2. Hit/miss correctness tied to committed root + per-cell nonce
3. No plaintext board/master secret persisted in localStorage
4. Deterministic replay-safe event processing under reconnects

### Non-Guarantees (Current)

1. Full metadata privacy (timing/network still visible)
2. Zero-knowledge reveal minimization (Merkle proof still disclosed)

## Test Coverage

File: `src/tests/test_world.cairo`

Added 6 Cairo unit tests:

1. commitment hash determinism
2. commitment hash nonce sensitivity
3. leaf hash ship-bit sensitivity
4. leaf hash nonce sensitivity
5. bounds checks
6. strict timeout boundary behavior

Run:

```bash
scarb test
```

## Running The Project

### Frontend (Sepolia)

```bash
cd dark-waters-layout
npm install
npm run dev
```

### Local Dojo stack with Docker

```bash
docker compose up
```

### Manual local stack

Terminal 1:

```bash
katana --dev --dev.no-fee
```

Terminal 2:

```bash
sozo build
sozo migrate
torii --world <WORLD_ADDRESS> --http.cors_origins "*"
```

## Validation Notes From This Upgrade Pass

Internal dev playtest notes:

1. We replayed attack/reveal rounds across multiple sessions and confirmed turn handoff behavior after commit-reveal attacks.
2. We tested reconnect/refresh behavior to confirm event dedupe and deterministic state reconstruction.
3. We validated first-time onboarding flow with checklist gating for funded Cartridge accounts.

Commands executed:

1. `scarb build` (passes)
2. `scarb test` (passes: 6 tests)
3. `./node_modules/.bin/tsc --noEmit` in frontend (passes)

Known environment limitation in this workspace:

1. `npm run build` fails here because Next.js cannot fetch Google Fonts (`Inter`, `JetBrains Mono`) due restricted network access in build environment.

## Repository Layout

```text
.
|- src/
|  |- models.cairo
|  |- utils.cairo
|  |- systems/actions.cairo
|  `- tests/test_world.cairo
|- dark-waters-layout/
|  |- app/
|  |- components/
|  |- hooks/
|  `- src/
|     |- hooks/useGameActions.ts
|     `- utils/
|        |- merkle.ts
|        |- secret-storage.ts
|        |- event-checkpoint.ts
|        `- logger.ts
|- compose.yaml
|- dojo_dev.toml
|- dojo_sepolia.toml
`- deploy_sepolia.sh
```

## Live Link

https://dark-waters-m2fn.vercel.app/
