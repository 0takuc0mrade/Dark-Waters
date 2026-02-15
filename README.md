# Dark Waters

Dark Waters is an on-chain, turn-based naval strategy game built with Dojo and Starknet.
Two players commit hidden boards, fire at coordinates, and prove hits or misses with Merkle proofs.

The goal of this project is to make Battleship-style gameplay verifiable on-chain without revealing full board layouts up front.

## What Dark Waters Achieves

Dark Waters is designed to solve four core problems in competitive turn-based games:

1. Hidden information without trust:
Players should not reveal ship placements before the match, but the game must still verify every reveal.

2. Turn enforcement at contract level:
No client can cheat turn order because `attack` and `reveal` rules are enforced in the contract.

3. Verifiable combat outcomes:
Every hit or miss is proven against a committed board root.

4. Practical UX for on-chain play:
The frontend automates event syncing and reveal flow so players can play naturally.

## How Dark Waters Works

Dark Waters combines three layers:

1. Cairo/Dojo world state and systems (`src/`)
2. Starknet transaction execution and events
3. React/Next.js gameplay client (`dark-waters-layout/`)

### 1) Board Commitment (Setup Phase)

Each player places ships locally on a 10x10 grid.
The frontend builds a board array, generates a random salt, computes a Merkle root, and calls:

- `commit_board(game_id, merkle_root)`

Only the root is stored on-chain. Full board + salt remain local to that player.

### 2) Attack Registration (Playing Phase)

The current player calls:

- `attack(game_id, x, y)`

This records an `Attack` model row and emits `attack_made`.
The same player cannot attack the same coordinate twice in the same game.

### 3) Reveal + Proof Verification

The defender reveals whether that attacked coordinate was a ship:

- `reveal(game_id, x, y, salt, is_ship, proof)`

The contract verifies the Merkle proof against the defender's committed root.
If valid, it stores reveal result and emits `attack_revealed`.

### 4) Turn, Hit Counting, and Win State

From the contract logic in `src/systems/actions.cairo`:

- Game states: `0 = setup`, `1 = playing`, `2 = finished`
- Win condition: defender reaching `hits_taken >= 10`
- Turn handoff: after each reveal, turn swaps to defender (both hit and miss in current implementation)
- Timeout: if no action for >120 seconds, non-active-turn player can claim timeout win via `claim_timeout_win`

## Contract Models and Events

### Core models (`src/models.cairo`)

- `Game`: players, turn, phase, winner, last action timestamp, move count
- `BoardCommitment`: per-player root + hits taken + commit flag
- `Attack`: keyed by game, attacker, position, with reveal status
- `GameCounter`: incremental game ID source

### Core events (`src/systems/actions.cairo`)

- `game_spawned`
- `board_committed`
- `attack_made`
- `attack_revealed`
- `game_ended`

## Frontend Architecture

Main UI lives in `dark-waters-layout/`:

- `app/page.tsx`: lobby, routing between setup/combat states
- `hooks/useGameState.ts`: phase + turn sync from chain events
- `hooks/use-attack-listener.ts`: attack/reveal event polling and auto-reveal handling
- `hooks/use-combat.ts`: combat grid state, logs, turn lock behavior
- `components/placement/*`: ship placement and board commitment
- `components/combat/*`: combat dashboard, grids, fleet status, battle logs

Wallet/session behavior:

- `components/wallet-provider.tsx` uses Cartridge Controller policies for game actions
- Frontend stores board/salt in localStorage for reveal proofs

## How to Play (Explicit Walkthrough)

### Before the match

1. Connect wallet with Cartridge.
2. If you are a new Cartridge user, fund your Cartridge address first:
   - Copy your Cartridge address from the app.
   - Open your Ready Wallet or Braavos wallet.
   - Send Sepolia STRK to the copied Cartridge address.
   - Wait for confirmation, then return to the app.
3. Player 1 opens lobby and creates a game using Player 2 address.
4. Player 2 opens the same app and joins that game from "My Games".

### Setup phase

1. Each player places ships on their own 10x10 board.
2. Click confirm to commit board.
3. Wait until both players have committed.
4. Game automatically moves to Playing phase.

### Battle phase

1. The player whose turn it is selects a target coordinate on "Target Sector" (example: `D7`).
2. Attack tx is submitted on-chain.
3. Defender client reveals attacked coordinate with Merkle proof.
4. Both UIs sync from `attack_revealed`:
   - attacker target grid updates that coordinate as hit or miss
   - defender own fleet grid updates that coordinate as hit or miss
5. Turn switches and repeat.

### Battle log perspective

For the same reveal event:

- Attacker sees: `You fired at D7...`
- Defender sees: `Enemy fired at D7...`

### Win and timeout

- A player wins when opponent reaches 10 confirmed hits taken.
- If the active-turn player stalls for more than 120 seconds, the other player can claim timeout win.

## Gameplay Rules (Current Implementation)

1. Grid size is 10x10.
2. Standard ship placement UI is used (Carrier/Battleship/Cruiser/Submarine/Destroyer).
3. On-chain win threshold is currently 10 hits.
4. You cannot attack the same coordinate twice as the same attacker in a game.
5. Different players can attack the same coordinate independently.
6. Out-of-bounds attacks are rejected.
7. Only defender can reveal current pending attack.

## Running the Project

### Option A: Frontend (Sepolia default)

The frontend is currently configured for Starknet Sepolia in:

- `dark-waters-layout/src/config/sepolia-config.ts`

Run:

```bash
cd dark-waters-layout
npm install
npm run dev
```

Then open the local Next.js URL shown in terminal.

### Option B: Local Dojo stack with Docker

From repo root:

```bash
docker compose up
```

This starts:

- Katana
- Sozo build/migrate
- Torii indexer

### Option C: Manual local stack

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

## Deploying to Sepolia

Use helper script:

```bash
./deploy_sepolia.sh
```

It builds, migrates, and writes deployment metadata to `sepolia_config.json`.

## Configuration Notes

### Dojo profile/config files

- `dojo_dev.toml` for local dev
- `dojo_sepolia.toml` for Sepolia profile
- `torii_dev.toml` for indexer settings

### Frontend chain config

Update if your deployment changes:

- `WORLD_ADDRESS`
- `ACTIONS_ADDRESS`
- `RPC_URL`
- `DEPLOYED_BLOCK`

File:

- `dark-waters-layout/src/config/sepolia-config.ts`

## Developer Notes

1. Contract logic is authoritative; frontend is a projection of chain events.
2. Event pagination is required as history grows.
3. Board/salt local storage is required for reveal proofs; losing local state can break auto-reveal.
4. If you change event schemas in Cairo, update frontend event parsers accordingly.

## Repository Layout

```text
.
|- src/                         # Cairo models/systems/tests
|  |- models.cairo
|  |- systems/actions.cairo
|  `- tests/
|- dark-waters-layout/          # Next.js frontend
|  |- app/
|  |- components/
|  |- hooks/
|  `- src/config/sepolia-config.ts
|- compose.yaml                 # Local Katana + Sozo + Torii stack
|- dojo_dev.toml
|- dojo_sepolia.toml
`- deploy_sepolia.sh
```

## Architecture Diagram

### System Overview

```text
+----------------------+        +----------------------+        +----------------------+
|   Player 1 Client    |        |   Player 2 Client    |        |   Starknet + Dojo    |
| (Next.js + Wallet)   |        | (Next.js + Wallet)   |        |   World + Actions    |
+----------+-----------+        +----------+-----------+        +----------+-----------+
           |                               |                               |
           | spawn_game(opponent)          |                               |
           +------------------------------>|                               |
           |                               |   game_spawned                |
           |<--------------------------------------------------------------+
           |                               |                               |
           | commit_board(root_1)          |                               |
           +-------------------------------------------------------------->|
           |                               | commit_board(root_2)          |
           |                               +------------------------------>|
           |                               |                               |
           |          board_committed (x2) / state -> Playing             |
           |<--------------------------------------------------------------+
           |                               |                               |
           | attack(x,y)                   |                               |
           +-------------------------------------------------------------->|
           |                               |                               |
           |                        attack_made                            |
           |<--------------------------------------------------------------+
           |                               |                               |
           |                               | reveal(x,y,salt,is_ship,proof)|
           |                               +------------------------------>|
           |                               |                               |
           |                 attack_revealed + turn swap / win check       |
           |<--------------------------------------------------------------+
           |                               |                               |
```

### Gameplay Sequence (One Turn)

```text
1) Attacker submits attack(game_id, x, y)
2) Contract records Attack and emits attack_made
3) Defender builds Merkle proof from local board+salt
4) Defender submits reveal(...)
5) Contract verifies proof against defender commitment root
6) Contract emits attack_revealed(is_hit)
7) Frontends sync:
   - attacker target grid marks hit/miss
   - defender fleet grid marks hit/miss
8) Contract swaps turn to defender (current implementation for hit and miss)
9) If defender hits_taken >= 10, contract sets winner and state = Finished
```
## Live Link
https://dark-waters-m2fn.vercel.app/

## Summary

Dark Waters is a practical pattern for provable hidden-state PvP on Starknet:

- commit hidden board
- attack on-chain
- reveal with proof
- enforce turns and wins in contract
- sync UX from events

It demonstrates how to build a fair, verifiable strategy game where game integrity is guaranteed by the chain, not by client trust.
