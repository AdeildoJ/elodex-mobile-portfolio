import movesDex from "../../data/pokemon/moves.json";
import type { BattleMove } from "./types";

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function buildBattleMove(moveId: string): BattleMove {
  const id = String(moveId || "tackle").toLowerCase();
  const m: any = (movesDex as any)?.[id] ?? {};
  const statChanges = Array.isArray(m.statChanges)
    ? m.statChanges
        .map((s: any) => ({ stat: String(s?.stat || ""), stages: n(s?.stages) }))
        .filter((s: any) => s.stat && s.stages !== 0)
    : [];

  return {
    id,
    name: String(m.name || moveId || "tackle"),
    type: String(m.type || "normal").toLowerCase(),
    power: m.power == null ? 40 : n(m.power),
    accuracy: m.accuracy == null ? 100 : n(m.accuracy),
    pp: Math.max(1, m.pp == null ? 35 : n(m.pp)),
    ppMax: Math.max(1, m.pp == null ? 35 : n(m.pp)),
    category: m.damageClass === "special" ? "special" : m.damageClass === "status" ? "status" : "physical",
    priority: n(m.priority),
    critStage: n(m.critStage),
    drain: n(m.drain),
    healing: n(m.healing),
    flinchChance: n(m.flinchChance),
    isProtectAffected: Boolean(m.isProtectAffected),
    statusAilment: m.statusAilment == null ? null : String(m.statusAilment),
    statusChance: n(m.statusChance),
    statChanges,
    statChangeChance: n(m.statChangeChance),
    target: m.target == null ? undefined : String(m.target),
    isContact: Boolean(m.isContact),
  };
}
