import type { QueryDocumentSnapshot } from "firebase/firestore";

export type BadgeBonusType = "shiny" | "capture" | "xp" | "money" | "heal" | "loot";

export type BadgeRecord = {
  id: string;
  badgeId: string;
  name: string;
  imageUrl: string;
  description: string;
  bonusType: BadgeBonusType;
  bonusValue: number;
  isActive: boolean;
};

export type EffectiveBadgeBonus = {
  badgeId: string;
  badgeName: string;
  bonusType: BadgeBonusType;
  bonusValue: number;
};

export const BADGE_BONUS_OPTIONS: Array<{ value: BadgeBonusType; label: string }> = [
  { value: "shiny", label: "Shiny" },
  { value: "capture", label: "Captura" },
  { value: "xp", label: "XP" },
  { value: "money", label: "Dinheiro" },
  { value: "heal", label: "Cura" },
  { value: "loot", label: "Loot" },
];

function normalizeString(value: unknown) {
  return String(value || "").trim();
}

export function slugifyBadge(value: string) {
  return normalizeString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeBadgeRecord(id: string, raw: unknown): BadgeRecord {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const badgeId = slugifyBadge(String(data.badgeId || id));
  const bonusTypeRaw = normalizeString(data.bonusType).toLowerCase() as BadgeBonusType;
  const fallbackBonus = BADGE_BONUS_OPTIONS[0].value;

  return {
    id: badgeId,
    badgeId,
    name: normalizeString(data.name || badgeId),
    imageUrl: normalizeString(data.imageUrl),
    description: normalizeString(data.description),
    bonusType: BADGE_BONUS_OPTIONS.some((item) => item.value === bonusTypeRaw) ? bonusTypeRaw : fallbackBonus,
    bonusValue: Math.max(0, Number(data.bonusValue || 0)),
    isActive: data.isActive === false ? false : true,
  };
}

export function normalizeBadgeSnapshot(snapshot: QueryDocumentSnapshot) {
  return normalizeBadgeRecord(snapshot.id, snapshot.data());
}

export function resolveEffectiveBadgeBonuses(badges: BadgeRecord[]) {
  const effective = new Map<BadgeBonusType, EffectiveBadgeBonus>();

  badges
    .filter((badge) => badge.isActive)
    .forEach((badge) => {
      const current = effective.get(badge.bonusType);
      if (!current || badge.bonusValue > current.bonusValue) {
        effective.set(badge.bonusType, {
          badgeId: badge.id,
          badgeName: badge.name,
          bonusType: badge.bonusType,
          bonusValue: badge.bonusValue,
        });
      }
    });

  return effective;
}
