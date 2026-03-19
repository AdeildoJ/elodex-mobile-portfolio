import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";

import pokemonSpecies from "../../data/pokemon/pokemonSpecies.json";
import { db } from "../firebase/firebaseConfig";
import type {
  PlayerAccountBackpackEntry,
  PlayerProductEntitlement,
} from "../firebase/monetization.service";
import { isEntitlementActive, parseMetadataNumber, parseMetadataString, parseMetadataStringList } from "./runtime.service";
import { getProductIdentity, isGymMainTeamSlotProduct, resolveProductRoute } from "./product-routing.service";

const EGG_INCUBATOR_ITEM_ID = "egg-incubator";

function resolveIncubatorHatchDays(benefits: Record<string, any> | null | undefined, fallback = 3) {
  const raw = Number(benefits?.metadata?.hatchDays ?? benefits?.metadata?.requiredDays ?? benefits?.metadata?.distanceKm ?? fallback);
  return Math.max(1, Math.floor(Number.isFinite(raw) ? raw : fallback));
}

function buildIncubatorItemId(hatchDays: number) {
  return `${EGG_INCUBATOR_ITEM_ID}-${Math.max(1, Math.floor(hatchDays))}d`;
}

const GYM_MAIN_TEAM_SLOT_ITEM_ID = "gym-main-team-slot-token";

function buildInventoryDoc(input: {
  id: string;
  name: string;
  description: string;
  quantity: number;
  effectType?: string;
}) {
  return {
    id: input.id,
    kind: "ITEM",
    name: input.name,
    description: input.description,
    quantity: input.quantity,
    effectType: input.effectType || null,
    updatedAt: serverTimestamp(),
  };
}

function getSpeciesName(speciesId: number) {
  const list = Array.isArray(pokemonSpecies) ? pokemonSpecies : Object.values(pokemonSpecies as Record<string, unknown>);
  const row = list.find((entry: any) => Number(entry?.id ?? entry?.speciesId) === Number(speciesId)) as any;
  return String(row?.name || `#${speciesId}`);
}

function pickTypeEggSpecies(typeId: string) {
  const normalizedType = String(typeId || "").trim().toLowerCase();
  if (!normalizedType) return null;
  const list = Array.isArray(pokemonSpecies) ? pokemonSpecies : Object.values(pokemonSpecies as Record<string, unknown>);
  const pool = list.filter((entry: any) => {
    const types = Array.isArray(entry?.types) ? entry.types.map((value: unknown) => String(value).trim().toLowerCase()) : [];
    const flags = (entry?.flags || {}) as Record<string, unknown>;
    return (
      types.includes(normalizedType) &&
      !Boolean(flags.legendary) &&
      !Boolean(flags.mythical)
    );
  }) as Array<{ id?: number; speciesId?: number }>;
  if (!pool.length) return null;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  const speciesId = Math.trunc(Number(selected?.id ?? selected?.speciesId ?? 0));
  return speciesId > 0 ? speciesId : null;
}

export async function claimEntitlementToCharacter(args: {
  uid: string;
  characterId: string;
  entitlement: PlayerProductEntitlement;
  itemCapacityLimit: number;
}) {
  const uid = String(args.uid || "").trim();
  const characterId = String(args.characterId || "").trim();
  const entitlement = args.entitlement;
  if (!uid || !characterId) throw new Error("Sessao invalida.");
  if (!entitlement?.id) throw new Error("Entitlement invalido.");

  return runTransaction(db, async (tx) => {
    const entitlementRef = doc(db, "players", uid, "productEntitlements", entitlement.id);
    const freshEntitlementSnap = await tx.get(entitlementRef);
    if (!freshEntitlementSnap.exists()) throw new Error("Entitlement nao encontrado.");
    const freshEntitlement = { id: entitlement.id, ...(freshEntitlementSnap.data() as Omit<PlayerProductEntitlement, "id">) };
    if (!isEntitlementActive(freshEntitlement)) throw new Error("Esse item nao esta mais ativo.");
    if (freshEntitlement.claimedAt) throw new Error("Esse item ja foi entregue.");

    const productType = String(freshEntitlement.productType || "").toLowerCase();
    const benefits = freshEntitlement.benefits || null;
    const ticketType = parseMetadataString(benefits, "ticketType");
    const eggType = parseMetadataString(benefits, "eggType");
    const ticketSubtype = parseMetadataString(benefits, "ticketSubtype");
    const route = resolveProductRoute(freshEntitlement);
    const productInfo = getProductIdentity(freshEntitlement);
    const isGymMainTeamSlot = isGymMainTeamSlotProduct(freshEntitlement);

    if (isGymMainTeamSlot) {
      const itemRef = doc(db, "players", uid, "characters", characterId, "itens", GYM_MAIN_TEAM_SLOT_ITEM_ID);
      const itemMetaRef = doc(db, "players", uid, "characters", characterId, "itens", "_meta");
      const [itemSnap, metaSnap] = await Promise.all([tx.get(itemRef), tx.get(itemMetaRef)]);
      const amount = Math.max(
        1,
        Math.trunc(
          Number(
            freshEntitlement.benefits?.gymDefenseSlotsAdded ||
              freshEntitlement.benefits?.gymMainTeamSlots ||
              parseMetadataNumber(benefits, "slotsAdded", 1)
          )
        )
      );
      const currentQty = Math.max(0, Number(itemSnap.data()?.quantity || 0));
      const totalQuantity = Math.max(0, Number(metaSnap.data()?.totalQuantity || 0));
      tx.set(
        itemRef,
        buildInventoryDoc({
          id: GYM_MAIN_TEAM_SLOT_ITEM_ID,
          name: "Slot do time principal do GYM",
          description: "Use na mochila do personagem para liberar um novo slot do time principal do GYM.",
          quantity: currentQty + amount,
          effectType: "ACTIVATE_GYM_MAIN_TEAM_SLOT",
        }),
        { merge: true }
      );
      tx.set(
        itemMetaRef,
        {
          totalQuantity: totalQuantity + amount,
          limit: args.itemCapacityLimit,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(
        entitlementRef,
        { claimedAt: serverTimestamp(), claimedByCharacterId: characterId, updatedAt: serverTimestamp() },
        { merge: true }
      );
      return true;
    }

    if (route.scope === "account" && route.kind !== "biome_access") {
      throw new Error("Esse item e de uso por conta/GYM e nao vai para a mochila de personagem.");
    }

    if (productType === "incubator") {
      const itemRef = doc(db, "players", uid, "characters", characterId, "itens", EGG_INCUBATOR_ITEM_ID);
      const itemMetaRef = doc(db, "players", uid, "characters", characterId, "itens", "_meta");
      const [itemSnap, metaSnap] = await Promise.all([tx.get(itemRef), tx.get(itemMetaRef)]);
      const amount = Math.max(1, Math.trunc(Number(freshEntitlement.benefits?.incubators || 1)));
      const currentQty = Math.max(0, Number(itemSnap.data()?.quantity || 0));
      const totalQuantity = Math.max(0, Number(metaSnap.data()?.totalQuantity || 0));
      tx.set(itemRef, buildInventoryDoc({ id: EGG_INCUBATOR_ITEM_ID, name: "Incubadora", description: "Usada para chocar ovos que exigem incubadora.", quantity: currentQty + amount }), { merge: true });
      tx.set(itemMetaRef, { totalQuantity: totalQuantity + amount, limit: args.itemCapacityLimit, updatedAt: serverTimestamp() }, { merge: true });
    } else if (productType === "iv_reset") {
      const itemRef = doc(db, "players", uid, "characters", characterId, "itens", "iv-reset-token");
      const itemMetaRef = doc(db, "players", uid, "characters", characterId, "itens", "_meta");
      const [itemSnap, metaSnap] = await Promise.all([tx.get(itemRef), tx.get(itemMetaRef)]);
      const amount = Math.max(1, Math.trunc(Number(freshEntitlement.benefits?.ivResetCount || 1)));
      const currentQty = Math.max(0, Number(itemSnap.data()?.quantity || 0));
      const totalQuantity = Math.max(0, Number(metaSnap.data()?.totalQuantity || 0));
      tx.set(itemRef, buildInventoryDoc({ id: "iv-reset-token", name: "Reset IV", description: "Reseta os IVs do Pokemon alvo.", quantity: currentQty + amount, effectType: "RESET_IV" }), { merge: true });
      tx.set(itemMetaRef, { totalQuantity: totalQuantity + amount, limit: args.itemCapacityLimit, updatedAt: serverTimestamp() }, { merge: true });
    } else if (route.kind === "biome_access" || productType === "biome_ticket" || (productType === "ticket" && (ticketType === "biome" || ticketSubtype === "biome"))) {
      const biomeId = parseMetadataString(benefits, "biomeId");
      if (!biomeId) throw new Error("Esse ticket nao possui bioma configurado.");
      const accessDays = Math.max(1, Math.trunc(parseMetadataNumber(benefits, "biomeAccessDays", 7)));
      const accessRef = doc(db, "players", uid, "characters", characterId, "biome_access", biomeId);
      const validUntilMs = Number(freshEntitlement.validUntilMs || 0) || Date.now() + accessDays * 24 * 60 * 60 * 1000;
      tx.set(accessRef, { biomeId, source: "monetization_product", productId: freshEntitlement.productId, productCode: freshEntitlement.productCode || null, validUntilMs, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    } else if (productType === "mystery_egg" || productType === "egg" || productType === "gym_type_egg") {
      const babySpeciesIds = parseMetadataStringList(benefits, "babySpeciesIds").map((value) => Math.trunc(Number(value))).filter((value) => value > 0);
      const pseudoSpeciesIds = parseMetadataStringList(benefits, "pseudoLegendarySpeciesIds").map((value) => Math.trunc(Number(value))).filter((value) => value > 0);
      const pseudoChance = Math.max(0, Math.min(100, parseMetadataNumber(benefits, "pseudoLegendaryChancePercent", 5)));
      const typedSpeciesId = eggType === "type" ? pickTypeEggSpecies(parseMetadataString(benefits, "pokemonType") || String(productInfo.metadata?.pokemonType || "")) : null;
      const sourcePool = pseudoSpeciesIds.length > 0 && Math.random() * 100 < pseudoChance ? pseudoSpeciesIds : babySpeciesIds;
      const speciesId = typedSpeciesId || sourcePool[Math.floor(Math.random() * Math.max(1, sourcePool.length))] || 172;
      const eggRef = doc(collection(db, "players", uid, "characters", characterId, "eggs"));
      tx.set(eggRef, { speciesId, speciesName: getSpeciesName(speciesId), stepsRequired: 1024, stepsProgress: 0, inheritedEggMoves: [], parentSpeciesIds: [], status: "incubating", source: "manual", hatchMode: "steps", readyAtMs: null, requiresIncubator: true, incubatorAssignedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    } else {
      throw new Error("Esse tipo de item ainda nao possui entrega manual pela mochila.");
    }

    tx.set(entitlementRef, { claimedAt: serverTimestamp(), claimedByCharacterId: characterId, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  });
}


export async function allocateAccountBackpackRewardToCharacter(args: {
  uid: string;
  characterId: string;
  reward: PlayerAccountBackpackEntry;
}) {
  const uid = String(args.uid || "").trim();
  const characterId = String(args.characterId || "").trim();
  const reward = args.reward;
  if (!uid || !characterId) throw new Error("Sessao invalida.");
  if (!reward?.id) throw new Error("Recompensa invalida.");

  return runTransaction(db, async (tx) => {
    const rewardRef = doc(db, "players", uid, "accountBackpack", reward.id);
    const rewardSnap = await tx.get(rewardRef);
    if (!rewardSnap.exists()) throw new Error("Recompensa nao encontrada.");
    const freshReward = {
      id: rewardSnap.id,
      ...(rewardSnap.data() as Omit<PlayerAccountBackpackEntry, "id">),
    };
    if (freshReward.status !== "pending") throw new Error("Essa recompensa ja foi distribuida.");
    if (freshReward.deliveryScope !== "character_backpack") {
      throw new Error("Essa recompensa nao precisa de distribuicao manual.");
    }

    if (freshReward.rewardType === "item_config") {
      const itemId = String(
        freshReward.itemConfigId || (freshReward.metadata as Record<string, unknown> | null)?.itemId || ""
      )
        .trim()
        .toLowerCase();
      if (!itemId) throw new Error("Item da mochila sem itemConfigId.");
      const itemCfgRef = doc(db, "itemsConfig", itemId);
      const itemCfgSnap = await tx.get(itemCfgRef);
      if (!itemCfgSnap.exists()) throw new Error("Item configurado nao encontrado.");
      const itemCfg = itemCfgSnap.data() as Record<string, unknown>;
      const category = String(itemCfg.category || "").trim().toLowerCase();
      const isPokeball = category === "pokebola";
      const colName = isPokeball ? "pokeballs" : "itens";
      const itemRef = doc(db, "players", uid, "characters", characterId, colName, itemId);
      const metaRef = doc(db, "players", uid, "characters", characterId, colName, "_meta");
      const [itemSnap, metaSnap] = await Promise.all([tx.get(itemRef), tx.get(metaRef)]);
      const currentQty = Math.max(0, Number(itemSnap.data()?.quantity || 0));
      const totalQuantity = Math.max(0, Number(metaSnap.data()?.totalQuantity || 0));
      tx.set(
        itemRef,
        {
          id: itemId,
          kind: isPokeball ? "POKEBALL" : "ITEM",
          name: String(itemCfg.itemName || freshReward.name || itemId),
          description: String(itemCfg.descriptionPtBr || itemCfg.effectPtBr || "Item distribuido pela conta."),
          quantity: currentQty + Math.max(1, Number(freshReward.quantity || 1)),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(
        metaRef,
        {
          totalQuantity: totalQuantity + Math.max(1, Number(freshReward.quantity || 1)),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      const type = String(freshReward.productType || "").toLowerCase();
      if (type === "incubator") {
        const itemRef = doc(db, "players", uid, "characters", characterId, "itens", "egg-incubator");
        const metaRef = doc(db, "players", uid, "characters", characterId, "itens", "_meta");
        const [itemSnap, metaSnap] = await Promise.all([tx.get(itemRef), tx.get(metaRef)]);
        const add = Math.max(1, Number(freshReward.benefits?.incubators || 1));
        const currentQty = Math.max(0, Number(itemSnap.data()?.quantity || 0));
        const totalQuantity = Math.max(0, Number(metaSnap.data()?.totalQuantity || 0));
        tx.set(itemRef, { id: "egg-incubator", kind: "ITEM", name: "Incubadora", description: "Usada para chocar ovos que exigem incubadora.", quantity: currentQty + add, updatedAt: serverTimestamp() }, { merge: true });
        tx.set(metaRef, { totalQuantity: totalQuantity + add, updatedAt: serverTimestamp() }, { merge: true });
      } else if (type == "iv_reset") {
        const itemRef = doc(db, "players", uid, "characters", characterId, "itens", "iv-reset-token");
        const metaRef = doc(db, "players", uid, "characters", characterId, "itens", "_meta");
        const [itemSnap, metaSnap] = await Promise.all([tx.get(itemRef), tx.get(metaRef)]);
        const add = Math.max(1, Number(freshReward.benefits?.ivResetCount || 1));
        const currentQty = Math.max(0, Number(itemSnap.data()?.quantity || 0));
        const totalQuantity = Math.max(0, Number(metaSnap.data()?.totalQuantity || 0));
        tx.set(itemRef, { id: "iv-reset-token", kind: "ITEM", name: "Reset IV", description: "Reseta os IVs do Pokemon alvo.", quantity: currentQty + add, effectType: "RESET_IV", updatedAt: serverTimestamp() }, { merge: true });
        tx.set(metaRef, { totalQuantity: totalQuantity + add, updatedAt: serverTimestamp() }, { merge: true });
      } else if (type === "biome_ticket") {
        const biomeId = parseMetadataString(freshReward.benefits || null, "biomeId");
        if (!biomeId) throw new Error("Ticket sem biomeId configurado.");
        const accessRef = doc(db, "players", uid, "characters", characterId, "biome_access", biomeId);
        tx.set(accessRef, { biomeId, source: "account_backpack", productId: freshReward.productId || null, productCode: freshReward.productCode || null, validUntilMs: Date.now() + Math.max(1, parseMetadataNumber(freshReward.benefits || null, "biomeAccessDays", 7)) * 24 * 60 * 60 * 1000, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
      } else if (type === "mystery_egg" || type === "egg") {
        const eggRef = doc(collection(db, "players", uid, "characters", characterId, "eggs"));
        tx.set(eggRef, { speciesId: 172, speciesName: getSpeciesName(172), stepsRequired: 1024, stepsProgress: 0, inheritedEggMoves: [], parentSpeciesIds: [], status: "incubating", source: "account_backpack", hatchMode: "steps", readyAtMs: null, requiresIncubator: true, incubatorAssignedAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
      } else {
        throw new Error("Esse tipo de recompensa ainda nao possui distribuicao manual.");
      }
    }

    const historyRef = doc(collection(db, "players", uid, "accountDistributionHistory"));
    tx.set(historyRef, {
      accountBackpackEntryId: freshReward.id,
      rewardType: freshReward.rewardType,
      rewardName: freshReward.name,
      quantity: Math.max(1, Number(freshReward.quantity || 1)),
      characterId,
      source: freshReward.source,
      sourceOrderId: freshReward.sourceOrderId || null,
      sourcePlanId: freshReward.sourcePlanId || null,
      sourceProductId: freshReward.sourceProductId || freshReward.productId || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    tx.delete(rewardRef);
    return true;
  });
}





