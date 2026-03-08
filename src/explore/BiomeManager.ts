import type { BattleBackgroundKind } from "../components/battle/types";

export function biomeToBattleBackground(biomeId?: string | null): BattleBackgroundKind {
  const id = String(biomeId || "").toLowerCase();
  if (id.includes("caverna")) return "cave";
  if (id.includes("floresta")) return "forest";
  if (id.includes("praia")) return "beach";
  if (id.includes("porto")) return "city";
  if (id.includes("lago")) return "grasslands";
  if (id.includes("planice")) return "grasslands";
  return "grasslands";
}

