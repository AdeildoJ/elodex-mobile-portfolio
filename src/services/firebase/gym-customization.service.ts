import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "./firebaseConfig";

export type GymCustomizationKind = "npc" | "scenario";

export type PlayerGymCustomizationUnlocks = {
  npcIds: string[];
  scenarioIds: string[];
};

type PurchaseGymCustomizationInput = {
  uid: string;
  characterId: string;
  kind: GymCustomizationKind;
  itemId: string;
  itemName: string;
  price: number;
  imageUrl?: string | null;
};

function normalizeId(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUid(value: unknown) {
  return String(value || "").trim();
}

function unlockCollectionName(kind: GymCustomizationKind) {
  return kind === "npc" ? "gymNpcUnlocks" : "gymScenarioUnlocks";
}

function inventoryItemId(kind: GymCustomizationKind, itemId: string) {
  return `${kind === "npc" ? "gym-npc" : "gym-scenario"}-${itemId}`;
}

export function listenPlayerGymCustomizationUnlocks(
  uid: string,
  cb: (value: PlayerGymCustomizationUnlocks) => void
) {
  let npcIds: string[] = [];
  let scenarioIds: string[] = [];

  const emit = () => {
    cb({ npcIds, scenarioIds });
  };

  const unsubNpcs = onSnapshot(collection(db, "players", uid, "gymNpcUnlocks"), (snap) => {
    npcIds = snap.docs.map((row) => normalizeId(row.id)).filter(Boolean);
    emit();
  });

  const unsubScenarios = onSnapshot(collection(db, "players", uid, "gymScenarioUnlocks"), (snap) => {
    scenarioIds = snap.docs.map((row) => normalizeId(row.id)).filter(Boolean);
    emit();
  });

  return () => {
    unsubNpcs();
    unsubScenarios();
  };
}

export async function purchaseGymCustomizationWithEcoins(input: PurchaseGymCustomizationInput) {
  const uid = normalizeUid(input.uid);
  const characterId = String(input.characterId || "").trim();
  const itemId = normalizeId(input.itemId);
  const itemName = String(input.itemName || itemId || "Item").trim();
  const imageUrl = String(input.imageUrl || "").trim() || null;
  const kind = input.kind;
  const price = Math.max(0, Number(input.price || 0));

  if (!uid || !characterId) throw new Error("Sessao invalida para compra.");
  if (!itemId) throw new Error("Item invalido para compra.");
  if (price <= 0) throw new Error("Preco em ECoins invalido.");

  const playerRef = doc(db, "players", uid);
  const unlockRef = doc(db, "players", uid, unlockCollectionName(kind), itemId);
  const itemRef = doc(db, "players", uid, "characters", characterId, "itens", inventoryItemId(kind, itemId));
  const itemMetaRef = doc(db, "players", uid, "characters", characterId, "itens", "_meta");
  const historyRef = doc(collection(db, "players", uid, "monetizationHistory"));
  const txRef = doc(collection(db, "players", uid, "characters", characterId, "transactions"));

  await runTransaction(db, async (tx) => {
    const [playerSnap, unlockSnap, itemSnap, itemMetaSnap] = await Promise.all([
      tx.get(playerRef),
      tx.get(unlockRef),
      tx.get(itemRef),
      tx.get(itemMetaRef),
    ]);
    if (unlockSnap.exists()) {
      throw new Error(kind === "scenario" ? "Esse cenario ja foi desbloqueado." : "Esse NPC ja foi desbloqueado.");
    }
    if (itemSnap.exists()) {
      throw new Error(kind === "scenario" ? "Esse cenario ja esta na mochila aguardando ativacao." : "Esse NPC ja esta na mochila aguardando ativacao.");
    }

    const currentBalance = Math.max(0, Number(playerSnap.data()?.ecoinBalance || 0));
    if (currentBalance < price) throw new Error("Saldo insuficiente de ECoins.");
    const nextBalance = currentBalance - price;
    const currentTotalQuantity = Math.max(0, Number(itemMetaSnap.data()?.totalQuantity || 0));

    tx.set(
      playerRef,
      {
        ecoinBalance: nextBalance,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(
      itemRef,
      {
        id: inventoryItemId(kind, itemId),
        kind: "ITEM",
        name: itemName,
        description:
          kind === "scenario"
            ? "Ative na mochila para liberar este cenario na gestao do GYM."
            : "Ative na mochila para liberar este NPC na gestao do GYM.",
        quantity: 1,
        effectType: kind === "scenario" ? "UNLOCK_GYM_SCENARIO" : "UNLOCK_GYM_NPC",
        imageUrl,
        metadata: {
          customizationKind: kind,
          itemId,
          scenarioId: kind === "scenario" ? itemId : null,
          npcId: kind === "npc" ? itemId : null,
          source: "ecoin_purchase",
          pricePaid: price,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(
      itemMetaRef,
      {
        totalQuantity: currentTotalQuantity + 1,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(
      historyRef,
      {
        type: "purchase",
        source: "system",
        status: "approved",
        pricePaid: price,
        itemId,
        itemType: "product",
        itemName,
        amountPaid: price,
        currency: "ECOIN",
        customizationKind: kind,
        consumedByCharacterId: characterId,
        deliveryStatus: "sent_to_bag",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(
      txRef,
      {
        type: "gym_customization_purchase",
        paymentType: "ECOIN",
        itemId,
        itemName,
        customizationKind: kind,
        quantity: 1,
        unitPrice: price,
        totalPaid: price,
        status: "approved",
        consumedCurrency: "ECOIN",
        deliveryStatus: "sent_to_bag",
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}
