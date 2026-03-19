import { doc, getDoc } from "firebase/firestore";

import { db } from "../../services/firebase/firebaseConfig";
import { getScenarioAssets } from "./scenarioAssets";
import type { BattleAssetSet } from "./types";

function normalizeString(value: unknown) {
  return String(value || "").trim();
}

export async function resolveScenarioAssetOverrides(scenarioId: string): Promise<Partial<BattleAssetSet> | null> {
  const normalizedId = normalizeString(scenarioId).toLowerCase();
  if (!normalizedId) return null;

  const legacyAssets = getScenarioAssets(normalizedId);
  if (legacyAssets) return legacyAssets;

  try {
    const snap = await getDoc(doc(db, "scenarios", normalizedId));
    if (!snap.exists()) return null;

    const data = snap.data() as Record<string, unknown>;
    if (data.isActive === false) return null;

    const processedImageUrl = normalizeString(data.processedImageUrl || data.imageUrl);
    const battleAssetsRoot =
      data.battleAssets && typeof data.battleAssets === "object"
        ? (data.battleAssets as Record<string, unknown>)
        : {};

    const resolved: Partial<BattleAssetSet> = {
      background: normalizeString(battleAssetsRoot.background) || processedImageUrl || null,
      backgroundDay: normalizeString(battleAssetsRoot.backgroundDay) || processedImageUrl || null,
      backgroundNight: normalizeString(battleAssetsRoot.backgroundNight) || processedImageUrl || null,
    };

    return resolved.background || resolved.backgroundDay || resolved.backgroundNight ? resolved : null;
  } catch {
    return null;
  }
}
