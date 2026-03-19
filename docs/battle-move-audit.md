# Battle Move Audit

## Current State

- `moves.json` already provides a solid base layer for 937 moves:
  - `name`, `type`, `power`, `accuracy`, `pp`, `damageClass`, `priority`, `target`
  - `statusAilment`, `statusChance`
  - `statChanges`, `statChangeChance`
  - `flinchChance`, `critStage`
  - `drain`, `healing`
  - `flags`, `isContact`, `isProtectAffected`
- The raw dataset is useful, but it is not enough on its own for an official-like battle engine.
- A large part of the move behavior still lives in `effectText`, which is descriptive text, not engine-ready metadata.

## Main Problems Found

- `BattleMove` was too small and forced the engine to infer behavior from move ids.
- `TurnManager.ts` concentrated move logic with many hardcoded checks for:
  - weather
  - protect family
  - screens
  - hazards
  - charge moves
  - semi-invulnerability
  - multi-hit
- The current JSON does not express several mechanics in structured form:
  - fail conditions
  - volatile status durations
  - trap residual damage rules
  - move lock turns
  - force switch rules
  - reactive move triggers
  - dynamic power/type/category formulas
  - targeting metadata rich enough for double battles
  - protect variants and punish effects as normalized blocks
  - field and side persistence beyond a few cases

## Architecture Added

- `BattleMove` now supports:
  - `execution`
  - `effects`
- `moveEffectCatalog.ts` now normalizes move data into structured effects:
  - `damage`
  - `heal`
  - `drain`
  - `recoil`
  - `status`
  - `volatileStatus`
  - `statStages`
  - `weather`
  - `sideCondition`
  - `protect`
- `moveCatalog.ts` now builds `BattleMove` from both raw JSON and normalized effect metadata.
- `TurnManager.ts` now consumes structured move effects for:
  - weather setup
  - reflect / light screen
  - spikes / stealth rock
  - protect family
  - charge-turn flow
  - multi-hit
  - drain / recoil
  - direct status and stat stage effects
  - some volatile states (`trap`, `yawn`, `confusion`, `infatuation`)

## Gaps Still Open

- The engine still needs richer structured support for:
  - encore / disable / taunt / torment / heal block / embargo
  - substitute
  - perish song
  - leech seed
  - uproar
  - mirror / counter / coat style reactions
  - self switch and forced target switch
  - OHKO rules
  - fixed-damage formulas
  - dynamic-power formulas
  - copy / transform effects
  - terrain
  - trick room and room effects
  - full targeting modes for multi-battle formats
- Some behaviors still depend on compatibility helpers or text interpretation:
  - `fallbackStatusFromMove`
  - semi-invulnerable exception matching
  - a subset of multi-hit / charge move overrides

## Recommended Next Steps

1. Expand normalized move metadata with explicit `failConditions`, `dynamicRules`, `targeting`, and `persistentEffects`.
2. Move remaining hardcoded move-family logic out of `TurnManager.ts` into declarative move metadata.
3. Add a dedicated volatile-status engine with counters and hooks for start-of-turn, on-hit, and end-of-turn phases.
4. Add validation scripts for `moves.json` to catch incomplete or conflicting move data before runtime.
