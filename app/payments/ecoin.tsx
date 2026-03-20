import React, { useEffect, useMemo, useState } from "react";
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
import { collection, getDocs } from "firebase/firestore";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";

import ShopCheckoutModal from "../../src/components/game/ShopCheckoutModal";
import ShopPixModal from "../../src/components/game/ShopPixModal";
import { COLORS } from "../../src/theme/colors";
import { auth, db } from "../../src/services/firebase/firebaseConfig";
import {
  getEcoinPackages,
  listenPlayerMonetizationHistory,
  type EcoinPackage,
  type PlayerMonetizationHistoryEntry,
} from "../../src/services/firebase/monetization.service";
import { runtimeConfig } from "../../src/services/config/runtime";

type OnlineMethod = "PIX" | "CREDIT" | "DEBIT";

type PixSession = {
  orderId: string;
  itemName: string;
  total: number;
  qrCodeBase64?: string | null;
  copiaECola?: string | null;
  expiresAt?: string | null;
};

type CheckoutSession = {
  orderId: string;
  itemName: string;
  total: number;
  checkoutUrl: string;
};

type PlayerOrder = {
  id: string;
  status: string;
  itemName: string;
  total: number;
};

export default function EcoinPurchaseScreen() {
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [packages, setPackages] = useState<EcoinPackage[]>([]);
  const [history, setHistory] = useState<PlayerMonetizationHistoryEntry[]>([]);
  const [orders, setOrders] = useState<PlayerOrder[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<EcoinPackage | null>(null);
  const [method, setMethod] = useState<OnlineMethod>("PIX");
  const [pixSession, setPixSession] = useState<PixSession | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession | null>(null);

  const paymentApiBaseUrl = String(runtimeConfig.paymentApiBaseUrl || "").replace(/\/$/, "");
  const uid = auth.currentUser?.uid || "";
  const pendingOrders = useMemo(() => orders.filter((entry) => entry.status === "pending"), [orders]);

  useEffect(() => {
    let mounted = true;
    let unsub: (() => void) | undefined;

    async function load() {
      try {
        const pkgRows = await getEcoinPackages();
        if (!mounted) return;
        setPackages(pkgRows);
        await loadOrders();

        if (uid) {
          unsub = listenPlayerMonetizationHistory(uid, (rows) => {
            setHistory(rows.slice(0, 8));
          });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Falha ao carregar loja de Ecoin.";
        Alert.alert("Loja de Ecoin", message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
      unsub?.();
    };
  }, [uid]);

  useEffect(() => {
    if (!uid || !paymentApiBaseUrl || pendingOrders.length === 0) return;
    const timer = setInterval(() => {
      pendingOrders.forEach((entry) => {
        void syncOrderStatus(entry.id);
      });
    }, 3500);
    return () => clearInterval(timer);
  }, [paymentApiBaseUrl, pendingOrders, uid]);

  useEffect(() => {
    if (!pixSession) return;
    const current = orders.find((entry) => entry.id === pixSession.orderId);
    if (!current) return;
    if (current.status === "approved") {
      setPixSession(null);
      Alert.alert("Pagamento aprovado", "Os ECoins foram creditados na sua conta.");
      return;
    }
    if (current.status === "failed" || current.status === "canceled") {
      setPixSession(null);
      Alert.alert("Pagamento nao concluido", `Status atual: ${current.status}.`);
    }
  }, [orders, pixSession]);

  useEffect(() => {
    if (!checkoutSession) return;
    const current = orders.find((entry) => entry.id === checkoutSession.orderId);
    if (!current) return;
    if (current.status === "approved") {
      setCheckoutSession(null);
      Alert.alert("Pagamento aprovado", "Os ECoins foram creditados na sua conta.");
      return;
    }
    if (current.status === "failed" || current.status === "canceled") {
      setCheckoutSession(null);
      Alert.alert("Pagamento nao concluido", `Status atual: ${current.status}.`);
    }
  }, [checkoutSession, orders]);

  async function loadOrders() {
    if (!uid) return;
    const snap = await getDocs(collection(db, "players", uid, "paymentOrders"));
    setOrders(
      snap.docs
        .map((docSnap) => ({
          id: docSnap.id,
          status: String(docSnap.data().status || "pending").toLowerCase(),
          itemName: String(docSnap.data().itemName || docSnap.id),
          total: Math.max(0, Number(docSnap.data().total || 0)),
        }))
        .sort((a, b) => b.id.localeCompare(a.id))
    );
  }

  async function syncOrderStatus(orderId: string) {
    if (!uid || !paymentApiBaseUrl) return;
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    const qs = new URLSearchParams({
      orderId,
      orderPath: `players/${uid}/paymentOrders/${orderId}`,
    });
    await fetch(`${paymentApiBaseUrl}/api/payments/sync-order?${qs.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    await loadOrders();
  }

  async function handleBuy(pkg: EcoinPackage, onlineMethod: OnlineMethod) {
    try {
      setSubmittingId(pkg.id);
      if (!paymentApiBaseUrl) {
        throw new Error("EXPO_PUBLIC_PAYMENT_API_BASE_URL nao configurado.");
      }

      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("Sessao expirada. Faca login novamente.");

      const res = await fetch(`${paymentApiBaseUrl}/api/payments/create-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ecoinPackageId: pkg.id,
          qty: 1,
          method: onlineMethod,
        }),
      });

      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        const details =
          typeof data?.details === "string"
            ? data.details
            : data?.details && typeof data.details === "object"
            ? JSON.stringify(data.details)
            : "";
        throw new Error(String(data?.error || details || `Falha ao iniciar checkout (${res.status}).`));
      }

      const orderId = String(data?.orderId || "");
      if (!orderId) throw new Error("Gateway nao retornou pedido do pacote de Ecoin.");

      if (String(data?.mode || "").toLowerCase() === "pix") {
        setPixSession({
          orderId,
          itemName: `${pkg.amount} Ecoins`,
          total: Math.max(0, Number(pkg.price || 0)),
          qrCodeBase64: String(data?.qrCode_base64 || data?.qrCode || "") || null,
          copiaECola: String(data?.copiaECola || "") || null,
          expiresAt: String(data?.expiresAt || "") || null,
        });
        await loadOrders();
        return;
      }

      const checkoutUrl = String(data?.checkoutUrl || "");
      if (!checkoutUrl) throw new Error("Gateway nao retornou checkout do pacote de Ecoin.");

      setCheckoutSession({
        orderId,
        itemName: `${pkg.amount} Ecoins`,
        total: Math.max(0, Number(pkg.price || 0)),
        checkoutUrl,
      });
      await loadOrders();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao iniciar compra.";
      Alert.alert("Loja", message);
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#050b1e", "#0f172a", "#1e3a8a"]} style={StyleSheet.absoluteFillObject} />
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
          void syncOrderStatus(pixSession.orderId);
        }}
      />
      <ShopCheckoutModal
        visible={!!checkoutSession}
        title={checkoutSession ? `Cartao • ${checkoutSession.itemName}` : "Pagamento com cartao"}
        orderId={checkoutSession?.orderId}
        checkoutUrl={checkoutSession?.checkoutUrl}
        onClose={() => setCheckoutSession(null)}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={COLORS.white} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Comprar Ecoin</Text>
            <Text style={styles.subtitle}>Pacotes configurados no admin web</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.white} />
            <Text style={styles.loadingText}>Carregando pacotes de Ecoin...</Text>
          </View>
        ) : packages.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nenhum pacote de Ecoin ativo</Text>
            <Text style={styles.emptyText}>Cadastre pacotes de Ecoin no admin web para exibir nesta tela.</Text>
          </View>
        ) : (
          packages.map((pkg) => (
            <View key={pkg.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardMain}>
                  {pkg.imageUrl ? (
                    <Image source={{ uri: pkg.imageUrl }} style={styles.productImage} resizeMode="cover" />
                  ) : (
                    <LinearGradient colors={["#f59e0b", "#f97316"]} style={styles.productImagePlaceholder}>
                      <Ionicons name="logo-usd" size={24} color={COLORS.white} />
                      <Text style={styles.productImagePlaceholderText}>{pkg.amount}</Text>
                    </LinearGradient>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName}>{pkg.amount} Ecoins</Text>
                  </View>
                </View>
                <View style={styles.pricePill}>
                  <Text style={styles.priceLabel}>R$ {Number(pkg.price || 0).toFixed(2)}</Text>
                </View>
              </View>
              <Pressable
                disabled={submittingId === pkg.id}
                onPress={() => {
                  setSelectedPackage(pkg);
                  setMethod("PIX");
                }}
                style={styles.buyBtn}
              >
                {submittingId === pkg.id ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.buyBtnText}>Comprar</Text>
                )}
              </Pressable>
            </View>
          ))
        )}

        {pendingOrders.length > 0 ? (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingTitle}>Pedidos pendentes</Text>
            {pendingOrders.map((entry) => (
              <Pressable key={entry.id} onPress={() => void syncOrderStatus(entry.id)} style={styles.pendingRow}>
                <Text style={styles.pendingName}>{entry.itemName}</Text>
                <Text style={styles.pendingMeta}>R$ {entry.total.toFixed(2)} • tocar para verificar</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.historyCard}>
          <Text style={styles.historyTitle}>Historico basico</Text>
          {history.length === 0 ? (
            <Text style={styles.historyEmpty}>Nenhuma ativacao monetizada registrada nesta conta.</Text>
          ) : (
            history.map((entry) => (
              <View key={entry.id} style={styles.historyRow}>
                <Text style={styles.historyName}>{entry.itemName}</Text>
                <Text style={styles.historyMeta}>
                  {entry.type} - {entry.status}
                  {entry.validUntilMs ? ` - ate ${new Date(entry.validUntilMs).toLocaleDateString("pt-BR")}` : ""}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={!!selectedPackage} transparent animationType="fade" onRequestClose={() => setSelectedPackage(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Comprar {selectedPackage?.amount || 0} Ecoins</Text>
            <Text style={styles.modalSub}>Escolha como deseja pagar sem sair do app.</Text>

            <Text style={styles.modalLabel}>Forma de pagamento</Text>
            <View style={styles.methodGrid}>
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
            </View>

            <Text style={styles.totalText}>
              Total: R$ {Math.max(0, Number(selectedPackage?.price || 0)).toFixed(2)}
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                disabled={!!submittingId}
                style={styles.cancelBtn}
                onPress={() => setSelectedPackage(null)}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                disabled={!!submittingId || !selectedPackage}
                style={styles.confirmBtn}
                onPress={async () => {
                  if (!selectedPackage) return;
                  const pkg = selectedPackage;
                  setSelectedPackage(null);
                  await handleBuy(pkg, method);
                }}
              >
                {submittingId === selectedPackage?.id ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.confirmText}>Continuar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  content: { gap: 12, paddingBottom: 28 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  title: { color: COLORS.white, fontSize: 24, fontWeight: "900" },
  subtitle: { color: "rgba(255,255,255,0.70)", marginTop: 4, fontWeight: "700" },
  loadingWrap: { paddingVertical: 40, alignItems: "center", gap: 10 },
  loadingText: { color: "rgba(255,255,255,0.70)", fontWeight: "700" },
  emptyCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(15,23,42,0.88)",
  },
  emptyTitle: { color: COLORS.white, fontWeight: "900", fontSize: 16 },
  emptyText: { color: "rgba(255,255,255,0.72)", marginTop: 6, lineHeight: 18, fontWeight: "700" },
  card: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: "rgba(15,23,42,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  cardMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  productImage: {
    width: 54,
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  productImagePlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  productImagePlaceholderText: { color: COLORS.white, fontWeight: "900" },
  productName: { color: COLORS.white, fontSize: 19, fontWeight: "900" },
  pricePill: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(30,41,59,0.95)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  priceLabel: { color: COLORS.white, fontWeight: "900" },
  buyBtn: {
    marginTop: 10,
    backgroundColor: "rgba(59,130,246,0.95)",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  buyBtnText: { color: COLORS.white, fontWeight: "900" },
  pendingCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(15,23,42,0.88)",
    gap: 10,
  },
  pendingTitle: { color: COLORS.white, fontWeight: "900", fontSize: 16 },
  pendingRow: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  pendingName: { color: COLORS.white, fontWeight: "900" },
  pendingMeta: { color: "rgba(255,255,255,0.70)", marginTop: 4, fontSize: 12 },
  historyCard: { marginTop: 20, gap: 8 },
  historyTitle: { color: COLORS.white, fontWeight: "900", fontSize: 16 },
  historyEmpty: { color: "rgba(255,255,255,0.72)" },
  historyRow: { gap: 4 },
  historyName: { color: COLORS.white, fontWeight: "900" },
  historyMeta: { color: "rgba(255,255,255,0.70)", fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    padding: 18,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  modalTitle: { color: COLORS.white, fontSize: 20, fontWeight: "900" },
  modalSub: { color: "rgba(255,255,255,0.72)", marginTop: 6, fontWeight: "700" },
  modalLabel: { color: COLORS.white, fontWeight: "800", marginTop: 14, marginBottom: 8 },
  methodGrid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  methodBtn: {
    flex: 1,
    minWidth: 96,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  methodBtnActive: {
    backgroundColor: "rgba(59,130,246,0.24)",
    borderColor: "rgba(59,130,246,0.75)",
  },
  methodText: { color: COLORS.white, fontWeight: "900" },
  totalText: { color: COLORS.white, fontWeight: "900", fontSize: 16, marginTop: 14 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  cancelText: { color: COLORS.white, fontWeight: "800" },
  confirmBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(59,130,246,0.95)",
  },
  confirmText: { color: COLORS.white, fontWeight: "900" },
});
