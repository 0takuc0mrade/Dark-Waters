# Dark Waters Phase 2 Roadmap

Dark Waters already ships its core privacy and gameplay integrity loop:

1. Attack commit-reveal (`commit_attack` -> `reveal_attack`)
2. Per-cell commitment randomness
3. Encrypted local secret storage and recovery path
4. Deterministic event sync with replay protection
5. Stronger onboarding and observability

This roadmap captures the **next-stage expansion opportunities** beyond the current hackathon build.

## Priority Legend

- `P0`: Frontier privacy upgrade
- `P1`: Productization and platform leverage

## P0: Frontier Privacy Upgrade

### 1) Zero-Knowledge Hit/Miss Verification (`P0.3`)

- Opportunity:
  - Move from Merkle-verified reveal to a ZK-backed reveal path with tighter disclosure.
- Why it matters:
  - Pushes Dark Waters from strong commitment privacy to a more advanced privacy profile.
- Target outcome:
  - On-chain verification accepts compact proof of hit/miss correctness without exposing full witness structure.

## P1: Productization & Reuse

### 2) Hidden-State Game Framework Packaging (`#10`)

- Opportunity:
  - Extract the existing primitives (commitments, attack flow, reveal validation, sync) into reusable modules.
- Why it matters:
  - Turns Dark Waters into a reusable pattern for additional hidden-state strategy games.
- Target outcome:
  - At least one additional mini-game reuses these primitives with minimal net-new contract logic.

### 3) Bot Deployment on Always-On VM (`#11`)

- Opportunity:
  - Deploy the Dark Waters bot (`bot-runner.mjs`) to a cloud VM so it runs 24/7 independently of the developer's laptop.
- Why it matters:
  - The bot currently runs via PM2 on a local machine and stops when the machine sleeps/shuts down. An always-on host ensures the bot is available for matchmaking at all times.
- Current status:
  - Bot code, PM2 config, and Cartridge Controller session are ready.
  - Dockerfile.bot created for containerized deployment.
  - Deployment guides written for Oracle Cloud (free tier, requires Visa/MC) and Koyeb.
- Remaining work:
  - Obtain a virtual Visa/Mastercard for cloud provider verification.
  - Provision VM and deploy using existing guide.
  - Enable PM2 startup on reboot / configure container auto-restart.
  - Set up uptime monitoring on the bot health endpoint.

## Delivery Outlook

### Phase 2A

1. ZK architecture doc + verifier integration plan
2. Minimal ZK MVP proving one reveal path end-to-end
3. Bot deployed on always-on VM with health monitoring

### Phase 2B

1. Framework modularization of protocol + sync layers
2. One follow-on mini-game built on shared hidden-state stack

