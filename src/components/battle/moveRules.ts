import type { BattleStatusCondition, BattleWeather } from "./types";

const WEATHER_BY_MOVE: Record<string, BattleWeather> = {
  "sunny-day": "sun",
  "rain-dance": "rain",
  sandstorm: "sandstorm",
  hail: "hail",
  snowscape: "snow",
};

const PROTECT_MOVES = new Set(["protect", "detect", "spiky-shield", "kings-shield", "baneful-bunker"]);

const TWO_TURN_MOVES = new Set([
  "solar-beam",
  "solar-blade",
  "fly",
  "dig",
  "dive",
  "bounce",
  "phantom-force",
  "shadow-force",
  "skull-bash",
  "sky-attack",
  "razor-wind",
  "geomancy",
]);

const MULTI_HIT_FIXED: Record<string, number> = {
  "double-kick": 2,
  twineedle: 2,
  "dual-chop": 2,
  "triple-kick": 3,
  "triple-axel": 3,
};

const MULTI_HIT_RANGE_2_5 = new Set([
  "arm-thrust",
  "barrage",
  "bone-rush",
  "bullet-seed",
  "comet-punch",
  "double-slap",
  "fury-attack",
  "fury-swipes",
  "icicle-spear",
  "pin-missile",
  "rock-blast",
  "spike-cannon",
  "tail-slap",
  "water-shuriken",
]);

function idNorm(moveId: string) {
  return String(moveId || "").trim().toLowerCase();
}

export function weatherFromMove(moveId: string): BattleWeather | null {
  const id = idNorm(moveId);
  return WEATHER_BY_MOVE[id] ?? null;
}

export function isProtectMove(moveId: string) {
  return PROTECT_MOVES.has(idNorm(moveId));
}

export function isTwoTurnMove(moveId: string) {
  return TWO_TURN_MOVES.has(idNorm(moveId));
}

export function canSkipCharge(moveId: string, weather: BattleWeather) {
  const id = idNorm(moveId);
  return (id === "solar-beam" || id === "solar-blade") && weather === "sun";
}

export function fallbackStatusFromMove(moveId: string): BattleStatusCondition | null {
  const id = idNorm(moveId);
  if (id === "will-o-wisp") return "burn";
  if (id === "toxic") return "bad-poison";
  if (id === "poison-powder" || id === "poison-gas") return "poison";
  if (id === "thunder-wave" || id === "stun-spore" || id === "glare") return "paralyze";
  if (id === "sleep-powder" || id === "spore" || id === "hypnosis" || id === "sing" || id === "lovely-kiss") return "sleep";
  return null;
}

export function multiHitCountForMove(moveId: string, randomBetween: (min: number, max: number) => number) {
  const id = idNorm(moveId);
  if (MULTI_HIT_FIXED[id]) return MULTI_HIT_FIXED[id];
  if (MULTI_HIT_RANGE_2_5.has(id)) return randomBetween(2, 5);
  return 1;
}
