import type { BattleMoveEffect, BattleMoveExecution, BattleWeather } from "./types";

type MoveEffectOverride = {
  execution?: BattleMoveExecution;
  effects?: BattleMoveEffect[];
};

const WEATHER_BY_MOVE: Record<string, BattleWeather> = {
  "sunny-day": "sun",
  "rain-dance": "rain",
  sandstorm: "sandstorm",
  hail: "hail",
  snowscape: "snow",
};

const PROTECT_MOVES = new Set(["protect", "detect", "spiky-shield", "kings-shield", "baneful-bunker"]);

const MOVE_OVERRIDES: Record<string, MoveEffectOverride> = {
  fly: { execution: { chargeTurns: 2, hitTurn: 2, semiInvulnerablePhase: "airborne" } },
  bounce: { execution: { chargeTurns: 2, hitTurn: 2, semiInvulnerablePhase: "airborne" } },
  dig: { execution: { chargeTurns: 2, hitTurn: 2, semiInvulnerablePhase: "underground" } },
  dive: { execution: { chargeTurns: 2, hitTurn: 2, semiInvulnerablePhase: "underwater" } },
  "phantom-force": { execution: { chargeTurns: 2, hitTurn: 2, semiInvulnerablePhase: "vanished" } },
  "shadow-force": { execution: { chargeTurns: 2, hitTurn: 2, semiInvulnerablePhase: "vanished" } },
  "solar-beam": { execution: { chargeTurns: 2, hitTurn: 2, skipChargeInWeather: ["sun"] } },
  "solar-blade": { execution: { chargeTurns: 2, hitTurn: 2, skipChargeInWeather: ["sun"] } },
  "skull-bash": { execution: { chargeTurns: 2, hitTurn: 2 } },
  "sky-attack": { execution: { chargeTurns: 2, hitTurn: 2 } },
  "razor-wind": { execution: { chargeTurns: 2, hitTurn: 2 } },
  geomancy: { execution: { chargeTurns: 2, hitTurn: 2 } },
  "double-kick": { execution: { multiHit: { minHits: 2, maxHits: 2 } } },
  twineedle: { execution: { multiHit: { minHits: 2, maxHits: 2 } } },
  "dual-chop": { execution: { multiHit: { minHits: 2, maxHits: 2 } } },
  "triple-kick": { execution: { multiHit: { minHits: 3, maxHits: 3 } } },
  "triple-axel": { execution: { multiHit: { minHits: 3, maxHits: 3 } } },
  "arm-thrust": { execution: { multiHit: { minHits: 2, maxHits: 5 } } },
  barrage: { execution: { multiHit: { minHits: 2, maxHits: 5 } } },
  "bone-rush": { execution: { multiHit: { minHits: 2, maxHits: 5 } } },
  "bullet-seed": { execution: { multiHit: { minHits: 2, maxHits: 5 } } },
  "comet-punch": { execution: { multiHit: { minHits: 2, maxHits: 5 } } },
  "double-slap": { execution: { multiHit: { minHits: 2, maxHits: 5 } } },
  "fury-attack": { execution: { multiHit: { minHits: 2, maxHits: 5 } } },
  "fury-swipes": { execution: { multiHit: { minHits: 2, maxHits: 5 } } },
  "icicle-spear": { execution: { multiHit: { minHits: 2, maxHits: 5 } } },
  "pin-missile": { execution: { multiHit: { minHits: 2, maxHits: 5 } } },
  "rock-blast": { execution: { multiHit: { minHits: 2, maxHits: 5 } } },
  "spike-cannon": { execution: { multiHit: { minHits: 2, maxHits: 5 } } },
  "tail-slap": { execution: { multiHit: { minHits: 2, maxHits: 5 } } },
  "water-shuriken": { execution: { multiHit: { minHits: 2, maxHits: 5 } } },
};

function idNorm(moveId: string) {
  return String(moveId || "").trim().toLowerCase();
}

export function buildMoveExecution(moveId: string): BattleMoveExecution | undefined {
  const id = idNorm(moveId);
  const weather = WEATHER_BY_MOVE[id];
  const override = MOVE_OVERRIDES[id]?.execution;
  if (!override && !weather) return undefined;
  return { ...override };
}

export function buildMoveEffects(args: {
  moveId: string;
  power: number;
  damageClass: string;
  target?: string | null;
  drain?: number | null;
  healing?: number | null;
  statusAilment?: string | null;
  statusChance?: number | null;
  statChanges?: { stat: string; stages: number }[];
  statChangeChance?: number | null;
}): BattleMoveEffect[] {
  const id = idNorm(args.moveId);
  const effects: BattleMoveEffect[] = [];
  const damageClass = String(args.damageClass || "physical").toLowerCase();
  const target = String(args.target || "selected-pokemon").toLowerCase();
  const statChanges = Array.isArray(args.statChanges) ? args.statChanges.filter((s) => s?.stat && s?.stages) : [];
  const statusChance = Number.isFinite(Number(args.statusChance)) ? Number(args.statusChance) : 0;
  const statChance = Number.isFinite(Number(args.statChangeChance)) ? Number(args.statChangeChance) : 0;
  const drain = Number.isFinite(Number(args.drain)) ? Number(args.drain) : 0;
  const healing = Number.isFinite(Number(args.healing)) ? Number(args.healing) : 0;
  const ailment = String(args.statusAilment || "").trim().toLowerCase();

  if (damageClass !== "status" && Number(args.power || 0) > 0) {
    effects.push({ kind: "damage", target: "target" });
  }

  if (healing > 0) {
    effects.push({ kind: "heal", target: "user", percent: healing, phase: "onUse" });
  }

  if (drain > 0) {
    effects.push({ kind: "drain", target: "user", percent: drain, phase: "afterDamage" });
  } else if (drain < 0) {
    effects.push({ kind: "recoil", target: "user", percent: Math.abs(drain), basedOn: "damageDealt", phase: "afterDamage" });
  }

  const selfTarget = target === "user";
  if (ailment) {
    const effectTarget = selfTarget ? "user" : "target";
    const chance = Math.max(0, Math.min(100, statusChance || (damageClass === "status" ? 100 : 0)));
    if (["burn", "poison", "bad-poison", "paralysis", "sleep", "freeze"].includes(ailment)) {
      effects.push({ kind: "status", target: effectTarget, status: ailment, chance, phase: damageClass === "status" ? "onUse" : "onHit" });
    } else {
      effects.push({
        kind: "volatileStatus",
        target: effectTarget,
        status: ailment,
        chance: Math.max(0, Math.min(100, chance || 100)),
        phase: damageClass === "status" ? "onUse" : "onHit",
      });
    }
  }

  if (statChanges.length > 0) {
    effects.push({
      kind: "statStages",
      target: selfTarget ? "user" : "target",
      chance: Math.max(0, Math.min(100, statChance || (damageClass === "status" ? 100 : 0))),
      phase: damageClass === "status" ? "onUse" : "onHit",
      changes: statChanges,
    });
  }

  const weather = WEATHER_BY_MOVE[id];
  if (weather) {
    effects.push({ kind: "weather", target: "field", phase: "onUse", weather, turns: 5 });
  }

  if (id === "reflect") {
    effects.push({ kind: "sideCondition", target: "user-side", phase: "onUse", condition: "reflect", turns: 5 });
  }
  if (id === "light-screen") {
    effects.push({ kind: "sideCondition", target: "user-side", phase: "onUse", condition: "light-screen", turns: 5 });
  }
  if (id === "spikes") {
    effects.push({ kind: "sideCondition", target: "target-side", phase: "onUse", condition: "spikes", layers: 1, maxLayers: 3 });
  }
  if (id === "stealth-rock") {
    effects.push({ kind: "sideCondition", target: "target-side", phase: "onUse", condition: "stealth-rock" });
  }
  if (PROTECT_MOVES.has(id)) {
    effects.push({
      kind: "protect",
      target: "user",
      phase: "onUse",
      protectType: id as "protect" | "detect" | "spiky-shield" | "kings-shield" | "baneful-bunker",
      blocksDamage: true,
      blocksStatus: true,
      successDecay: true,
    });
  }

  const overrideEffects = MOVE_OVERRIDES[id]?.effects;
  if (overrideEffects?.length) effects.push(...overrideEffects);

  return effects;
}
