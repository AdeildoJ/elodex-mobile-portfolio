import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";

import { COLORS } from "../../src/theme/colors";
import { auth } from "../../src/services/firebase/firebaseConfig";
import {
  getPlayerVipSubscription,
  getVipPlans,
  type VipPlan,
} from "../../src/services/firebase/monetization.service";
import { runtimeConfig } from "../../src/services/config/runtime";
import { setCheckoutSession } from "../../src/services/payments/checkoutSession";

export default function VipPaymentScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [loading, setLoading] = useState(true);
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);
  const [plans, setPlans] = useState<VipPlan[]>([]);
  const [activePlanKey, setActivePlanKey] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Conta FREE");
  const [expiresText, setExpiresText] = useState<string | null>(null);

  const paymentApiBaseUrl = String(runtimeConfig.paymentApiBaseUrl || "").replace(/\/$/, "");
  const isManageMode = useMemo(() => mode === "manage", [mode]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const [vipPlans, subscription] = await Promise.all([getVipPlans(), getPlayerVipSubscription(uid)]);
        if (!mounted) return;

        setPlans(vipPlans);
        setActivePlanKey(subscription?.planCode || subscription?.planId || null);
        setStatusText(subscription?.status === "active" ? "Conta VIP ativa" : "Conta FREE");

        const expiresAtMs =
          Number(subscription?.expiresAtMs || 0) ||
          (subscription?.expiresAt && "toMillis" in subscription.expiresAt
            ? subscription.expiresAt.toMillis()
            : 0);

        setExpiresText(expiresAtMs > Date.now() ? new Date(expiresAtMs).toLocaleDateString("pt-BR") : null);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Falha ao carregar catalogo VIP.";
        Alert.alert("VIP", message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSubscribe(plan: VipPlan) {
    try {
      setSubmittingPlanId(plan.id);
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
          offerId: String(plan.code || plan.id).trim().toLowerCase(),
          itemId: plan.id,
          offerCode: String(plan.code || "").trim().toLowerCase(),
          offerName: plan.name,
          qty: 1,
          method: "CREDIT",
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

      const checkoutUrl = String(data?.checkoutUrl || "");
      const orderId = String(data?.orderId || "");
      if (!checkoutUrl || !orderId) throw new Error("Gateway nao retornou checkout da assinatura.");

      setCheckoutSession({
        orderId,
        checkoutUrl,
        title: plan.name,
        orderPath: `players/${auth.currentUser?.uid || ""}/paymentOrders/${orderId}`,
      });

      router.push({
        pathname: "/payments/checkout",
        params: {
          orderId,
          title: plan.name,
          orderPath: `players/${auth.currentUser?.uid || ""}/paymentOrders/${orderId}`,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao iniciar pagamento VIP.";
      Alert.alert("VIP", message);
    } finally {
      setSubmittingPlanId(null);
    }
  }

  return (
    <View style={styles.screen}>
      <LinearGradient colors={["#0f172a", "#111827", "#1d4ed8"]} style={StyleSheet.absoluteFillObject} />

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={18} color={COLORS.white} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>{isManageMode ? "Assinatura VIP" : "Planos VIP"}</Text>
            <Text style={styles.subtitle}>
              {expiresText ? `${statusText}. Valido ate ${expiresText}.` : `${statusText}.`}
            </Text>
          </View>
        </View>

        <View style={styles.statusBox}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#86efac" />
          <Text style={styles.statusText}>
            Base pronta para assinatura, validade, historico e bonus futuros de XP e dinheiro.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={COLORS.white} />
            <Text style={styles.loadingText}>Carregando planos VIP...</Text>
          </View>
        ) : plans.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Nenhum plano VIP ativo</Text>
            <Text style={styles.emptyText}>Ative os planos no admin web para disponibilizar assinatura.</Text>
          </View>
        ) : (
          plans.map((plan) => {
            const isCurrentPlan = activePlanKey === plan.id || activePlanKey === plan.code;
            return (
              <View key={plan.id} style={[styles.planCard, isCurrentPlan ? styles.planCardActive : null]}>
                <View style={styles.planHeader}>
                  <View>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planDescription}>{plan.description}</Text>
                  </View>
                  <View style={styles.priceBadge}>
                    <Text style={styles.priceText}>R$ {Number(plan.price || 0).toFixed(2)}</Text>
                    <Text style={styles.priceSub}>{plan.durationDays} dias</Text>
                  </View>
                </View>

                <View style={styles.benefitsBox}>
                  <Text style={styles.benefitItem}>Ate {plan.benefits.maxCharacters} personagens</Text>
                  <Text style={styles.benefitItem}>Ate {plan.benefits.maxCapturedPokemon} Pokemon capturados</Text>
                  <Text style={styles.benefitItem}>Ate {plan.benefits.maxStorageItems} itens no storage</Text>
                  <Text style={styles.benefitItem}>+{plan.benefits.xpBonusPercent}% XP</Text>
                  <Text style={styles.benefitItem}>+{plan.benefits.moneyBonusPercent}% dinheiro</Text>
                  <Text style={styles.benefitItem}>+{plan.benefits.weeklyIncubators} incubadora semanal</Text>
                  {Array.isArray(plan.includedItems) && plan.includedItems.length ? (
                    <Text style={styles.futureFlag}>
                      Pacote VIP inclui: {plan.includedItems.map((item) => `${item.quantity}x ${item.name}`).join(", ")}
                    </Text>
                  ) : null}
                </View>

                <Pressable
                  disabled={submittingPlanId === plan.id}
                  onPress={() => handleSubscribe(plan)}
                  style={[styles.buyButton, isCurrentPlan ? styles.buyButtonCurrent : null]}
                >
                  {submittingPlanId === plan.id ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.buyButtonText}>
                      {isCurrentPlan ? "Renovar plano" : isManageMode ? "Trocar/assinar" : "Assinar plano"}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#020617" },
  container: { padding: 16, paddingBottom: 28, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  headerContent: { flex: 1, alignItems: "center", paddingRight: 38 },
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
  title: { color: COLORS.white, fontSize: 24, fontWeight: "900", textAlign: "center" },
  subtitle: { color: "rgba(255,255,255,0.72)", marginTop: 4, fontWeight: "700", textAlign: "center" },
  statusBox: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(15,23,42,0.88)",
    borderWidth: 1,
    borderColor: "rgba(134,239,172,0.25)",
  },
  statusText: { flex: 1, color: "rgba(255,255,255,0.82)", fontWeight: "700", lineHeight: 18 },
  loadingBox: { paddingVertical: 40, alignItems: "center", gap: 10 },
  loadingText: { color: "rgba(255,255,255,0.72)", fontWeight: "700" },
  emptyBox: {
    marginTop: 8,
    borderRadius: 18,
    padding: 16,
    backgroundColor: "rgba(15,23,42,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  emptyTitle: { color: COLORS.white, fontWeight: "900", fontSize: 16 },
  emptyText: { color: "rgba(255,255,255,0.72)", marginTop: 6, lineHeight: 18, fontWeight: "700" },
  planCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: "rgba(15,23,42,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  planCardActive: {
    borderColor: "rgba(251,191,36,0.45)",
    backgroundColor: "rgba(120,53,15,0.25)",
  },
  planHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  planName: { color: COLORS.white, fontSize: 20, fontWeight: "900" },
  planDescription: { color: "rgba(255,255,255,0.72)", marginTop: 4, lineHeight: 18, fontWeight: "700" },
  priceBadge: {
    minWidth: 88,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "rgba(30,41,59,0.95)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.35)",
  },
  priceText: { color: "#93c5fd", fontWeight: "900", fontSize: 16 },
  priceSub: { color: "rgba(255,255,255,0.65)", fontSize: 11, marginTop: 2, fontWeight: "700" },
  benefitsBox: {
    marginTop: 14,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(2,6,23,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 6,
  },
  benefitItem: { color: COLORS.white, fontWeight: "700" },
  futureFlag: { color: "#fcd34d", fontWeight: "800", marginTop: 4 },
  buyButton: {
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  buyButtonCurrent: {
    backgroundColor: "#92400e",
  },
  buyButtonText: { color: COLORS.white, fontWeight: "900", fontSize: 15 },
});
