import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import { Alert } from "react-native";
import { collectionGroup, doc, documentId, getDoc, getDocs, query, where } from "firebase/firestore";

import { COLORS } from "../../src/theme/colors";
import {
  clearCheckoutSession,
  getCheckoutSession,
} from "../../src/services/payments/checkoutSession";
import { auth, db } from "../../src/services/firebase/firebaseConfig";

export default function PaymentCheckoutScreen() {
  const { orderId: orderIdParam, title: titleParam } = useLocalSearchParams<{
    orderId?: string;
    title?: string;
    orderPath?: string;
  }>();
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);

  const session = getCheckoutSession();
  const paymentApiBaseUrl = (process.env.EXPO_PUBLIC_PAYMENT_API_BASE_URL || "").replace(/\/$/, "");
  const orderId = String(orderIdParam || session?.orderId || "");
  const checkoutUrl = String(session?.checkoutUrl || "");
  const title = String(titleParam || session?.title || "Checkout");
  const orderPath = String(useLocalSearchParams<{ orderPath?: string }>().orderPath || session?.orderPath || "");

  const successUrls = useMemo(() => ["status=success", "approved", "success"], []);
  const failureUrls = useMemo(() => ["status=failure", "rejected", "failure"], []);
  const pendingUrls = useMemo(() => ["status=pending", "pending", "in_process"], []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (webviewRef.current) {
        webviewRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    return () => {
      clearCheckoutSession();
    };
  }, []);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    async function checkOrderStatus() {
      try {
        if (paymentApiBaseUrl && orderId) {
          const token = await auth.currentUser?.getIdToken();
          if (token) {
            const qs = new URLSearchParams({ orderId });
            if (orderPath) qs.set("orderPath", orderPath);
            await fetch(`${paymentApiBaseUrl}/api/payments/sync-order?${qs.toString()}`, {
              method: "GET",
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => null);
          }
        }
        let data: Record<string, unknown> | null = null;
        if (orderPath) {
          const directSnap = await getDoc(doc(db, orderPath));
          if (cancelled || !directSnap.exists()) return;
          data = directSnap.data() as Record<string, unknown>;
        } else {
          const snap = await getDocs(query(collectionGroup(db, "paymentOrders"), whereDocumentId(orderId)));
          if (cancelled || snap.empty) return;
          data = snap.docs[0].data() as Record<string, unknown>;
        }
        if (!data) return;
        const status = String(data.status || "pending").toLowerCase();

        if (status === "approved") {
          clearCheckoutSession();
          Alert.alert("Pagamento aprovado", "Compra efetuada com sucesso.", [
            {
              text: "OK",
              onPress: () => router.back(),
            },
          ]);
          return;
        }

        if (status === "failed" || status === "canceled") {
          clearCheckoutSession();
          Alert.alert("Pagamento nao concluido", `Status atual: ${status}.`, [
            {
              text: "OK",
              onPress: () => router.back(),
            },
          ]);
        }
      } catch {
        // silencioso: polling segue
      }
    }

    void checkOrderStatus();
    const timer = setInterval(() => {
      void checkOrderStatus();
    }, 3500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [orderId, orderPath, paymentApiBaseUrl]);

  function closeScreen() {
    clearCheckoutSession();
    router.back();
  }

  function onNavChange(navState: { url?: string }) {
    const url = String(navState?.url || "").toLowerCase();
    const hit = (parts: string[]) => parts.some((part) => url.includes(part));
    if (hit(successUrls) || hit(failureUrls) || hit(pendingUrls)) {
      closeScreen();
    }
  }

  if (!checkoutUrl) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Checkout indisponivel</Text>
          <Text style={styles.emptyText}>Nao foi possivel recuperar a URL do pagamento.</Text>
          <Pressable onPress={closeScreen} style={styles.closeBtnInline}>
            <Text style={styles.closeBtnInlineText}>Voltar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={closeScreen} style={styles.closeBtn}>
          <Text style={styles.closeText}>Fechar</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.webWrap}>
        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Carregando checkout...</Text>
          </View>
        ) : null}
        <WebView
          ref={webviewRef}
          source={{ uri: checkoutUrl }}
          startInLoadingState
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={onNavChange}
          javaScriptEnabled
          domStorageEnabled
          nestedScrollEnabled
          mixedContentMode="always"
          overScrollMode="always"
          style={styles.webview}
          androidLayerType={Platform.OS === "android" ? "hardware" : "none"}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Pedido: {orderId || "sem-id"}</Text>
      </View>
    </SafeAreaView>
  );
}

function whereDocumentId(orderId: string) {
  return where(documentId(), "==", orderId);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#081224" },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#0d1a34",
  },
  headerSpacer: { width: 64 },
  closeBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  closeText: { color: COLORS.primary, fontWeight: "800" },
  title: { color: COLORS.white, fontSize: 16, fontWeight: "900" },
  webWrap: { flex: 1, backgroundColor: COLORS.white },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
  },
  loadingText: { marginTop: 8, color: "#516074", fontWeight: "700" },
  footer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#0d1a34",
  },
  footerText: { color: "rgba(255,255,255,0.72)", fontSize: 11 },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: { color: COLORS.white, fontSize: 20, fontWeight: "900" },
  emptyText: { color: "rgba(255,255,255,0.72)", marginTop: 8, textAlign: "center" },
  closeBtnInline: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  closeBtnInlineText: { color: COLORS.white, fontWeight: "900" },
});
