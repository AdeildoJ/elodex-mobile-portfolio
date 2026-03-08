import pokemonMoves from "../../../data/pokemon/pokemonMoves.json";

export type MoveLearnMethod = "level-up" | "machine" | "egg" | "tutor" | "other";
export type RelearnSource = Exclude<MoveLearnMethod, "other"> | "other";
export type LearnsetConstraintContext = {
  speciesGeneration?: number | null;
  maxGeneration?: number | null;
  blockedSources?: RelearnSource[];
};

export type SpeciesMoveEntry = {
  moveId: string;
  method: MoveLearnMethod;
  level: number | null;
};

export type LearnStateInput = {
  currentMoves: string[];
  moveHistory?: string[];
  relearnableMoves?: string[];
  pendingLearnMove?: string | null;
};

export type LearnStateOutput = {
  moves: string[];
  moveHistory: string[];
  relearnableMoves: string[];
  pendingLearnMove: string | null;
  justLearned: string[];
  queuedToDecide: string[];
};

function normalizeMethod(value: unknown): MoveLearnMethod {
  const raw = String(value || "").toLowerCase();
  if (raw === "level-up") return "level-up";
  if (raw === "machine") return "machine";
  if (raw === "egg") return "egg";
  if (raw === "tutor") return "tutor";
  return "other";
}

function toMoveId(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function toLevel(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const lvl = Math.trunc(n);
  return lvl > 0 ? lvl : null;
}

function uniqueKeepOrder(list: string[]): string[] {
  const out: string[] = [];
  for (const row of list) {
    const id = toMoveId(row);
    if (!id) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function getSpeciesMoves(speciesId: number): SpeciesMoveEntry[] {
  const sid = String(Math.max(1, Math.trunc(Number(speciesId || 1))));
  const data: any = pokemonMoves;
  const byKey = data?.[sid];

  const raw: any[] = Array.isArray(byKey?.moves)
    ? byKey.moves
    : Array.isArray(byKey)
    ? byKey
    : Array.isArray(data)
    ? data.filter((x) => Number(x?.speciesId) === Number(sid))
    : [];

  return raw
    .map((m: any) => ({
      moveId: toMoveId(m?.moveId ?? m?.id ?? m?.name ?? m?.moveName ?? m?.move),
      method: normalizeMethod(m?.method),
      level: toLevel(m?.level ?? m?.levelLearnedAt ?? m?.lvl),
    }))
    .filter((m) => !!m.moveId);
}

export function listLevelUpMovesInRange(speciesId: number, fromExclusiveLevel: number, toInclusiveLevel: number): string[] {
  const fromLevel = Math.max(0, Math.trunc(Number(fromExclusiveLevel || 0)));
  const toLevel = Math.max(fromLevel, Math.trunc(Number(toInclusiveLevel || fromLevel)));

  const learned = getSpeciesMoves(speciesId)
    .filter((m) => m.method === "level-up" && m.level != null)
    .filter((m) => {
      const level = Number(m.level || 0);
      return level > fromLevel && level <= toLevel;
    })
    .sort((a, b) => Number(a.level || 0) - Number(b.level || 0));

  return uniqueKeepOrder(learned.map((m) => m.moveId));
}

export function getDefaultMovesForLevel(speciesId: number, level: number): string[] {
  const upTo = Math.max(1, Math.trunc(Number(level || 1)));
  const learned = getSpeciesMoves(speciesId)
    .filter((m) => m.method === "level-up" && m.level != null)
    .filter((m) => Number(m.level || 0) <= upTo)
    .sort((a, b) => Number(a.level || 0) - Number(b.level || 0));

  const out: string[] = [];
  for (let i = learned.length - 1; i >= 0; i--) {
    const moveId = learned[i].moveId;
    if (!out.includes(moveId)) out.unshift(moveId);
    if (out.length >= 4) break;
  }
  return out.slice(0, 4);
}

export function getMachineMovesForSpecies(speciesId: number): string[] {
  return uniqueKeepOrder(getSpeciesMoves(speciesId).filter((m) => m.method === "machine").map((m) => m.moveId));
}

export function getEggMovesForSpecies(speciesId: number): string[] {
  return uniqueKeepOrder(getSpeciesMoves(speciesId).filter((m) => m.method === "egg").map((m) => m.moveId));
}

export function getTutorMovesForSpecies(speciesId: number): string[] {
  return uniqueKeepOrder(getSpeciesMoves(speciesId).filter((m) => m.method === "tutor").map((m) => m.moveId));
}

export function getMoveLearnMethodsForSpeciesMove(
  speciesId: number,
  moveId: string
): MoveLearnMethod[] {
  const target = toMoveId(moveId);
  if (!target) return [];
  const methods = getSpeciesMoves(speciesId)
    .filter((m) => m.moveId === target)
    .map((m) => m.method);
  return uniqueKeepOrder(methods) as MoveLearnMethod[];
}

export function applyLearnsetConstraints(
  sources: RelearnSource[],
  ctx?: LearnsetConstraintContext
): {
  allowedSources: RelearnSource[];
  blockedReason: "generation" | "source" | null;
} {
  const input = uniqueKeepOrder((sources || []).map((s) => String(s || "").trim().toLowerCase())) as RelearnSource[];
  const blockedSources = uniqueKeepOrder((ctx?.blockedSources || []).map((s) => String(s || "").trim().toLowerCase())) as RelearnSource[];
  const speciesGeneration = Number(ctx?.speciesGeneration ?? 0);
  const maxGeneration = Number(ctx?.maxGeneration ?? 0);

  if (Number.isFinite(speciesGeneration) && speciesGeneration > 0 && Number.isFinite(maxGeneration) && maxGeneration > 0) {
    if (speciesGeneration > maxGeneration) {
      return { allowedSources: [], blockedReason: "generation" };
    }
  }

  const allowedSources = input.filter((s) => !blockedSources.includes(s));
  if (!allowedSources.length && input.length) {
    return { allowedSources: [], blockedReason: "source" };
  }
  return { allowedSources, blockedReason: null };
}

export function applyLearnMoves(input: LearnStateInput, candidateMoves: string[]): LearnStateOutput {
  const moves = uniqueKeepOrder((input.currentMoves || []).slice(0, 4));
  const moveHistory = uniqueKeepOrder([...(input.moveHistory || []), ...moves]);
  const relearnableMoves = uniqueKeepOrder(input.relearnableMoves || []);
  let pendingLearnMove = input.pendingLearnMove ? toMoveId(input.pendingLearnMove) : null;

  const justLearned: string[] = [];
  const queuedToDecide: string[] = [];

  for (const row of candidateMoves) {
    const moveId = toMoveId(row);
    if (!moveId) continue;

    const alreadyKnown = moves.includes(moveId) || moveHistory.includes(moveId);
    if (alreadyKnown) {
      if (!moveHistory.includes(moveId)) moveHistory.push(moveId);
      continue;
    }

    if (moves.length < 4 && !pendingLearnMove) {
      moves.push(moveId);
      moveHistory.push(moveId);
      justLearned.push(moveId);
      continue;
    }

    if (!pendingLearnMove) {
      pendingLearnMove = moveId;
      if (!moveHistory.includes(moveId)) moveHistory.push(moveId);
      if (!relearnableMoves.includes(moveId)) relearnableMoves.push(moveId);
      queuedToDecide.push(moveId);
      continue;
    }

    if (!moveHistory.includes(moveId)) moveHistory.push(moveId);
    if (!relearnableMoves.includes(moveId)) relearnableMoves.push(moveId);
  }

  return {
    moves: moves.slice(0, 4),
    moveHistory,
    relearnableMoves,
    pendingLearnMove,
    justLearned,
    queuedToDecide,
  };
}

export function resolvePendingDecision(input: LearnStateInput & { forgetMoveIndex?: number | null }): LearnStateOutput {
  const base = applyLearnMoves(
    {
      currentMoves: input.currentMoves,
      moveHistory: input.moveHistory,
      relearnableMoves: input.relearnableMoves,
      pendingLearnMove: input.pendingLearnMove,
    },
    []
  );

  const pending = base.pendingLearnMove;
  if (!pending) return base;

  const forgetIdx = input.forgetMoveIndex;
  if (Number.isInteger(forgetIdx) && (forgetIdx as number) >= 0 && (forgetIdx as number) < base.moves.length) {
    const idx = forgetIdx as number;
    const replaced = base.moves[idx];
    base.moves[idx] = pending;
    if (replaced && !base.relearnableMoves.includes(replaced)) {
      base.relearnableMoves.push(replaced);
    }
  }

  if (!base.moveHistory.includes(pending)) base.moveHistory.push(pending);
  if (!base.relearnableMoves.includes(pending)) base.relearnableMoves.push(pending);
  base.pendingLearnMove = null;
  return base;
}
