import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";

import { db } from "./firebaseConfig";

export type MonetizationStatus = "active" | "inactive";
export type RewardDeliveryScope = "account" | "character_backpack";
export type ProductType =
  | "slot"
  | "expansion"
  | "incubator"
  | "ticket"
  | "egg"
  | "biome_ticket"
  | "mystery_egg"
  | "iv_reset"
  | "trainer_license"
  | "gym_ticket"
  | "gym_police_npc"
  | "gym_extra_npc"
  | "gym_badges"
  | "gym_type_egg"
  | "gym_storage_upgrade"
  | "gym_main_team_slot"
  | "battle_castle_ticket"
  | "exclusive_event_ticket";

export type VipBenefitSet = {
  maxCharacters: number;
  maxCapturedPokemon: number;
  maxStorageItems: number;
  xpBonusPercent: number;
  moneyBonusPercent: number;
  weeklyIncubators: number;
};

export type VipIncludedItemRef = {
  id: string;
  source: "item_config" | "monetization_product" | "ecoin_package";
  refId: string;
  refCode?: string | null;
  name: string;
  categoryLabel?: string | null;
  quantity: number;
  deliveryScope?: RewardDeliveryScope | null;
};

export type VipPlan = {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  currency: "BRL";
  durationDays: number;
  status: MonetizationStatus;
  benefits: VipBenefitSet;
  includedItems?: VipIncludedItemRef[];
  sortOrder: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type MonetizationProductBenefitSet = {
  expansionSlots?: number | null;
  incubators?: number | null;
  biomeTicketCount?: number | null;
  mysteryEggCount?: number | null;
  ivResetCount?: number | null;
  trainerLicenseDays?: number | null;
  gymTicketCount?: number | null;
  gymStorageSlots?: number | null;
  gymMainTeamSlots?: number | null;
  gymBadgeCount?: number | null;
  gymTypeEggCount?: number | null;
  gymPoliceUnlock?: boolean | null;
  gymAdditionalNpcCount?: number | null;
  battleCastleTicketCount?: number | null;
  exclusiveEventTicketCount?: number | null;
  gymDefenseSlotsAdded?: number | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export type MonetizationProduct = {
  id: string;
  code: string;
  type: ProductType;
  name: string;
  description: string;
  imageUrl?: string | null;
  durationDays: number | null;
  price: number;
  currency: "BRL";
  status: MonetizationStatus;
  storeVisible: boolean;
  benefits: MonetizationProductBenefitSet;
  configuration?: Record<string, unknown> | null;
  grantType: "entitlement";
  sortOrder: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type TrainerLicenseState = {
  status: "active" | "inactive" | "expired";
  productId?: string | null;
  productCode?: string | null;
  productName?: string | null;
  startedAt?: Timestamp | null;
  startedAtMs?: number | null;
  expiresAt?: Timestamp | null;
  expiresAtMs?: number | null;
  benefits?: {
    xpBonusPercent?: number | null;
    shinyBonusPercent?: number | null;
    biomeAccessIds?: string[] | null;
  } | null;
  updatedAt?: Timestamp | null;
};

export type PlayerProductEntitlement = {
  id: string;
  entitlementId?: string;
  productId: string;
  productCode?: string | null;
  productType: ProductType | string;
  productName: string;
  benefits?: MonetizationProductBenefitSet | null;
  quantity?: number | null;
  status: "active" | "claimed" | "expired" | "canceled";
  source?: string | null;
  orderId?: string | null;
  validUntil?: Timestamp | null;
  validUntilMs?: number | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  claimedAt?: Timestamp | null;
  claimedByCharacterId?: string | null;
  consumedByCharacterId?: string | null;
  deliveryScope?: RewardDeliveryScope | string | null;
  generatedEggId?: string | null;
};

export type PlayerVipSubscription = {
  planId: string | null;
  planCode?: string | null;
  planName?: string | null;
  status: "active" | "inactive" | "past_due" | "canceled";
  startedAt?: Timestamp | null;
  expiresAt?: Timestamp | null;
  expiresAtMs?: number | null;
  benefits?: VipBenefitSet | null;
  updatedAt?: Timestamp | null;
};

export type PlayerMonetizationHistoryEntry = {
  id: string;
  type: "vip_activation" | "product_activation" | "purchase";
  source: "mercadopago" | "manual" | "system";
  status: "pending" | "approved" | "active" | "expired" | "canceled";
  itemId: string;
  itemType: "vip_plan" | "product";
  itemName: string;
  amountPaid?: number | null;
  currency?: string | null;
  orderId?: string | null;
  validUntil?: Timestamp | null;
  validUntilMs?: number | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export type AccountBackpackRewardType =
  | "item_config"
  | "monetization_product"
  | "ecoin_package"
  | "character";

export type PlayerAccountBackpackEntry = {
  id: string;
  name: string;
  rewardType: AccountBackpackRewardType;
  deliveryScope: RewardDeliveryScope;
  source: "vip_subscription" | "product_entitlement" | "manual" | "system";
  status: "pending";
  quantity: number;
  productId?: string | null;
  productCode?: string | null;
  productType?: ProductType | string | null;
  itemConfigId?: string | null;
  packageId?: string | null;
  characterTemplateId?: string | null;
  benefits?: MonetizationProductBenefitSet | null;
  metadata?: Record<string, unknown> | null;
  sourceOrderId?: string | null;
  sourcePlanId?: string | null;
  sourcePlanCode?: string | null;
  sourceProductId?: string | null;
  sourceProductCode?: string | null;
  idempotencyKey?: string | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export type PlayerAccountDistributionHistoryEntry = {
  id: string;
  accountBackpackEntryId: string;
  rewardType: AccountBackpackRewardType;
  rewardName: string;
  quantity: number;
  characterId: string;
  characterName?: string | null;
  source: "vip_subscription" | "product_entitlement" | "manual" | "system";
  sourceOrderId?: string | null;
  sourcePlanId?: string | null;
  sourceProductId?: string | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export async function getVipPlans() {
  const snap = await getDocs(query(collection(db, "vipPlans")));
  return snap.docs
    .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<VipPlan, "id">) }))
    .filter((plan) => plan.status === "active")
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

export async function getMonetizationProducts() {
  const snap = await getDocs(query(collection(db, "monetizationProducts")));
  return snap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<MonetizationProduct, "id">),
    }))
    .filter((product) => product.status === "active" && product.storeVisible !== false)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

// ---------------------------------------------------
//  Ecoin packages (para compra de saldo de Ecoin)
// ---------------------------------------------------

export type EcoinPackage = {
  id: string;
  amount: number; // quantos ecoins recebe
  price: number; // valor em BRL
  imageUrl?: string | null;
  status: MonetizationStatus;
  sortOrder: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export async function getEcoinPackages(): Promise<EcoinPackage[]> {
  const snap = await getDocs(query(collection(db, "ecoinPackages")));
  return snap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<EcoinPackage, "id">),
    }))
    .filter((pkg) => pkg.status === "active")
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

export async function getPlayerVipSubscription(uid: string) {
  const snap = await getDoc(doc(db, "players", uid));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  const vipSubscription = (data.vipSubscription || null) as PlayerVipSubscription | null;
  if (vipSubscription) return vipSubscription;

  return {
    planId: typeof data.vipPlanId === "string" ? data.vipPlanId : null,
    planCode: typeof data.vipPlanCode === "string" ? data.vipPlanCode : null,
    planName: typeof data.vipPlanName === "string" ? data.vipPlanName : null,
    status: (String(data.vipStatus || "inactive").toLowerCase() as PlayerVipSubscription["status"]),
    expiresAt: (data.vipExpiresAt as Timestamp | null) || null,
    expiresAtMs: typeof data.vipExpiresAtMs === "number" ? data.vipExpiresAtMs : null,
    benefits: (data.vipBenefits as VipBenefitSet | null) || null,
  };
}

export function listenPlayerMonetizationHistory(
  uid: string,
  cb: (entries: PlayerMonetizationHistoryEntry[]) => void
) {
  return onSnapshot(
    query(collection(db, "players", uid, "monetizationHistory"), orderBy("createdAt", "desc")),
    (snap) => {
      const rows = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<PlayerMonetizationHistoryEntry, "id">),
      }));
      cb(rows);
    }
  );
}

export function listenPlayerProductEntitlements(
  uid: string,
  cb: (entries: PlayerProductEntitlement[]) => void
) {
  return onSnapshot(
    query(collection(db, "players", uid, "productEntitlements"), orderBy("createdAt", "desc")),
    (snap) => {
      const rows = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<PlayerProductEntitlement, "id">),
      }));
      cb(rows);
    }
  );
}

export function listenPlayerAccountBackpack(
  uid: string,
  cb: (entries: PlayerAccountBackpackEntry[]) => void
) {
  return onSnapshot(
    query(collection(db, "players", uid, "accountBackpack"), orderBy("createdAt", "desc")),
    (snap) => {
      const rows = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<PlayerAccountBackpackEntry, "id">),
      }));
      cb(rows.filter((row) => row.status === "pending"));
    }
  );
}

export function listenPlayerAccountDistributionHistory(
  uid: string,
  cb: (entries: PlayerAccountDistributionHistoryEntry[]) => void
) {
  return onSnapshot(
    query(collection(db, "players", uid, "accountDistributionHistory"), orderBy("createdAt", "desc")),
    (snap) => {
      const rows = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<PlayerAccountDistributionHistoryEntry, "id">),
      }));
      cb(rows);
    }
  );
}
