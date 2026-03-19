import type { QueryDocumentSnapshot } from "firebase/firestore";

export type GymScenarioRecord = {
  id: string;
  name: string;
  imageUrl: string;
  processedImageUrl: string;
  isActive: boolean;
  isCommercialized: boolean;
  ecoinPrice: number | null;
  specialType: "climate" | "status" | null;
  climateType: string | null;
  gymElementType: string | null;
};

function normalizeString(value: unknown) {
  return String(value || "").trim();
}

export function normalizeGymScenarioRecord(id: string, raw: unknown): GymScenarioRecord {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const specialTypeRaw = normalizeString(data.specialType).toLowerCase();
  return {
    id: normalizeString(data.scenarioId || id).toLowerCase(),
    name: normalizeString(data.name || id),
    imageUrl: normalizeString(data.imageUrl),
    processedImageUrl: normalizeString(data.processedImageUrl),
    isActive: data.isActive === false ? false : true,
    isCommercialized: Boolean(data.isCommercialized),
    ecoinPrice: typeof data.ecoinPrice === "number" && Number.isFinite(data.ecoinPrice) ? data.ecoinPrice : null,
    specialType: specialTypeRaw === "climate" || specialTypeRaw === "status" ? specialTypeRaw : null,
    climateType: normalizeString(data.climateType).toLowerCase() || null,
    gymElementType: normalizeString(data.gymElementType).toLowerCase() || null,
  };
}

export function normalizeScenarioSnapshot(snapshot: QueryDocumentSnapshot) {
  return normalizeGymScenarioRecord(snapshot.id, snapshot.data());
}
