# Dark Waters

Dark Waters is a turn-based, on-chain naval strategy game on Starknet (Dojo).
Players commit hidden fleets, fire with commit-reveal attacks, and resolve hits/misses with Merkle proofs.

Live app: https://dark-waters-m2fn.vercel.app/

## What Matters

- Fog of war: fleets stay hidden until protocol-valid reveals.
- Verifiable fairness: hit/miss is checked against committed board roots.
- Optional staking: STRK/WBTC matches with on-chain settlement.
- Recovery-safe UX: encrypted board secrets + restore flow.
- Replay-safe sync: checkpointed, deduped event indexing.
- Modern game UX: proof rail, profile progression, medals, post-match debrief, audio pack.

## Latest Update: Open Lobby Queue

- Host can now spawn a game without pre-selecting an opponent.
- Spawned matches appear in a shared `Spawned` log.
- Any other player can click `Engage` to join and activate that game.
- Supports both no-stake and staked open matches.

## Player Flow (How To Navigate)

### 1. Lobby

- Open app, connect wallet.
- On home screen, click `Start / Resume Match` to open `Operations`.
- In Operations:
  - `Host`: spawn an open match (optional stake token + amount).
  - `Spawned`: view open matches waiting for an opponent and click `Engage`.
  - `My Games`: resume an existing match.

### 2. Placement

- Place ships on your 10x10 board.
- Commit board root on-chain.
- Save/copy the recovery package after commit.

### 3. Combat

- Fire on target grid.
- Each shot follows protocol:
  - `commit_attack`
  - `reveal_attack`
  - defender Merkle-based `reveal`
- Track real-time state in:
  - `Proof Rail` (protocol step status)
  - `Combat Intel` (accuracy, streak, medals)
  - `Commander Profile` (XP/rank progression)

### 4. Debrief

- Match ends on fleet destruction, timeout resolution, or stake cancellation path.
- Open `View Debrief` for post-match summary:
  - XP gain + rank progress
  - medals earned
  - shot heatmap
  - replay timeline

## Protocol Summary

- Open lobby flow:
  - `spawn_open_game()`
  - `spawn_open_game_with_stake(stake_token, stake_amount)`
  - `engage_game(game_id)`
- Board commit: `commit_board(game_id, merkle_root)`
- Attack commit-reveal:
  - `commit_attack(game_id, attack_hash)`
  - `reveal_attack(game_id, x, y, reveal_nonce)`
- Defender proof reveal:
  - `reveal(game_id, x, y, cell_nonce, is_ship, proof)`

### Staked Matches (Optional)

- Create open staked game: `spawn_open_game_with_stake(stake_token, stake_amount)`
- Opponent locks stake: `lock_stake(game_id)`
- Settlement occurs on valid game end path.
- Setup timeout safeguards include `cancel_staked_game(game_id)` when eligible.
- Legacy direct-opponent systems remain available in contract: `spawn_game(opponent)` and `spawn_game_with_stake(opponent, ...)`.

## Quick Start

### 1) Frontend (Sepolia)

Set env vars in `dark-waters-layout/.env.local`:

```bash
NEXT_PUBLIC_SEPOLIA_TORII_URL=https://<your-torii-endpoint>
NEXT_PUBLIC_SEPOLIA_BOT_ADDRESS=0x<bot-account-address>
NEXT_PUBLIC_SEPOLIA_STRK_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_SEPOLIA_WBTC_TOKEN_ADDRESS=0x...
```

Run:

```bash
cd dark-waters-layout
npm install
npm run dev
```

### 1b) Bot Runner (Play vs Bot)

Use the backend bot worker to automate the bot account for direct `spawn_game(bot)` matches.

```bash
cd dark-waters-layout
BOT_TORII_URL=https://<your-torii-endpoint> \
npm run bot:run
```

Production flow (hands-off for players):

1. Bootstrap session one time (interactive):

```bash
cd dark-waters-layout
cp .env.bot.example .env.bot
set -a && source .env.bot && set +a
npm run bot:bootstrap
```

Open the printed Controller URL, approve policies, and let the process exit.

If you see `EACCES` on `/var/lib/...`, use a user-writable path for:
- `BOT_SESSION_BASE_PATH` (example: `${HOME}/.dark-waters-bot/session`)
- `BOT_STATE_PATH` (example: `${HOME}/.dark-waters-bot/bot-state.json`)

2. Start non-interactive daemon mode:

```bash
cd dark-waters-layout
set -a && source .env.bot && set +a
npm run bot:run:prod
```

3. Keep it always-on with PM2:

```bash
cd dark-waters-layout
set -a && source .env.bot && set +a
pm2 start ecosystem.bot.config.cjs --update-env
pm2 save
pm2 startup
```

4. Monitor liveness (only if `BOT_HEALTH_PORT` is set to a non-zero port):

```bash
curl -s http://127.0.0.1:<BOT_HEALTH_PORT>/health
```

Required/important envs:
- `BOT_TORII_URL`
- `BOT_ADDRESS` (recommended safety check; must match authorized Controller account)
- `BOT_ALLOW_INTERACTIVE_AUTH=false` in production daemon runs
- `BOT_SESSION_BASE_PATH` on persistent disk (do not use ephemeral paths in production)

Optional envs:
- `BOT_POLL_MS` (default `4000`)
- `BOT_BOARD_SEED` (for deterministic fleet generation)
- `BOT_RPC_URL`, `BOT_WORLD_ADDRESS`, `BOT_ACTIONS_ADDRESS`
- `BOT_SESSION_BASE_PATH` (or `CARTRIDGE_STORAGE_PATH`) for persisted session files
- `BOT_CHAIN_ID` (default `SN_SEPOLIA` chain id)
- `BOT_HEALTH_PORT` (default disabled `0`; set e.g. `8787` for monitoring)

### 2) Contract Tests

```bash
scarb test
```

### 3) Local Dojo Stack (Docker)

```bash
docker compose up
```

### 4) Local Dojo Stack (Manual)

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

## Config Notes

After on-chain migration, update:

- `dark-waters-layout/src/config/sepolia-config.ts`
  - `WORLD_ADDRESS`
  - `ACTIONS_ADDRESS`
  - `DEPLOYED_BLOCK`

Then restart frontend.

## Repo Layout

```text
.
|- src/                          # Dojo world + systems
|- dark-waters-layout/           # Next.js game client
|  |- app/
|  |- components/
|  |- hooks/
|  |- public/audio/
|  `- src/
|- compose.yaml
|- dojo_dev.toml
`- dojo_sepolia.toml
```

## Security/Privacy Notes

- Private before reveal: fleet layout, attack intent.
- Public on-chain: commitments, revealed attacks, outcomes, game metadata.
- Local secrets are encrypted at rest in browser storage and support recovery restore.
