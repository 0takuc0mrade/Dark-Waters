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

## Delivery Outlook

### Phase 2A

1. ZK architecture doc + verifier integration plan
2. Minimal ZK MVP proving one reveal path end-to-end

### Phase 2B

1. Framework modularization of protocol + sync layers
2. One follow-on mini-game built on shared hidden-state stack
