export const FRIENDSHIP_MIN = 0;
export const FRIENDSHIP_MAX = 255;
export const FRIENDSHIP_DEFAULT = 70;
export const FRIENDSHIP_EVOLUTION_THRESHOLD = 220;

export type FriendshipEvent =
  | "capture"
  | "hatch"
  | "levelUp"
  | "battleWin"
  | "faint"
  | "release"
  | "care";

const DELTA_BY_EVENT: Record<FriendshipEvent, number> = {
  capture: 0,
  hatch: 10,
  levelUp: 2,
  battleWin: 1,
  faint: -3,
  release: -80,
  care: 4,
};

export function clampFriendship(value: number) {
  return Math.max(FRIENDSHIP_MIN, Math.min(FRIENDSHIP_MAX, Math.trunc(Number(value || 0))));
}

export function applyFriendshipEvent(current: number | undefined, event: FriendshipEvent) {
  const base = Number.isFinite(Number(current)) ? Number(current) : FRIENDSHIP_DEFAULT;
  return clampFriendship(base + (DELTA_BY_EVENT[event] ?? 0));
}

export function isFriendshipEvolutionReady(friendship: number | undefined) {
  return clampFriendship(Number(friendship || 0)) >= FRIENDSHIP_EVOLUTION_THRESHOLD;
}

