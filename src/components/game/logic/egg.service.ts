import { getEggMovesForSpecies } from "./move-learning.service";

export type EggStatus = "incubating" | "ready" | "hatched";

export type EggDoc = {
  id?: string;
  speciesId: number;
  speciesName: string;
  stepsRequired: number;
  stepsProgress: number;
  inheritedEggMoves: string[];
  parentSpeciesIds?: number[];
  status: EggStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type EggParentSeed = {
  speciesId: number;
  moves?: string[];
};

export function buildEggDocFromParents(args: {
  childSpeciesId: number;
  childSpeciesName: string;
  stepsRequired: number;
  parents?: EggParentSeed[];
}): EggDoc {
  const childSpeciesId = Math.max(1, Math.trunc(Number(args.childSpeciesId || 1)));
  const allEggMoves = getEggMovesForSpecies(childSpeciesId);
  const inherited = new Set<string>();

  for (const parent of args.parents || []) {
    for (const moveId of parent.moves || []) {
      const normalized = String(moveId || "").trim().toLowerCase();
      if (!normalized) continue;
      if (allEggMoves.includes(normalized)) inherited.add(normalized);
    }
  }

  return {
    speciesId: childSpeciesId,
    speciesName: String(args.childSpeciesName || `#${childSpeciesId}`),
    stepsRequired: Math.max(1, Math.trunc(Number(args.stepsRequired || 1))),
    stepsProgress: 0,
    inheritedEggMoves: Array.from(inherited),
    parentSpeciesIds: (args.parents || []).map((p) => Math.max(1, Math.trunc(Number(p.speciesId || 1)))),
    status: "incubating",
  };
}

export function applyEggSteps(egg: EggDoc, stepsDelta: number): EggDoc {
  const next = { ...egg };
  const delta = Math.max(0, Math.trunc(Number(stepsDelta || 0)));
  const required = Math.max(1, Math.trunc(Number(egg.stepsRequired || 1)));
  const progress = Math.max(0, Math.trunc(Number(egg.stepsProgress || 0)));

  next.stepsRequired = required;
  next.stepsProgress = Math.min(required, progress + delta);
  next.status = next.stepsProgress >= required ? "ready" : "incubating";
  return next;
}
