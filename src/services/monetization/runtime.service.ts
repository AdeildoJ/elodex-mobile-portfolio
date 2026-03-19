import type {
  MonetizationProductBenefitSet,
  PlayerProductEntitlement,
  TrainerLicenseState,
  VipBenefitSet,
} from "../firebase/monetization.service";

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseMetadataNumber(
  benefits: MonetizationProductBenefitSet | null | undefined,
  key: string,
  fallback = 0
) {
  return toNumber(benefits?.metadata?.[key], fallback);
}

export function parseMetadataString(
  benefits: MonetizationProductBenefitSet | null | undefined,
  key: string,
  fallback = ""
) {
  const raw = benefits?.metadata?.[key];
  return typeof raw === "string" ? raw.trim() : fallback;
}

export function parseMetadataStringList(
  benefits: MonetizationProductBenefitSet | null | undefined,
  key: string
) {
  return parseMetadataString(benefits, key)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isEntitlementActive(entitlement: PlayerProductEntitlement | null | undefined) {
  if (!entitlement || entitlement.status !== "active") return false;
  const validUntilMs = toNumber(entitlement.validUntilMs, 0);
  return validUntilMs <= 0 || validUntilMs >= Date.now();
}

export function isTrainerLicenseActive(license: TrainerLicenseState | null | undefined) {
  if (!license || license.status !== "active") return false;
  const expiresAtMs = toNumber(license.expiresAtMs, 0);
  return expiresAtMs <= 0 || expiresAtMs >= Date.now();
}

export function getActiveVipBenefits(vipBenefits: VipBenefitSet | null | undefined, vipExpiresAtMs?: number | null) {
  const expiresAtMs = toNumber(vipExpiresAtMs, 0);
  if (!vipBenefits) return null;
  if (expiresAtMs > 0 && expiresAtMs < Date.now()) return null;
  return vipBenefits;
}

export function resolveCharacterLimit(vipBenefits: VipBenefitSet | null | undefined) {
  return Math.max(1, Math.trunc(toNumber(vipBenefits?.maxCharacters, 1)));
}

export function resolveCaptureLimit(vipBenefits: VipBenefitSet | null | undefined) {
  return Math.max(1, Math.trunc(toNumber(vipBenefits?.maxCapturedPokemon, 20)));
}

export function resolveItemStorageLimit(
  vipBenefits: VipBenefitSet | null | undefined,
  entitlements: PlayerProductEntitlement[]
) {
  const base = Math.max(20, Math.trunc(toNumber(vipBenefits?.maxStorageItems, 20)));
  const extra = entitlements
    .filter((entry) => isEntitlementActive(entry) && String(entry.productType) === "expansion")
    .reduce((sum, entry) => sum + Math.max(0, Math.trunc(toNumber(entry.benefits?.expansionSlots, 0))), 0);
  return base + extra;
}

export function resolveXpMultiplier(
  vipBenefits: VipBenefitSet | null | undefined,
  trainerLicense: TrainerLicenseState | null | undefined
) {
  const vipBonus = toNumber(vipBenefits?.xpBonusPercent, 0);
  const licenseBonus = isTrainerLicenseActive(trainerLicense)
    ? toNumber(trainerLicense?.benefits?.xpBonusPercent, 0)
    : 0;
  return 1 + (vipBonus + licenseBonus) / 100;
}

export function resolveMoneyMultiplier(vipBenefits: VipBenefitSet | null | undefined) {
  const vipBonus = toNumber(vipBenefits?.moneyBonusPercent, 0);
  return 1 + vipBonus / 100;
}

export function resolveGymTypeXpMultiplier(args: {
  baseMultiplier?: number | null;
  gymType?: string | null;
  gymXpBonusPercent?: number | null;
  pokemonTypes?: string[] | null;
}) {
  const baseMultiplier = Math.max(0, toNumber(args.baseMultiplier, 1));
  const gymType = parseMetadataString({ metadata: { gymType: args.gymType || "" } }, "gymType").toLowerCase();
  const pokemonTypes = Array.isArray(args.pokemonTypes)
    ? args.pokemonTypes.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : [];
  if (!gymType || pokemonTypes.length === 0 || !pokemonTypes.includes(gymType)) return baseMultiplier;
  return baseMultiplier * (1 + Math.max(0, toNumber(args.gymXpBonusPercent, 0)) / 100);
}

export function resolveTrainerBiomeAccessIds(trainerLicense: TrainerLicenseState | null | undefined) {
  if (!isTrainerLicenseActive(trainerLicense)) return [];
  return Array.isArray(trainerLicense?.benefits?.biomeAccessIds)
    ? trainerLicense!.benefits!.biomeAccessIds!.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : [];
}

export function resolveTrainerShinyBonusPercent(trainerLicense: TrainerLicenseState | null | undefined) {
  if (!isTrainerLicenseActive(trainerLicense)) return 0;
  return Math.max(0, toNumber(trainerLicense?.benefits?.shinyBonusPercent, 0));
}
