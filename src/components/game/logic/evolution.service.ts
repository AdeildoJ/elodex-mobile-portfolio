import { isFriendshipEvolutionReady } from "./friendship.service";
import { EVOLUTION_RULES_BY_SPECIES, type EvolutionRule } from "./evolutionCatalog";

export type EvolutionContext = {
  speciesId: number;
  level: number;
  friendship?: number;
  itemId?: string | null;
  knownMoves?: string[];
  biomeId?: string | null;
  isDay?: boolean;
  isNight?: boolean;
};

function normalize(v: unknown) {
  return String(v || "").trim().toLowerCase();
}

function ruleMatches(ctx: EvolutionContext, rule: EvolutionRule) {
  if (rule.minLevel && Number(ctx.level || 0) < rule.minLevel) return false;

  if (rule.minFriendship) {
    if (!isFriendshipEvolutionReady(ctx.friendship)) return false;
    if (Number(ctx.friendship || 0) < rule.minFriendship) return false;
  }

  if (rule.itemId && normalize(ctx.itemId) !== normalize(rule.itemId)) return false;

  if (rule.moveId) {
    const moves = Array.isArray(ctx.knownMoves) ? ctx.knownMoves.map(normalize) : [];
    if (!moves.includes(normalize(rule.moveId))) return false;
  }

  if (rule.biomeId && normalize(ctx.biomeId) !== normalize(rule.biomeId)) return false;
  if (rule.requireDay && !ctx.isDay) return false;
  if (rule.requireNight && !ctx.isNight) return false;

  return true;
}

export function resolveEvolutionTarget(ctx: EvolutionContext): number | null {
  const speciesId = Math.max(1, Number(ctx.speciesId || 1));
  const rules = EVOLUTION_RULES_BY_SPECIES[speciesId] ?? [];
  for (const rule of rules) {
    if (ruleMatches(ctx, rule)) return rule.toSpeciesId;
  }
  return null;
}

export function canEvolve(ctx: EvolutionContext) {
  return resolveEvolutionTarget(ctx) != null;
}
