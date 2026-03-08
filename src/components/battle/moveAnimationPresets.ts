import type { BattleAnimationStep } from "./battleAnimationTypes";
import type { BattleMove } from "./types";

export type MoveAnimationProfile =
  | "physical"
  | "special"
  | "projectile"
  | "healing"
  | "status"
  | "multiHit"
  | "drain"
  | "recoil"
  | "protect"
  | "charging";

const PHYSICAL_SEQUENCE: BattleAnimationStep[] = [
  { type: "cameraFocusAttacker", duration: 170 },
  { type: "attackerLunge", duration: 150 },
  { type: "targetHit", duration: 100 },
  { type: "cameraShake", duration: 90 },
  { type: "hpDrop", duration: 430 },
  { type: "resetCamera", duration: 170 },
];

const SPECIAL_SEQUENCE: BattleAnimationStep[] = [
  { type: "cameraFocusAttacker", duration: 160 },
  { type: "attackerCastPose", duration: 120 },
  { type: "spawnEffect", effect: "special-aura", duration: 120 },
  { type: "targetHit", duration: 100 },
  { type: "cameraShake", duration: 85 },
  { type: "hpDrop", duration: 430 },
  { type: "resetCamera", duration: 170 },
];

const PROJECTILE_SEQUENCE: BattleAnimationStep[] = [
  { type: "cameraFocusAttacker", duration: 160 },
  { type: "attackerCastPose", duration: 90 },
  { type: "spawnEffect", effect: "projectile-cast", duration: 90 },
  { type: "projectile", effect: "projectile", duration: 210 },
  { type: "targetHit", duration: 90 },
  { type: "cameraShake", duration: 80 },
  { type: "hpDrop", duration: 430 },
  { type: "resetCamera", duration: 170 },
];

const HEALING_SEQUENCE: BattleAnimationStep[] = [
  { type: "cameraFocusAttacker", duration: 150 },
  { type: "spawnEffect", effect: "healing-aura", duration: 260 },
  { type: "showText", text: "Recuperando energia...", duration: 320 },
  { type: "resetCamera", duration: 170 },
];

const STATUS_SEQUENCE: BattleAnimationStep[] = [
  { type: "cameraFocusTarget", duration: 160 },
  { type: "spawnEffect", effect: "status-aura", duration: 220 },
  { type: "statusPulse", status: "generic", duration: 210 },
  { type: "showText", text: "Condicao alterada!", duration: 300 },
  { type: "resetCamera", duration: 170 },
];

const MULTI_HIT_SEQUENCE: BattleAnimationStep[] = [
  { type: "cameraFocusAttacker", duration: 160 },
  { type: "attackerLunge", duration: 120 },
  { type: "targetHit", duration: 80 },
  { type: "targetRecoil", duration: 70 },
  { type: "targetHit", duration: 80 },
  { type: "cameraShake", duration: 80 },
  { type: "hpDrop", duration: 470 },
  { type: "resetCamera", duration: 170 },
];

const DRAIN_SEQUENCE: BattleAnimationStep[] = [
  { type: "cameraFocusAttacker", duration: 160 },
  { type: "attackerCastPose", duration: 90 },
  { type: "projectile", effect: "drain-orb", duration: 170 },
  { type: "targetHit", duration: 90 },
  { type: "hpDrop", duration: 360 },
  { type: "spawnEffect", effect: "healing-aura", duration: 170 },
  { type: "showText", text: "HP drenado!", duration: 260 },
  { type: "resetCamera", duration: 170 },
];

const RECOIL_SEQUENCE: BattleAnimationStep[] = [
  { type: "cameraFocusAttacker", duration: 160 },
  { type: "attackerLunge", duration: 130 },
  { type: "targetHit", duration: 90 },
  { type: "cameraShake", duration: 90 },
  { type: "hpDrop", duration: 320 },
  { type: "targetRecoil", duration: 110 },
  { type: "showText", text: "Recuo!", duration: 230 },
  { type: "resetCamera", duration: 170 },
];

const PROTECT_SEQUENCE: BattleAnimationStep[] = [
  { type: "cameraFocusAttacker", duration: 150 },
  { type: "flashOverlay", variant: "shield", duration: 190 },
  { type: "showText", text: "Protegido!", duration: 260 },
  { type: "resetCamera", duration: 160 },
];

const CHARGING_SEQUENCE: BattleAnimationStep[] = [
  { type: "cameraFocusAttacker", duration: 150 },
  { type: "attackerCastPose", duration: 120 },
  { type: "spawnEffect", effect: "charge-aura", duration: 220 },
  { type: "showText", text: "Carregando poder...", duration: 300 },
  { type: "resetCamera", duration: 160 },
];

const PROJECTILE_HINTS = ["beam", "ball", "shot", "pulse", "blast", "bolt", "cannon", "wave", "ray"];
const MULTI_HIT_HINTS = ["double", "multi", "fury", "barrage", "arm-thrust", "bullet-seed", "rock-blast"];
const PROTECT_HINTS = ["protect", "detect", "kings-shield", "spiky-shield", "baneful-bunker"];
const CHARGING_HINTS = ["solar-beam", "solar-blade", "sky-attack", "razor-wind", "freeze-shock"];

function norm(v: string) {
  return String(v || "").trim().toLowerCase();
}

function includesAny(id: string, list: string[]) {
  return list.some((hint) => id.includes(hint));
}

export function resolveMoveAnimationProfile(move: BattleMove): MoveAnimationProfile {
  const id = norm(move.id);
  if (move.healing && move.healing > 0) return "healing";
  if (move.drain && move.drain > 0) return "drain";
  if (move.category === "status" && includesAny(id, PROTECT_HINTS)) return "protect";
  if (includesAny(id, CHARGING_HINTS)) return "charging";
  if (includesAny(id, MULTI_HIT_HINTS)) return "multiHit";
  if (move.category === "status") return "status";
  if (includesAny(id, PROTECT_HINTS)) return "protect";
  if (move.category === "special" && includesAny(id, PROJECTILE_HINTS)) return "projectile";
  if (String(move.id || "").toLowerCase() === "struggle") return "recoil";
  if (move.category === "physical" && id.includes("take-down")) return "recoil";
  if (move.category === "special") return "special";
  return "physical";
}

export function buildMoveAnimationSequence(profile: MoveAnimationProfile): BattleAnimationStep[] {
  if (profile === "projectile") return [...PROJECTILE_SEQUENCE];
  if (profile === "healing") return [...HEALING_SEQUENCE];
  if (profile === "status") return [...STATUS_SEQUENCE];
  if (profile === "multiHit") return [...MULTI_HIT_SEQUENCE];
  if (profile === "drain") return [...DRAIN_SEQUENCE];
  if (profile === "recoil") return [...RECOIL_SEQUENCE];
  if (profile === "protect") return [...PROTECT_SEQUENCE];
  if (profile === "charging") return [...CHARGING_SEQUENCE];
  if (profile === "special") return [...SPECIAL_SEQUENCE];
  return [...PHYSICAL_SEQUENCE];
}
