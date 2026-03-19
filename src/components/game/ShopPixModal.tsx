import React from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";

import { COLORS } from "../../theme/colors";

type Props = {
  visible: boolean;
  title: string;
  valueLabel: string;
  qrBase64?: string | null;
  copiaECola?: string | null;
  expiresAt?: string | null;
  onClose: () => void;
  onCheckStatus: () => void;
};

export default function ShopPixModal({
  visible,
  title,
  valueLabel,
  qrBase64,
  copiaECola,
  expiresAt,
  onClose,
  onCheckStatus,
}: Props) {
  async function copyCode() {
    if (!copiaECola) return;
    await Clipboard.setStringAsync(copiaECola);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Pague com PIX</Text>
          <Text style={styles.subtitle}>{title}</Text>
          <Text style={styles.value}>{valueLabel}</Text>

          {qrBase64 ? (
            <Image source={{ uri: `data:image/png;base64,${qrBase64}` }} style={styles.qr} resizeMode="contain" />
          ) : (
            <Text style={styles.note}>Gerando QR Code...</Text>
          )}

          <ScrollView style={styles.copyBox}>
            <Text selectable style={styles.copyText}>
              {copiaECola || "Aguardando codigo PIX..."}
            </Text>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.primaryBtn} onPress={copyCode}>
              <Text style={styles.primaryBtnText}>Copiar codigo</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={onCheckStatus}>
              <Text style={styles.secondaryBtnText}>Verificar</Text>
            </Pressable>
          </View>

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Fechar</Text>
          </Pressable>

          {expiresAt ? (
            <Text style={styles.expire}>Valido ate {new Date(expiresAt).toLocaleString("pt-BR")}</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
  },
  title: { fontSize: 20, fontWeight: "900", color: "#081224" },
  subtitle: { marginTop: 4, color: "#475569", fontWeight: "700" },
  value: { marginTop: 8, color: COLORS.primary, fontWeight: "900", fontSize: 16 },
  qr: { width: 220, height: 220, alignSelf: "center", marginTop: 14, marginBottom: 10 },
  note: { marginTop: 18, marginBottom: 18, textAlign: "center", color: "#64748b", fontWeight: "700" },
  copyBox: {
    maxHeight: 110,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
  },
  copyText: { color: "#0f172a" },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  primaryBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  secondaryBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
  },
  secondaryBtnText: { color: "#0f172a", fontWeight: "900" },
  closeBtn: {
    marginTop: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  closeText: { color: "#475569", fontWeight: "800" },
  expire: { marginTop: 8, textAlign: "right", color: "#64748b", fontSize: 12, fontWeight: "700" },
});
