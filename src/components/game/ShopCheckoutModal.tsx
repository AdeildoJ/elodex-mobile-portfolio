import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { COLORS } from "../../theme/colors";

type Props = {
  visible: boolean;
  title: string;
  orderId?: string | null;
  checkoutUrl?: string | null;
  onClose: () => void;
};

export default function ShopCheckoutModal({ visible, title, orderId, checkoutUrl, onClose }: Props) {
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const successUrls = useMemo(() => ["status=success", "approved", "success"], []);
  const failureUrls = useMemo(() => ["status=failure", "rejected", "failure"], []);
  const pendingUrls = useMemo(() => ["status=pending", "pending", "in_process"], []);

  function onNavChange(navState: { url?: string }) {
    const url = String(navState?.url || "").toLowerCase();
    const hit = (parts: string[]) => parts.some((part) => url.includes(part));
    if (hit(successUrls) || hit(failureUrls) || hit(pendingUrls)) {
      onClose();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Fechar</Text>
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {!checkoutUrl ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Checkout indisponivel</Text>
            <Text style={styles.emptyText}>Nao foi possivel carregar o pagamento por cartao.</Text>
          </View>
        ) : (
          <View style={styles.webWrap}>
            {loading ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Carregando pagamento...</Text>
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
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Pedido: {String(orderId || "sem-id")}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#081224" },
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
});
