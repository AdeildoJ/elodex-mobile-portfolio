export type RewardDeliveryScope = "account" | "character_backpack";

function toLower(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function resolveProductDeliveryScope(productType: unknown): RewardDeliveryScope {
  const normalized = toLower(productType);
  if (
    normalized === "incubator" ||
    normalized === "iv_reset" ||
    normalized === "biome_ticket" ||
    normalized === "mystery_egg" ||
    normalized === "egg"
  ) {
    return "character_backpack";
  }
  return "account";
}

export function resolveVipIncludedItemDeliveryScope(input: {
  source: string;
  productType?: string | null;
  explicitDeliveryScope?: unknown;
}): RewardDeliveryScope {
  const explicit = toLower(input.explicitDeliveryScope);
  if (explicit === "character_backpack" || explicit === "character") return "character_backpack";
  if (explicit === "account") return "account";
  if (toLower(input.source) === "ecoin_package") return "account";
  if (toLower(input.source) === "item_config") return "character_backpack";
  return resolveProductDeliveryScope(input.productType);
}
