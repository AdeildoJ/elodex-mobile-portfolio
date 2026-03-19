import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where } from "firebase/firestore";

import { auth, db } from "../../services/firebase/firebaseConfig";
import { getMonetizationProducts, type MonetizationProduct } from "../../services/firebase/monetization.service";
import { isGymMainTeamSlotProduct as isGymMainTeamSlotProductRoute, resolveProductRoute } from "../../services/monetization/product-routing.service";
import {
  listenPlayerGymCustomizationUnlocks,
  purchaseGymCustomizationWithEcoins,
  type PlayerGymCustomizationUnlocks,
} from "../../services/firebase/gym-customization.service";
import { COLORS } from "../../theme/colors";
import itemsDex from "../../data/items/items.json";
import ShopPixModal from "./ShopPixModal";
import ShopCheckoutModal from "./ShopCheckoutModal";

type SellMode = "game" | "ecoin" | "both";
type OnlineMethod = "PIX" | "CREDIT" | "DEBIT";
type ShopGrantType = "inventory" | "biome_access";

type ShopConfigDoc = {
  saleEnabled?: boolean;
  sellMode?: SellMode | "real";
  gamePrice?: number | null;
  ecoinPrice?: number | null;
  realPrice?: number | null;
  pixPaymentUrl?: string;
  creditPaymentUrl?: string;
  debitPaymentUrl?: string;
  paymentUrlPix?: string;
  paymentUrlCredit?: string;
  paymentUrlDebit?: string;
  grantType?: ShopGrantType;
  biomeAccessBiomeId?: string | null;
  biomeAccessDurationHours?: number | null;
};

type CatalogItem = {
  id: string;
  name?: string | null;
  descriptionPtBr?: string | null;
  effectPtBr?: string | null;
  category?: string | null;
};

type ShopItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: "ITEM" | "POKEBALL";
  imageUrl?: string | null;
  sellMode: SellMode;
  gamePrice: number | null;
  realPrice: number | null;
  grantType: ShopGrantType;
  biomeAccessBiomeId?: string | null;
  biomeAccessDurationHours?: number | null;
  paymentUrls: Partial<Record<OnlineMethod, string>>;
};

type Props = {
  uid: string;
  characterId: string;
  currentCoins: number;
  onCoinsChanged?: (nextCoins: number) => void;
  onInventoryChanged?: () => Promise<void> | void;
};

type PaymentOrder = {
  id: string;
  itemId: string;
  itemName: string;
  itemKind: "ITEM" | "POKEBALL";
  qty: number;
  method: OnlineMethod;
  status: "pending" | "approved" | "failed" | "canceled";
  total: number;
  deliveredAt?: unknown;
};

type PixOrderSession = {
  orderId: string;
  itemName: string;
  total: number;
  qrCodeBase64?: string | null;
  copiaECola?: string | null;
  expiresAt?: string | null;
};

type CheckoutOrderSession = {
  orderId: string;
  itemName: string;
  total: number;
  checkoutUrl: string;
  orderPath: string;
};

type MonetizedDeliveryInfo = {
  destinationScope: "character" | "account";
  destinationKind:
    | "character_bag"
    | "eggs"
    | "biome_access"
    | "account"
    | "gym_ticket"
    | "trainer_license"
    | "battle_castle_ticket"
    | "exclusive_event_ticket"
    | "gym_global";
  successMessage: string;
  checkoutMessage: string;
  confirmationHint: string;
};

type SelectedOffer =
  | { kind: "shop"; item: ShopItem }
  | { kind: "monetization"; product: MonetizationProduct };

type GymCustomizationStoreItem = {
  id: string;
  kind: "npc" | "scenario";
  name: string;
  description: string;
  imageUrl?: string | null;
  price: number;
};

const PAYMENT_API_BASE_URL = (process.env.EXPO_PUBLIC_PAYMENT_API_BASE_URL || "").replace(/\/$/, "");
const DEBUG_ECOIN_FLOW = true;

const BALL_BONUS: Record<string, number> = {
  "poke-ball": 1,
  "great-ball": 1.5,
  "ultra-ball": 2,
  "master-ball": 255,
};

const ITEM_EFFECTS: Record<
  string,
  { effectType?: "HEAL" | "REVIVE" | "LEVEL_UP"; healAmount?: number; revivePercent?: number; levelGain?: number }
> = {
  potion: { effectType: "HEAL", healAmount: 20 },
  "super-potion": { effectType: "HEAL", healAmount: 60 },
  "hyper-potion": { effectType: "HEAL", healAmount: 120 },
  "max-potion": { effectType: "HEAL", healAmount: 9999 },
  revive: { effectType: "REVIVE", revivePercent: 50 },
  "max-revive": { effectType: "REVIVE", revivePercent: 100 },
  "rare-candy": { effectType: "LEVEL_UP", levelGain: 1 },
};

function n(v: unknown, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function formatName(raw: string) {
  return raw
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function getItemImageUrl(itemId: string) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${itemId}.png`;
}

function isCharacterDeliveredProduct(product: Pick<MonetizationProduct, "type" | "benefits" | "configuration"> | unknown) {
  const rawProduct = (product && typeof product === "object" ? product : null) as
    | Pick<MonetizationProduct, "type" | "benefits" | "configuration">
    | null;
  const normalized = String(rawProduct?.type ?? product ?? "").trim().toLowerCase();
  const productCode = String((rawProduct as { code?: string | null } | null)?.code || "").trim().toLowerCase();
  const productId = String((rawProduct as { id?: string | null } | null)?.id || "").trim().toLowerCase();
  const productName = String((rawProduct as { name?: string | null } | null)?.name || "").trim().toLowerCase();
  const slotScope = String(
    rawProduct?.benefits?.metadata?.slotScope ??
      (rawProduct?.configuration && typeof rawProduct.configuration === "object"
        ? (rawProduct.configuration as Record<string, unknown>).slotScope
        : "")
  )
    .trim()
    .toLowerCase();
  const gymMainTeamSlots = Number(rawProduct?.benefits?.gymMainTeamSlots || 0);
  const gymDefenseSlotsAdded = Number(rawProduct?.benefits?.gymDefenseSlotsAdded || 0);
  const storeCategory = String(rawProduct?.benefits?.metadata?.storeCategory || "").trim().toLowerCase();
  if (normalized === "slot" && slotScope === "gym") return true;
  if (normalized === "gym_main_team_slot") return true;
  if (productCode === "gym-main-team-slot" || productId === "gym-main-team-slot") return true;
  if (productCode === "slot-de-defesa" || productId === "slot-de-defesa") return true;
  if (
    (gymMainTeamSlots > 0 || gymDefenseSlotsAdded > 0) &&
    (
      storeCategory === "gym" ||
      normalized.includes("gym") ||
      productCode.includes("gym-main-team-slot") ||
      productId.includes("gym-main-team-slot") ||
      productCode.includes("slot-de-defesa") ||
      productId.includes("slot-de-defesa") ||
      productName.includes("slot de defesa") ||
      productName.includes("slot do time principal")
    )
  ) {
    return true;
  }
  return ["incubator", "iv_reset", "biome_ticket", "mystery_egg", "egg"].includes(normalized);
}

function resolveMonetizedDeliveryInfo(product: Pick<MonetizationProduct, "id" | "code" | "name" | "type" | "benefits" | "configuration"> | unknown): MonetizedDeliveryInfo {
  const route = resolveProductRoute(product as any);
  return {
    destinationScope: route.scope,
    destinationKind: route.kind,
    successMessage: route.message,
    checkoutMessage: route.checkoutMessage,
    confirmationHint: route.confirmationHint,
  };
}

function isMobileSupportedMonetizedProduct(product: Pick<MonetizationProduct, "id" | "code" | "name" | "type" | "benefits" | "configuration"> | unknown) {
  const route = resolveProductRoute(product as any);
  return ["character_bag", "eggs", "biome_access", "gym_ticket", "trainer_license"].includes(route.kind);
}

function isGymMainTeamSlotProduct(product: Pick<MonetizationProduct, "id" | "code" | "type" | "benefits" | "configuration"> | unknown) {
  return isGymMainTeamSlotProductRoute(product as any);
}

function resolveSellMode(raw: unknown): SellMode {
  if (raw === "real") return "ecoin";
  if (raw === "game" || raw === "ecoin" || raw === "both") return raw;
  return "game";
}

function resolveGrantType(raw: unknown): ShopGrantType {
  return raw === "biome_access" ? "biome_access" : "inventory";
}

function getCatalogById(itemId: string): CatalogItem | null {
  return (itemsDex as Record<string, CatalogItem>)[itemId] ?? null;
}

function toInventoryDoc(item: ShopItem, qty: number) {
  const bonus = BALL_BONUS[item.id] ?? 1;
  const itemFx = ITEM_EFFECTS[item.id] ?? {};

  if (item.kind === "POKEBALL") {
    return {
      id: item.id,
      kind: "POKEBALL" as const,
      name: item.name,
      description: item.description,
      quantity: qty,
      captureBonus: bonus,
      isMasterBall: item.id === "master-ball",
      updatedAt: serverTimestamp(),
    };
  }

  return {
    id: item.id,
    kind: "ITEM" as const,
    name: item.name,
    description: item.description,
    quantity: qty,
    ...itemFx,
    updatedAt: serverTimestamp(),
  };
}

function resolveShopItemSuccessMessage(item: ShopItem | null | undefined, qty = 1) {
  if (!item) return "Pagamento aprovado e compra aplicada com sucesso.";
  if (item.grantType === "biome_access") {
    return "Pagamento aprovado e acesso ao bioma liberado para este personagem.";
  }
  return `${Math.max(1, qty)}x ${item.name} enviado para a mochila do personagem.`;
}

export function Loja({ uid, characterId, currentCoins, onCoinsChanged, onInventoryChanged }: Props) {
  // which section of the store is visible
  const [section, setSection] = useState<"poke" | "elo">("poke");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [monetizedItems, setMonetizedItems] = useState<MonetizationProduct[]>([]);
  const [gymCustomizationCatalog, setGymCustomizationCatalog] = useState<GymCustomizationStoreItem[]>([]);
  const [gymCustomizationUnlocks, setGymCustomizationUnlocks] = useState<PlayerGymCustomizationUnlocks>({ npcIds: [], scenarioIds: [] });
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [pixSession, setPixSession] = useState<PixOrderSession | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<CheckoutOrderSession | null>(null);

  const [ecoinBalance, setEcoinBalance] = useState<number>(0);

  const [selectedOffer, setSelectedOffer] = useState<SelectedOffer | null>(null);
  const [qty, setQty] = useState(1);
  const [method, setMethod] = useState<"GAME" | "ECOIN" | OnlineMethod>("GAME");

  const pendingOrders = useMemo(
    () => paymentOrders.filter((o) => o.status === "pending"),
    [paymentOrders]
  );

  // filter items according to selected section
  const visibleItems = useMemo(() => {
    if (section === "elo") {
      return monetizedItems
         .filter((item) => item.status === "active" && item.storeVisible !== false && isMobileSupportedMonetizedProduct(item))
        .map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          category: "monetized",
          kind: "ITEM" as const,
          imageUrl: item.imageUrl || null,
          sellMode: "game" as const,
          gamePrice: Math.max(0, n(item.price, 0)),
          realPrice: null,
          grantType: "inventory" as const,
          paymentUrls: {},
        }));
    }
    return shopItems.filter((it) => it.sellMode === "game" || it.sellMode === "both");
  }, [section, monetizedItems, shopItems]);

  const visibleMonetizedItems = useMemo(() => {
    if (section !== "elo") return [];
    return monetizedItems .filter((item) => item.status === "active" && item.storeVisible !== false && isMobileSupportedMonetizedProduct(item));
  }, [monetizedItems, section]);
  const visibleGymCustomizationItems = useMemo(() => {
    if (section !== "elo") return [];
    const unlockedNpcIds = new Set(gymCustomizationUnlocks.npcIds);
    const unlockedScenarioIds = new Set(gymCustomizationUnlocks.scenarioIds);
    return gymCustomizationCatalog.map((item) => ({
      ...item,
      unlocked: item.kind === "npc" ? unlockedNpcIds.has(item.id) : unlockedScenarioIds.has(item.id),
    }));
  }, [gymCustomizationCatalog, gymCustomizationUnlocks, section]);

  const canOpen = !!uid && !!characterId;

  const loadOrders = useCallback(async () => {
    if (!canOpen) return;
    const ordersSnap = await getDocs(collection(db, "players", uid, "characters", characterId, "paymentOrders"));
    const rows: PaymentOrder[] = [];
    ordersSnap.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      rows.push({
        id: d.id,
        itemId: String(data.itemId || ""),
        itemName: String(data.itemName || data.itemId || "Item"),
        itemKind: String(data.itemKind || "ITEM") === "POKEBALL" ? "POKEBALL" : "ITEM",
        qty: Math.max(1, n(data.qty, 1)),
        method: (String(data.method || "PIX").toUpperCase() as OnlineMethod),
        status: (String(data.status || "pending").toLowerCase() as PaymentOrder["status"]),
        total: Math.max(0, n(data.total, 0)),
        deliveredAt: data.deliveredAt,
      });
    });
    rows.sort((a, b) => b.total - a.total);

    for (const row of rows) {
      if (row.status === "approved" && !row.deliveredAt) {
        await deliverApprovedOrder(row);
      }
    }

    setPaymentOrders(rows);
  }, [canOpen, characterId, uid]);

  const deliverApprovedOrder = useCallback(
    async (order: PaymentOrder) => {
      const orderRef = doc(db, "players", uid, "characters", characterId, "paymentOrders", order.id);
      const colName = order.itemKind === "POKEBALL" ? "pokeballs" : "itens";
      const invRef = doc(db, "players", uid, "characters", characterId, colName, order.itemId);
      const metaRef = doc(db, "players", uid, "characters", characterId, colName, "_meta");
      const txRef = doc(collection(db, "players", uid, "characters", characterId, "transactions"));

      await runTransaction(db, async (tx) => {
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists()) return;
        const orderData = orderSnap.data() as Record<string, unknown>;

        const status = String(orderData.status || "pending").toLowerCase();
        const deliveredAt = orderData.deliveredAt;
        if (status !== "approved" || deliveredAt) return;

        const grantType = resolveGrantType(orderData.grantType);
        const addQty = Math.max(1, n(orderData.qty, 1));
        if (grantType === "biome_access") {
          const biomeId = String(orderData.biomeAccessBiomeId || "").trim().toLowerCase();
          const durationHours = Math.max(1, n(orderData.biomeAccessDurationHours, 24));
          if (!biomeId) throw new Error("Pedido de bioma sem biomeAccessBiomeId.");
          const accessRef = doc(db, "players", uid, "characters", characterId, "biome_access", biomeId);
          const accessSnap = await tx.get(accessRef);
          const nowMs = Date.now();
          const prevExpires = accessSnap.exists() ? n((accessSnap.data() as Record<string, unknown>).expiresAtMs, 0) : 0;
          const baseMs = Math.max(nowMs, prevExpires);
          const expiresAtMs = baseMs + durationHours * addQty * 60 * 60 * 1000;

          tx.set(
            accessRef,
            {
              biomeId,
              source: "shop",
              expiresAtMs,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          tx.set(
            orderRef,
            {
              deliveredAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          tx.set(txRef, {
            type: "biome_access_purchase",
            paymentType: String(orderData.method || order.method),
            itemId: order.itemId,
            itemName: String(orderData.itemName || order.itemName),
            biomeId,
            durationHours,
            quantity: addQty,
            unitPrice: Math.max(0, n(orderData.unitPrice, 0)),
            totalPaid: Math.max(0, n(orderData.total, 0)),
            status: "approved",
            paymentOrderId: order.id,
            createdAt: serverTimestamp(),
          });
          return;
        }

        const invSnap = await tx.get(invRef);
        const metaSnap = await tx.get(metaRef);

        const currentQty = invSnap.exists() ? Math.max(0, n(invSnap.data().quantity, 0)) : 0;
        const metaTotal = metaSnap.exists() ? Math.max(0, n(metaSnap.data().totalQuantity, 0)) : 0;
        const nextTotal = metaTotal + addQty;
        const limit = metaSnap.exists() ? n(metaSnap.data().limit, 0) : 0;
        if (limit > 0 && nextTotal > limit) throw new Error("Mochila cheia para entregar compra aprovada.");

        const catalog = getCatalogById(order.itemId);
        const normalizedItem: ShopItem = {
          id: order.itemId,
          name: String(orderData.itemName || order.itemName || order.itemId),
          description: String(
            orderData.itemDescription ||
              catalog?.descriptionPtBr ||
              catalog?.effectPtBr ||
              "Item comprado em pagamento online."
          ),
          category: String(catalog?.category || "outros"),
          kind: order.itemKind,
          sellMode: "ecoin",
          gamePrice: null,
          realPrice: Math.max(0, n(orderData.unitPrice, 0)),
          grantType: "inventory",
          paymentUrls: {},
        };
        const invDoc = toInventoryDoc(normalizedItem, currentQty + addQty);

        tx.set(invRef, { ...invDoc, updatedAt: serverTimestamp() }, { merge: true });
        tx.set(metaRef, { totalQuantity: nextTotal, updatedAt: serverTimestamp() }, { merge: true });
        tx.set(
          orderRef,
          {
            deliveredAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        tx.set(txRef, {
          type: "item_purchase",
          paymentType: String(orderData.method || order.method),
          itemId: order.itemId,
          itemName: String(orderData.itemName || order.itemName),
          quantity: addQty,
          unitPrice: Math.max(0, n(orderData.unitPrice, 0)),
          totalPaid: Math.max(0, n(orderData.total, 0)),
          status: "approved",
          paymentOrderId: order.id,
          createdAt: serverTimestamp(),
        });
      });

      await onInventoryChanged?.();
    },
    [characterId, onInventoryChanged, uid]
  );

  const loadShop = useCallback(async () => {
    if (!canOpen) return;
    setLoading(true);
    try {
      const [snap, products, npcSnap, scenarioSnap] = await Promise.all([
        getDocs(query(collection(db, "itemsConfig"), where("saleEnabled", "==", true))),
        getMonetizationProducts(),
        getDocs(collection(db, "npcs")),
        getDocs(collection(db, "scenarios")),
      ]);
      const rows: ShopItem[] = [];

      snap.forEach((d) => {
        const cfg = d.data() as ShopConfigDoc;
        const sellMode = resolveSellMode(cfg.sellMode);
        const grantType = resolveGrantType(cfg.grantType);
        const biomeAccessBiomeId = String(cfg.biomeAccessBiomeId || "").trim().toLowerCase() || null;
        const biomeAccessDurationHours = cfg.biomeAccessDurationHours == null ? null : Math.max(1, n(cfg.biomeAccessDurationHours, 24));
        const gamePrice = cfg.gamePrice == null ? null : n(cfg.gamePrice, 0);
        const realPriceRaw = cfg.ecoinPrice ?? cfg.realPrice;
        const realPrice = realPriceRaw == null ? null : n(realPriceRaw, 0);

        const cat = getCatalogById(d.id);
        const category = String(cat?.category || "outros");
        const kind = category === "pokebola" ? "POKEBALL" : "ITEM";

        rows.push({
          id: d.id,
          name: formatName(String(cat?.name || d.id)),
          description:
            grantType === "biome_access"
              ? `Acesso temporario ao bioma ${biomeAccessBiomeId || "configurado"} por ${biomeAccessDurationHours || 24}h.`
              : String(cat?.descriptionPtBr || cat?.effectPtBr || "Item disponivel para compra na loja."),
          category,
          kind,
          imageUrl: null,
          sellMode,
          gamePrice,
          realPrice,
          grantType,
          biomeAccessBiomeId,
          biomeAccessDurationHours,
          paymentUrls: {
            PIX: String(cfg.pixPaymentUrl || cfg.paymentUrlPix || ""),
            CREDIT: String(cfg.creditPaymentUrl || cfg.paymentUrlCredit || ""),
            DEBIT: String(cfg.debitPaymentUrl || cfg.paymentUrlDebit || ""),
          },
        });
      });

      rows.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "POKEBALL" ? -1 : 1;
        return a.name.localeCompare(b.name, "pt-BR");
      });
      const customizationRows: GymCustomizationStoreItem[] = [
        ...npcSnap.docs
          .map((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            if (!Boolean(data.isCommercialized)) return null;
            const price = Math.max(0, n(data.ecoinPrice, 0));
            if (price <= 0) return null;
            return {
              id: docSnap.id,
              kind: "npc" as const,
              name: String(data.nome || docSnap.id),
              description: `NPC para uso em GYM.${String(data.role || "").trim() ? ` Funcao: ${String(data.role || "").trim()}.` : ""}`,
              imageUrl: String(data.imageUrl || ""),
              price,
            };
          })
          .filter(Boolean) as GymCustomizationStoreItem[],
        ...scenarioSnap.docs
          .map((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            if (data.isActive === false || !Boolean(data.isCommercialized)) return null;
            const price = Math.max(0, n(data.ecoinPrice, 0));
            if (price <= 0) return null;
            return {
              id: docSnap.id,
              kind: "scenario" as const,
              name: String(data.name || docSnap.id),
              description: "Cenario visual desbloqueavel para selecao manual no GYM.",
              imageUrl: String(data.processedImageUrl || data.imageUrl || ""),
              price,
            };
          })
          .filter(Boolean) as GymCustomizationStoreItem[],
      ].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "scenario" ? -1 : 1;
        return a.name.localeCompare(b.name, "pt-BR");
      });
      setShopItems(rows);
      setMonetizedItems(products);
      setGymCustomizationCatalog(customizationRows);
      await loadOrders();
    } finally {
      setLoading(false);
    }
  }, [canOpen, loadOrders]);

  useEffect(() => {
    loadShop();
  }, [loadShop]);

  useEffect(() => {
    if (!DEBUG_ECOIN_FLOW) return;
    console.log("[ECOIN_FLOW][store:context]", {
      uid,
      characterId,
      canOpen,
    });
  }, [canOpen, characterId, uid]);

  useEffect(() => {
    if (!uid) {
      setGymCustomizationUnlocks({ npcIds: [], scenarioIds: [] });
      return;
    }
    return listenPlayerGymCustomizationUnlocks(uid, setGymCustomizationUnlocks);
  }, [uid]);

  // load profile to show ecoin balance
  useEffect(() => {
    async function loadProfile() {
      if (!uid) return;
      const docRef = doc(db, "players", uid);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return;
      const data = snap.data() as Record<string, unknown>;
      setEcoinBalance(Math.max(0, n(data.ecoinBalance, 0)));
    }

    if (canOpen) {
      void loadProfile();
    }
  }, [canOpen, uid]);

  useEffect(() => {
    if (!canOpen || pendingOrders.length === 0) return;
    const timer = setInterval(() => {
      void loadOrders();
    }, 3500);
    return () => clearInterval(timer);
  }, [canOpen, loadOrders, pendingOrders.length]);

  useEffect(() => {
    if (!pixSession) return;
    const current = paymentOrders.find((order) => order.id === pixSession.orderId);
    if (!current) return;
    if (current.status === "approved") {
      setPixSession(null);
      const shopItem = shopItems.find((item) => item.id === current.itemId) || null;
      Alert.alert("Pagamento aprovado", resolveShopItemSuccessMessage(shopItem, current.qty));
      return;
    }
    if (current.status === "failed" || current.status === "canceled") {
      setPixSession(null);
      Alert.alert("Pagamento nao concluido", `Status atual: ${current.status}.`);
    }
  }, [paymentOrders, pixSession]);

  useEffect(() => {
    if (!checkoutSession) return;
    const current = paymentOrders.find((order) => order.id === checkoutSession.orderId);
    if (!current) return;
    if (current.status === "approved") {
      setCheckoutSession(null);
      const shopItem = shopItems.find((item) => item.id === current.itemId) || null;
      Alert.alert("Pagamento aprovado", resolveShopItemSuccessMessage(shopItem, current.qty));
      return;
    }
    if (current.status === "failed" || current.status === "canceled") {
      setCheckoutSession(null);
      Alert.alert("Pagamento nao concluido", `Status atual: ${current.status}.`);
    }
  }, [checkoutSession, paymentOrders]);

  function openShopItemModal(item: ShopItem) {
    if (section === "elo") {
      const product = monetizedItems.find((entry) => entry.id === item.id);
      if (product) {
        openMonetizedProductModal(product);
        return;
      }
    }
    setSelectedOffer({ kind: "shop", item });
    setQty(1);
    setMethod("GAME");
  }

  function openMonetizedProductModal(product: MonetizationProduct) {
    setSelectedOffer({ kind: "monetization", product });
    setQty(1);
    setMethod("ECOIN");
  }

  async function purchaseWithCoins(item: ShopItem, purchaseQty: number) {
    const unit = Math.max(0, n(item.gamePrice, 0));
    if (unit <= 0) throw new Error("Preco em moedas do jogo invalido.");
    const total = unit * purchaseQty;

    const charRef = doc(db, "players", uid, "characters", characterId);
    const colName = item.kind === "POKEBALL" ? "pokeballs" : "itens";
    const invRef = doc(db, "players", uid, "characters", characterId, colName, item.id);
    const metaRef = doc(db, "players", uid, "characters", characterId, colName, "_meta");
    const txRef = doc(collection(db, "players", uid, "characters", characterId, "transactions"));
    const isBiomeAccess = item.grantType === "biome_access";

    let nextCoins = 0;

    await runTransaction(db, async (tx) => {
      const charSnap = await tx.get(charRef);
      if (!charSnap.exists()) throw new Error("Personagem nao encontrado.");

      const charData = charSnap.data() as Record<string, unknown>;
      const current = Math.max(0, n(charData.pokeCoins, 0));
      if (current < total) throw new Error("Saldo insuficiente de PokeCoins.");

      nextCoins = current - total;
      tx.set(
        charRef,
        {
          pokeCoins: nextCoins,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (isBiomeAccess) {
        const biomeId = String(item.biomeAccessBiomeId || "").trim().toLowerCase();
        const durationHours = Math.max(1, n(item.biomeAccessDurationHours, 24));
        if (!biomeId) throw new Error("Passe de bioma sem biomeAccessBiomeId.");
        const accessRef = doc(db, "players", uid, "characters", characterId, "biome_access", biomeId);
        const accessSnap = await tx.get(accessRef);
        const nowMs = Date.now();
        const prevExpires = accessSnap.exists() ? n((accessSnap.data() as Record<string, unknown>).expiresAtMs, 0) : 0;
        const baseMs = Math.max(nowMs, prevExpires);
        const expiresAtMs = baseMs + durationHours * purchaseQty * 60 * 60 * 1000;
        tx.set(
          accessRef,
          {
            biomeId,
            source: "shop",
            expiresAtMs,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        tx.set(txRef, {
          type: "biome_access_purchase",
          paymentType: "POKECOINS",
          itemId: item.id,
          itemName: item.name,
          biomeId,
          durationHours,
          quantity: purchaseQty,
          unitPrice: unit,
          totalPaid: total,
          status: "approved",
          createdAt: serverTimestamp(),
        });
      } else {
        const invSnap = await tx.get(invRef);
        const metaSnap = await tx.get(metaRef);
        const currentQty = invSnap.exists() ? Math.max(0, n(invSnap.data().quantity, 0)) : 0;
        const metaTotal = metaSnap.exists() ? Math.max(0, n(metaSnap.data().totalQuantity, 0)) : 0;
        const nextTotal = metaTotal + purchaseQty;
        const limit = metaSnap.exists() ? n(metaSnap.data().limit, 0) : 0;
        if (limit > 0 && nextTotal > limit) {
          throw new Error(`Limite da mochila excedido (${nextTotal}/${limit}).`);
        }
        const nextDoc = toInventoryDoc(item, currentQty + purchaseQty);
        tx.set(
          invRef,
          {
            ...nextDoc,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        tx.set(
          metaRef,
          {
            totalQuantity: nextTotal,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        tx.set(txRef, {
          type: "item_purchase",
          paymentType: "POKECOINS",
          itemId: item.id,
          itemName: item.name,
          quantity: purchaseQty,
          unitPrice: unit,
          totalPaid: total,
          status: "approved",
          createdAt: serverTimestamp(),
        });
      }
    });

    onCoinsChanged?.(nextCoins);
    await onInventoryChanged?.();
  }

  async function purchaseMonetizedWithEcoins(product: MonetizationProduct, purchaseQty: number) {
    const total = Math.max(0, n(product.price, 0)) * purchaseQty;
    if (total <= 0) throw new Error("Preco em ECoins invalido.");
    const deliveryInfo = resolveMonetizedDeliveryInfo(product);
    const deliveryScope = deliveryInfo.destinationScope === "character" ? "character_backpack" : "account";
    const consumedByCharacterId = deliveryInfo.destinationScope === "character" ? characterId : "";
    if (deliveryInfo.destinationScope === "character" && !characterId) {
      throw new Error("Personagem atual nao identificado para entrega do item.");
    }

    const playerRef = doc(db, "players", uid);
    const historyRef = doc(collection(db, "players", uid, "monetizationHistory"));
    const txRef = doc(collection(db, "players", uid, "characters", characterId, "transactions"));
    const purchaseContext = "character_store";
    const isGymSlot = isGymMainTeamSlotProduct(product);

    let nextBalance = 0;
    let createdEntitlementId = "";

    if (DEBUG_ECOIN_FLOW) {
      console.log("[ECOIN_FLOW][purchase:start]", {
        uid,
        characterId,
        productId: product.id,
        productCode: product.code || null,
        productType: product.type,
        purchaseContext,
        deliveryScope,
        consumedByCharacterId: consumedByCharacterId || null,
        isGymSlot,
        total,
      });
    }

    await runTransaction(db, async (tx) => {
      const entitlementRef = doc(collection(db, "players", uid, "productEntitlements"));
      const itemRef = isGymSlot
        ? doc(db, "players", uid, "characters", characterId, "itens", "gym-main-team-slot-token")
        : null;
      const itemMetaRef = isGymSlot
        ? doc(db, "players", uid, "characters", characterId, "itens", "_meta")
        : null;

      const playerSnap = await tx.get(playerRef);
      const [itemSnap, metaSnap] =
        isGymSlot && itemRef && itemMetaRef
          ? await Promise.all([tx.get(itemRef), tx.get(itemMetaRef)])
          : [null, null];

      const currentBalance = Math.max(0, n(playerSnap.data()?.ecoinBalance, 0));
      if (currentBalance < total) throw new Error("Saldo insuficiente de ECoins.");
      nextBalance = currentBalance - total;

      let slotItemPayload: Record<string, unknown> | null = null;
      createdEntitlementId = entitlementRef.id;

      if (isGymSlot && itemRef && itemMetaRef) {
        const amount = Math.max(
          1,
          Math.trunc(
            Number(
              product.benefits?.gymDefenseSlotsAdded ||
                product.benefits?.gymMainTeamSlots ||
                (product.benefits?.metadata?.slotsAdded as number | undefined) ||
                1
            )
          )
        );
        const currentQty = Math.max(0, n(itemSnap?.data()?.quantity, 0));
        const totalQuantity = Math.max(0, n(metaSnap?.data()?.totalQuantity, 0));
        slotItemPayload = {
          id: "gym-main-team-slot-token",
          kind: "ITEM",
          name: "Slot do time principal do GYM",
          description: "Use na mochila do personagem para liberar um novo slot do time principal do GYM.",
          quantity: currentQty + amount,
          effectType: "ACTIVATE_GYM_MAIN_TEAM_SLOT",
          metadata: {
            source: "ecoin_character_store_purchase",
            productId: product.id,
            productCode: product.code || null,
            purchaseContext,
            deliveredCharacterId: characterId,
          },
          updatedAt: serverTimestamp(),
        };
        tx.set(itemRef, slotItemPayload, { merge: true });
        tx.set(
          itemMetaRef,
          {
            totalQuantity: totalQuantity + amount,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      tx.set(
        playerRef,
        {
          ecoinBalance: nextBalance,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(txRef, {
        type: "ecoin_product_purchase",
        paymentType: "ECOIN",
        itemId: product.id,
        itemName: product.name,
        quantity: purchaseQty,
        unitPrice: Math.max(0, n(product.price, 0)),
        totalPaid: total,
        status: "approved",
        consumedCurrency: "ECOIN",
        purchaseContext,
        consumedByCharacterId: consumedByCharacterId || null,
        createdAt: serverTimestamp(),
      });

      tx.set(historyRef, {
        type: "product_activation",
        source: "system",
        status: "active",
        itemId: product.id,
        itemType: "product",
        itemName: product.name,
        amountPaid: total,
        currency: "ECOIN",
        purchaseContext,
        consumedByCharacterId: consumedByCharacterId || null,
        ecoinAmount: total,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(
        entitlementRef,
        {
          entitlementId: entitlementRef.id,
          productId: product.id,
          productCode: product.code || null,
          productType: product.type,
          productName: product.name,
          benefits: product.benefits || null,
          quantity: purchaseQty,
          status: "active",
          source: "system",
          deliveryScope,
          consumedCurrency: "ECOIN",
          purchaseContext,
          consumedByCharacterId: consumedByCharacterId || null,
          claimedAt: isGymSlot ? serverTimestamp() : null,
          claimedByCharacterId: isGymSlot ? characterId : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (DEBUG_ECOIN_FLOW) {
        console.log("[ECOIN_FLOW][purchase:tx]", {
          uid,
          characterId,
          productId: product.id,
          productCode: product.code || null,
          productType: product.type,
          currentBalance,
          nextBalance,
          purchaseContext,
          deliveryScope,
          consumedByCharacterId: characterId,
          entitlementId: entitlementRef.id,
          entitlementPayload: {
            productId: product.id,
            productCode: product.code || null,
            productType: product.type,
            deliveryScope,
            purchaseContext,
            consumedByCharacterId: consumedByCharacterId || null,
            claimedImmediately: isGymSlot,
          },
          slotItemPayload,
        });
      }
    });

    setEcoinBalance(nextBalance);
    await onInventoryChanged?.();

    if (DEBUG_ECOIN_FLOW) {
      console.log("[ECOIN_FLOW][purchase:done]", {
        uid,
        characterId,
        productId: product.id,
        entitlementId: createdEntitlementId,
        nextBalance,
        directCharacterDelivery: isGymSlot,
      });
    }
  }

  async function purchaseGymCustomization(item: GymCustomizationStoreItem) {
    await purchaseGymCustomizationWithEcoins({
      uid,
      characterId,
      kind: item.kind,
      itemId: item.id,
      itemName: item.name,
      price: item.price,
      imageUrl: item.imageUrl,
    });
    setEcoinBalance((current) => Math.max(0, current - item.price));
  }

async function createOnlineOrder(item: ShopItem, purchaseQty: number, onlineMethod: OnlineMethod) {
    if (!PAYMENT_API_BASE_URL) {
      throw new Error(
        "EXPO_PUBLIC_PAYMENT_API_BASE_URL nao configurado no mobile. Exemplo: https://seu-admin.vercel.app"
      );
    }

    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error("Sessao expirada. Faca login novamente.");

    const res = await fetch(`${PAYMENT_API_BASE_URL}/api/payments/create-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        itemId: item.id,
        qty: purchaseQty,
        method: onlineMethod,
        characterId,
      }),
    });

    const raw = await res.text();
    let data: {
      checkoutUrl?: string;
      orderId?: string;
      error?: string;
      details?: unknown;
      mode?: string;
      qrCode_base64?: string;
      qrCode?: string;
      copiaECola?: string;
      expiresAt?: string;
    } = {};
    try {
      data = raw
        ? (JSON.parse(raw) as { checkoutUrl?: string; orderId?: string; error?: string; details?: unknown })
        : {};
    } catch {
      if (!res.ok) {
        throw new Error(`Falha ao iniciar pagamento (${res.status}). Resposta invalida do servidor.`);
      }
    }

    if (!res.ok) {
      const detailsText =
        typeof data.details === "string"
          ? data.details
          : data.details && typeof data.details === "object"
          ? JSON.stringify(data.details)
          : "";
      const message =
        data.error ||
        detailsText ||
        `Falha ao iniciar pagamento (${res.status}).`;
      throw new Error(message);
    }
    const orderId = String(data.orderId || "");
    const orderPath = `players/${uid}/characters/${characterId}/paymentOrders/${orderId}`;
    if (String(data.mode || "").toLowerCase() === "pix") {
      setPixSession({
        orderId,
        itemName: item.name,
        total: Math.max(0, n(item.realPrice, 0)) * purchaseQty,
        qrCodeBase64: String(data.qrCode_base64 || data.qrCode || "") || null,
        copiaECola: String(data.copiaECola || "") || null,
        expiresAt: String(data.expiresAt || "") || null,
      });
      await loadOrders();
      return;
    }

    const checkoutUrl = String(data.checkoutUrl || "");
    if (!checkoutUrl) throw new Error("Gateway nao retornou URL de checkout.");

    setCheckoutSession({
      orderId,
      itemName: item.name,
      total: Math.max(0, n(item.realPrice, 0)) * purchaseQty,
      checkoutUrl,
      orderPath,
    });

    await loadOrders();
    Alert.alert("Pedido criado", "Pagamento iniciado. Aguardando confirmacao do gateway.");
  }

  async function refreshOrderStatus(orderId: string) {
    const ref = doc(db, "players", uid, "characters", characterId, "paymentOrders", orderId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Record<string, unknown>;
    const status = String(data.status || "pending").toLowerCase();
    const shopItem = shopItems.find((item) => item.id === String(data.itemId || "")) || null;
    if (status === "approved") {
      Alert.alert("Pagamento aprovado", resolveShopItemSuccessMessage(shopItem, Math.max(1, n(data.qty, 1))));
    } else if (status === "failed" || status === "canceled") {
      Alert.alert("Pagamento nao aprovado", `Status atual: ${status}`);
    } else {
      Alert.alert("Pagamento pendente", "Ainda aguardando confirmacao do gateway.");
    }
    await loadOrders();
  }

  async function onConfirmPurchase() {
    if (!selectedOffer) return;
    const purchaseQty = Math.max(1, qty);

    try {
      setSubmitting(true);

      if (selectedOffer.kind === "shop" && method === "GAME") {
        await purchaseWithCoins(selectedOffer.item, purchaseQty);
        Alert.alert("Compra concluida", resolveShopItemSuccessMessage(selectedOffer.item, purchaseQty));
      } else if (selectedOffer.kind === "shop") {
        await createOnlineOrder(selectedOffer.item, purchaseQty, method as OnlineMethod);
      } else {
        await purchaseMonetizedWithEcoins(selectedOffer.product, purchaseQty);
        Alert.alert("Compra concluida", resolveMonetizedDeliveryInfo(selectedOffer.product).successMessage);
      }

      setSelectedOffer(null);
      setQty(1);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Falha ao processar compra.";
      Alert.alert("Loja", msg);
    } finally {
      setSubmitting(false);
    }
  }

  function renderPrice(item: ShopItem) {
    if (section === "elo") {
      return `${Math.max(0, n(item.gamePrice, 0))} ECoins`;
    }
    if (item.sellMode === "game") {
      return `Moedas: ${Math.max(0, n(item.gamePrice, 0))}`;
    }
    if (item.sellMode === "ecoin") {
      return `Dinheiro real: R$ ${Math.max(0, n(item.realPrice, 0)).toFixed(2)}`;
    }
    return `Moedas: ${Math.max(0, n(item.gamePrice, 0))} | Real: R$ ${Math.max(0, n(item.realPrice, 0)).toFixed(2)}`;
  }

  const selectedTotal = useMemo(() => {
    if (!selectedOffer) return 0;
    if (selectedOffer.kind === "monetization") {
      return Math.max(0, n(selectedOffer.product.price, 0)) * Math.max(1, qty);
    }
    if (method === "GAME") return Math.max(0, n(selectedOffer.item.gamePrice, 0)) * Math.max(1, qty);
    return Math.max(0, n(selectedOffer.item.realPrice, 0)) * Math.max(1, qty);
  }, [method, qty, selectedOffer]);

  if (!canOpen) {
    return (
      <View style={styles.root}>
        <Text style={styles.emptyText}>Sessao invalida para abrir a loja.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ShopPixModal
        visible={!!pixSession}
        title={pixSession?.itemName || "Pagamento PIX"}
        valueLabel={`R$ ${Math.max(0, pixSession?.total || 0).toFixed(2)}`}
        qrBase64={pixSession?.qrCodeBase64}
        copiaECola={pixSession?.copiaECola}
        expiresAt={pixSession?.expiresAt}
        onClose={() => setPixSession(null)}
        onCheckStatus={() => {
          if (!pixSession?.orderId) return;
          void refreshOrderStatus(pixSession.orderId);
        }}
      />
      <ShopCheckoutModal
        visible={!!checkoutSession}
        title={checkoutSession ? `Cartao • ${checkoutSession.itemName}` : "Pagamento com cartao"}
        orderId={checkoutSession?.orderId}
        checkoutUrl={checkoutSession?.checkoutUrl}
        onClose={() => setCheckoutSession(null)}
      />

      <LinearGradient
        colors={["rgba(34,197,94,0.25)", "rgba(59,130,246,0.10)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Loja</Text>
        <Text style={styles.headerSub}>Saldo atual: {Math.max(0, n(currentCoins, 0))} PokeCoins{section === "elo" ? ` • ${ecoinBalance} ECoins` : ""}</Text>
        <Text style={styles.headerHint}>{section === "elo" ? "EloMart consome saldo compartilhado da conta." : "Pagamentos online: PIX, credito e debito."}</Text>
      </LinearGradient>

      {/* section tabs */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabBtn, section === "poke" && styles.tabBtnActive]}
          onPress={() => setSection("poke")}
        >
          <Text style={styles.tabText}>PokeMart</Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, section === "elo" && styles.tabBtnActive]}
          onPress={() => setSection("elo")}
        >
          <Text style={styles.tabText}>EloMart</Text>
        </Pressable>
      </View>

      <View style={styles.pendingWrap}>
        <Text style={styles.pendingTitle}>Pedidos online pendentes: {pendingOrders.length}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingList}>
          {pendingOrders.length === 0 ? (
            <Text style={styles.pendingEmpty}>Nenhum pedido pendente.</Text>
          ) : (
            pendingOrders.map((order) => (
              <Pressable key={order.id} onPress={() => refreshOrderStatus(order.id)} style={styles.pendingCard}>
                <Text style={styles.pendingName}>{order.itemName}</Text>
                <Text style={styles.pendingMeta}>
                  {order.qty}x · {order.method} · R$ {order.total.toFixed(2)}
                </Text>
                <Text style={styles.pendingStatus}>Status: {order.status}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.loadingText}>Carregando itens da loja...</Text>
        </View>
      ) : false ? (
        <View style={{ gap: 10 }}>
          <View style={styles.ecoinSectionCard}>
            <Text style={styles.ecoinSectionTitle}>Comprar Ecoins</Text>
            <Text style={styles.ecoinSectionText}>
              Toque no botão abaixo para abrir a loja de pacotes de Ecoin.
            </Text>
            <Pressable
              onPress={() => router.push("/payments/ecoin")}
              style={styles.buyBtn}
            >
              <Text style={styles.buyBtnText}>Ir para loja de Ecoin</Text>
            </Pressable>
          </View>
        </View>
      ) : visibleItems.length === 0 && visibleGymCustomizationItems.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Sem itens na loja</Text>
          <Text style={styles.emptyText}>No web, marque itens com "Disponibilizar este item na loja".</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {visibleItems.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemImageWrap}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.itemImage} resizeMode="cover" />
                ) : item.category === "monetized" ? (
                  <LinearGradient colors={["#0f766e", "#1d4ed8"]} style={styles.itemImageFallback}>
                    <Ionicons name="diamond-outline" size={22} color={COLORS.white} />
                  </LinearGradient>
                ) : (
                  <Image source={{ uri: getItemImageUrl(item.id) }} style={styles.itemImage} resizeMode="contain" />
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemDesc}>{item.description}</Text>
                <Text style={styles.itemPrice}>{renderPrice(item)}</Text>
              </View>

              <Pressable onPress={() => openShopItemModal(item)} style={styles.buyBtn}>
                <Text style={styles.buyBtnText}>Comprar</Text>
              </Pressable>
            </View>
          ))}
          {section === "elo" && visibleGymCustomizationItems.length ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.pendingTitle}>NPCs e cenarios do GYM</Text>
              {visibleGymCustomizationItems.map((item) => (
                <View key={`${item.kind}-${item.id}`} style={styles.itemCard}>
                  <View style={styles.itemImageWrap}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.itemImage} resizeMode="cover" />
                    ) : (
                      <LinearGradient
                        colors={item.kind === "scenario" ? ["#7c3aed", "#2563eb"] : ["#0f766e", "#0891b2"]}
                        style={styles.itemImageFallback}
                      >
                        <Ionicons name={item.kind === "scenario" ? "image-outline" : "people-outline"} size={22} color={COLORS.white} />
                      </LinearGradient>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemDesc}>{item.description}</Text>
                    <Text style={styles.itemPrice}>{item.kind === "scenario" ? "Cenario" : "NPC"} • {item.price} ECoins</Text>
                    <Text style={styles.itemDesc}>{item.unlocked ? "Ja desbloqueado na conta." : "Disponivel para uso no fluxo de criacao do GYM."}</Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      if (item.unlocked) return;
                      Alert.alert(
                        "EloMart",
                        `Deseja desbloquear ${item.name} por ${item.price} ECoins?`,
                        [
                          { text: "Cancelar", style: "cancel" },
                          {
                            text: "Desbloquear",
                            onPress: () => {
                              void purchaseGymCustomization(item)
                                .then(() => {
                                  Alert.alert("EloMart", `${item.name} foi desbloqueado com sucesso.`);
                                })
                                .catch((error: unknown) => {
                                  const message = error instanceof Error ? error.message : "Falha ao desbloquear item.";
                                  Alert.alert("EloMart", message);
                                });
                            },
                          },
                        ]
                      );
                    }}
                    style={[styles.buyBtn, item.unlocked ? styles.buyBtnDisabled : null]}
                  >
                    <Text style={styles.buyBtnText}>{item.unlocked ? "Liberado" : "Desbloquear"}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}

      <Modal visible={!!selectedOffer} transparent animationType="fade" onRequestClose={() => setSelectedOffer(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {!selectedOffer ? null : selectedOffer.kind === "shop" ? (
              <>
                <Text style={styles.modalTitle}>Comprar {selectedOffer.item.name}</Text>
                <Text style={styles.modalSub}>{selectedOffer.item.description}</Text>

                <View style={styles.qtyRow}>
                  <Text style={styles.modalLabel}>Quantidade</Text>
                  <View style={styles.qtyControls}>
                    <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => Math.max(1, q - 1))}>
                      <Text style={styles.qtyBtnText}>-</Text>
                    </Pressable>
                    <Text style={styles.qtyText}>{qty}</Text>
                    <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => Math.min(99, q + 1))}>
                      <Text style={styles.qtyBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.modalLabel}>Forma de pagamento</Text>
                <View style={styles.methodGrid}>
                  {(selectedOffer.item.sellMode === "game" || selectedOffer.item.sellMode === "both") && (
                    <Pressable
                      style={[styles.methodBtn, method === "GAME" && styles.methodBtnActive]}
                      onPress={() => setMethod("GAME")}
                    >
                      <Text style={styles.methodText}>Moedas</Text>
                    </Pressable>
                  )}
                  {(selectedOffer.item.sellMode === "ecoin" || selectedOffer.item.sellMode === "both") && (
                    <>
                      <Pressable
                        style={[styles.methodBtn, method === "PIX" && styles.methodBtnActive]}
                        onPress={() => setMethod("PIX")}
                      >
                        <Text style={styles.methodText}>PIX</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.methodBtn, method === "CREDIT" && styles.methodBtnActive]}
                        onPress={() => setMethod("CREDIT")}
                      >
                        <Text style={styles.methodText}>Credito</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.methodBtn, method === "DEBIT" && styles.methodBtnActive]}
                        onPress={() => setMethod("DEBIT")}
                      >
                        <Text style={styles.methodText}>Debito</Text>
                      </Pressable>
                    </>
                  )}
                </View>

                <Text style={styles.totalText}>
                  Total: {method === "GAME" ? `${selectedTotal} moedas` : `R$ ${selectedTotal.toFixed(2)}`}
                </Text>

                <View style={styles.modalActions}>
                  <Pressable disabled={submitting} style={styles.cancelBtn} onPress={() => setSelectedOffer(null)}>
                    <Text style={styles.cancelText}>Cancelar</Text>
                  </Pressable>
                  <Pressable disabled={submitting} style={styles.confirmBtn} onPress={onConfirmPurchase}>
                    {submitting ? (
                      <ActivityIndicator color={COLORS.white} />
                    ) : (
                      <Text style={styles.confirmText}>Confirmar</Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Comprar {selectedOffer.product.name}</Text>
                <Text style={styles.modalSub}>{selectedOffer.product.description}</Text>
                <Text style={styles.modalLabel}>Forma de pagamento</Text>
                <View style={styles.methodGrid}>
                  <Pressable style={[styles.methodBtn, styles.methodBtnActive]} onPress={() => setMethod("ECOIN")}>
                    <Text style={styles.methodText}>ECoins</Text>
                  </Pressable>
                </View>
                <Text style={styles.totalText}>Total: {selectedTotal} ECoins</Text>
                <Text style={styles.modalSub}>{resolveMonetizedDeliveryInfo(selectedOffer.product).confirmationHint}</Text>
                <View style={styles.modalActions}>
                  <Pressable disabled={submitting} style={styles.cancelBtn} onPress={() => setSelectedOffer(null)}>
                    <Text style={styles.cancelText}>Cancelar</Text>
                  </Pressable>
                  <Pressable disabled={submitting} style={styles.confirmBtn} onPress={onConfirmPurchase}>
                    {submitting ? (
                      <ActivityIndicator color={COLORS.white} />
                    ) : (
                      <Text style={styles.confirmText}>Confirmar</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },
  header: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  headerTitle: { color: COLORS.white, fontSize: 20, fontWeight: "900" },
  headerSub: { color: "rgba(255,255,255,0.9)", marginTop: 4, fontWeight: "800" },
  headerHint: { color: "rgba(255,255,255,0.7)", marginTop: 6, fontWeight: "700", fontSize: 12 },

  tabRow: { flexDirection: "row", gap: 6, marginTop: 10, marginBottom: 6 },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  tabBtnActive: {
    backgroundColor: "rgba(34,197,94,0.9)",
  },
  tabText: { color: COLORS.white, fontWeight: "700" },

  ecoinSectionCard: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 14,
  },
  ecoinSectionTitle: { color: COLORS.white, fontWeight: "900", fontSize: 16, marginBottom: 6 },
  ecoinSectionText: { color: "rgba(255,255,255,0.75)", marginBottom: 10, fontWeight: "700", lineHeight: 18 },

  pendingWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pendingTitle: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  pendingList: { gap: 8, paddingTop: 8 },
  pendingEmpty: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "700" },
  pendingCard: {
    minWidth: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.25)",
    padding: 10,
  },
  pendingName: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  pendingMeta: { color: "rgba(255,255,255,0.75)", marginTop: 4, fontSize: 11 },
  pendingStatus: { color: "rgba(255,255,255,0.85)", marginTop: 4, fontSize: 11, fontWeight: "700" },

  loadingWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 20 },
  loadingText: { color: "rgba(255,255,255,0.8)", marginTop: 8, fontWeight: "700" },

  emptyCard: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 14,
  },
  emptyTitle: { color: COLORS.white, fontWeight: "900", marginBottom: 6 },
  emptyText: { color: "rgba(255,255,255,0.75)", lineHeight: 18, fontWeight: "700" },

  itemCard: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  itemImageWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  itemImageFallback: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  itemImage: { width: 36, height: 36 },
  itemName: { color: COLORS.white, fontWeight: "900", fontSize: 14 },
  itemDesc: { color: "rgba(255,255,255,0.72)", marginTop: 2, fontSize: 11, lineHeight: 16 },
  itemPrice: { color: "rgba(134,239,172,0.95)", marginTop: 5, fontWeight: "800", fontSize: 11 },
  buyBtn: {
    borderRadius: 12,
    backgroundColor: "rgba(34,197,94,0.88)",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  buyBtnDisabled: { opacity: 0.55 },
  buyBtnText: { color: COLORS.white, fontWeight: "900", fontSize: 12 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 14,
  },
  modalTitle: { color: COLORS.white, fontSize: 18, fontWeight: "900" },
  modalSub: { color: "rgba(255,255,255,0.78)", marginTop: 4, lineHeight: 18 },
  modalLabel: { color: "rgba(255,255,255,0.9)", marginTop: 12, fontWeight: "800", fontSize: 12 },
  qtyRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  qtyBtnText: { color: COLORS.white, fontWeight: "900", fontSize: 16 },
  qtyText: { color: COLORS.white, fontSize: 16, fontWeight: "900", minWidth: 22, textAlign: "center" },

  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  methodBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  methodBtnActive: {
    borderColor: "rgba(34,197,94,0.7)",
    backgroundColor: "rgba(34,197,94,0.22)",
  },
  methodText: { color: COLORS.white, fontWeight: "800", fontSize: 12 },
  totalText: { color: COLORS.white, marginTop: 12, fontSize: 14, fontWeight: "900" },
  modalActions: { marginTop: 14, flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  cancelBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancelText: { color: "rgba(255,255,255,0.85)", fontWeight: "800" },
  confirmBtn: {
    borderRadius: 10,
    backgroundColor: "rgba(34,197,94,0.9)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 96,
    alignItems: "center",
  },
  confirmText: { color: COLORS.white, fontWeight: "900" },
});


