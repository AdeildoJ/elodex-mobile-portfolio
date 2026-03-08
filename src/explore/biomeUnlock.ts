export type UnlockNode =
  | { op: "AND" | "OR"; rules: UnlockNode[] }
  | { type: "move"; moveId: string }
  | { type: "km"; minKm: number }
  | { type: "speciesInParty"; speciesIds: number[]; match?: "any" | "all" }
  | { type: "missionCompleted"; missionIds: string[]; match?: "any" | "all" }
  | { type: "temporaryAccess"; accessId?: string; biomeId?: string };

export type UnlockContext = {
  teamMoves: string[];
  partySpeciesIds: number[];
  kmWalked: number;
  completedMissionIds: string[];
  accessIds: string[];
  biomeId?: string;
};

function str(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function toInt(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function parseNode(input: unknown): UnlockNode | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;

  const op = str(row.op);
  if ((op === "and" || op === "or") && Array.isArray(row.rules)) {
    const rules = row.rules.map(parseNode).filter((v): v is UnlockNode => !!v);
    if (!rules.length) return null;
    return { op: op === "and" ? "AND" : "OR", rules };
  }

  const type = str(row.type);
  if (type === "move") {
    const moveId = str(row.moveId);
    if (!moveId) return null;
    return { type: "move", moveId };
  }
  if (type === "km") {
    return { type: "km", minKm: Math.max(0, toInt(row.minKm, 0)) };
  }
  if (type === "speciesinparty") {
    const speciesIds = Array.isArray(row.speciesIds)
      ? row.speciesIds.map((x) => Math.max(1, toInt(x, 1))).filter((x) => x > 0)
      : [];
    if (!speciesIds.length) return null;
    const match = str(row.match) === "all" ? "all" : "any";
    return { type: "speciesInParty", speciesIds, match };
  }
  if (type === "missioncompleted") {
    const missionIds = Array.isArray(row.missionIds) ? row.missionIds.map(str).filter(Boolean) : [];
    if (!missionIds.length) return null;
    const match = str(row.match) === "all" ? "all" : "any";
    return { type: "missionCompleted", missionIds, match };
  }
  if (type === "temporaryaccess") {
    const accessId = str(row.accessId);
    const biomeId = str(row.biomeId);
    if (!accessId && !biomeId) return null;
    return { type: "temporaryAccess", accessId: accessId || undefined, biomeId: biomeId || undefined };
  }

  return null;
}

function evalNode(node: UnlockNode, ctx: UnlockContext): boolean {
  if ("op" in node) {
    if (node.op === "AND") return node.rules.every((r) => evalNode(r, ctx));
    return node.rules.some((r) => evalNode(r, ctx));
  }

  if (node.type === "move") {
    return ctx.teamMoves.includes(str(node.moveId));
  }
  if (node.type === "km") {
    return Math.max(0, Number(ctx.kmWalked || 0)) >= Math.max(0, Number(node.minKm || 0));
  }
  if (node.type === "speciesInParty") {
    const owned = new Set(ctx.partySpeciesIds.map((v) => Math.max(1, toInt(v, 1))));
    if (node.match === "all") return node.speciesIds.every((id) => owned.has(id));
    return node.speciesIds.some((id) => owned.has(id));
  }
  if (node.type === "missionCompleted") {
    const done = new Set(ctx.completedMissionIds.map(str));
    if (node.match === "all") return node.missionIds.every((id) => done.has(str(id)));
    return node.missionIds.some((id) => done.has(str(id)));
  }
  if (node.type === "temporaryAccess") {
    if (node.accessId && ctx.accessIds.includes(str(node.accessId))) return true;
    if (node.biomeId && ctx.accessIds.includes(str(node.biomeId))) return true;
    return false;
  }

  return false;
}

export function evaluateUnlockRule(input: unknown, ctx: UnlockContext): boolean {
  const parsed = parseNode(input);
  if (!parsed) return false;
  return evalNode(parsed, ctx);
}
