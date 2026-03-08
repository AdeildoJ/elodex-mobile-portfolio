import type { BattleMonster, BattleMove, BattleWeather } from "./types";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function critMultiplier(stage: number) {
  const s = Number.isFinite(stage) ? stage : 0;
  const chance = s >= 3 ? 1 : s === 2 ? 0.5 : s === 1 ? 0.125 : 1 / 24;
  return Math.random() < chance ? 1.5 : 1;
}

export function computeDamage(args: {
  attacker: BattleMonster;
  defender: BattleMonster;
  move: BattleMove;
  typeMultiplier: number;
  weather?: BattleWeather;
  accuracyModifier?: number;
}) {
  const { attacker, defender, move, typeMultiplier, weather = "none", accuracyModifier = 1 } = args;
  const moveId = String(move.id || "").trim().toLowerCase();

  const modifiedAccuracy =
    moveId === "thunder" || moveId === "hurricane"
      ? weather === "rain"
        ? 100
        : weather === "sun"
        ? 50
        : move.accuracy
      : moveId === "blizzard"
      ? weather === "hail" || weather === "snow"
        ? 100
        : move.accuracy
      : move.accuracy;

  if (Math.random() * 100 > clamp(modifiedAccuracy * Math.max(0.1, accuracyModifier), 1, 100)) {
    return { missed: true, damage: 0, critical: false, effectiveness: typeMultiplier };
  }

  if (move.category === "status" || move.power <= 0) {
    return { missed: false, damage: 0, critical: false, effectiveness: typeMultiplier };
  }

  const atk = move.category === "special" ? attacker.stats.spa : attacker.stats.atk;
  const def = move.category === "special" ? defender.stats.spd : defender.stats.def;
  const base =
    Math.floor((((2 * attacker.level) / 5 + 2) * move.power * Math.max(1, atk)) / Math.max(1, def) / 50) + 2;
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;
  const critical = critMultiplier(move.critStage ?? 0) > 1;
  const crit = critical ? 1.5 : 1;
  const weatherMult =
    weather === "sun"
      ? move.type === "fire"
        ? 1.5
        : move.type === "water"
        ? 0.5
        : 1
      : weather === "rain"
      ? move.type === "water"
        ? 1.5
        : move.type === "fire"
        ? 0.5
        : 1
      : 1;
  const solarPenalty =
    moveId === "solar-beam" || moveId === "solar-blade"
      ? weather === "rain" || weather === "sandstorm" || weather === "hail" || weather === "snow"
        ? 0.5
        : 1
      : 1;
  const rand = 0.85 + Math.random() * 0.15;
  const damage = Math.max(
    typeMultiplier > 0 ? 1 : 0,
    Math.floor(base * stab * typeMultiplier * crit * weatherMult * solarPenalty * rand)
  );

  return {
    missed: false,
    damage,
    critical,
    effectiveness: typeMultiplier,
  };
}
