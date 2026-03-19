import type { BattleAssetSet, BattleBackgroundKind } from "./types";
import { getScenarioAssets } from "./scenarioAssets";

const LOCAL_KIND_MAP: Record<BattleBackgroundKind, string> = {
  grasslands: "grassland",
  forest: "forest",
  cave: "cave",
  beach: "beach",
  city: "city",
};

export function getLocalBattleAssets(kind: BattleBackgroundKind): BattleAssetSet | null {
  const scenarioId = LOCAL_KIND_MAP[kind];
  if (!scenarioId) return null;
  return (getScenarioAssets(scenarioId) as BattleAssetSet | null) || null;
}
