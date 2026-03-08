import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../src/theme/colors";

export default function VipPaymentScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  const isManageMode = useMemo(() => mode === "manage", [mode]);

  const handlePrimaryAction = () => {
    if (isManageMode) {
      Alert.alert("VIP ativo", "Sua conta VIP esta ativa e com beneficios liberados.");
      return;
    }

    Alert.alert(
      "Pagamento VIP (placeholder)",
      "Pagamento confirmado (simulado). O cadastro VIP sera liberado agora.",
      [
        {
          text: "OK",
          onPress: () => router.replace("/auth/register?vipPaid=1"),
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.topGlow}
      />

      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>{isManageMode ? "Gerenciar VIP" : "Upgrade VIP"}</Text>
          <Text style={styles.subtitle}>
            {isManageMode
              ? "Sua conta ja esta no plano VIP. Aqui voce acompanha beneficios e renovacoes."
              : "Plano VIP com 3 slots de personagens e recursos avancados de progressao."}
          </Text>

          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.primary} />
            <Text style={styles.infoText}>
              {isManageMode
                ? "Status atual: VIP ativo."
                : "Ao confirmar o pagamento, o cadastro VIP e liberado."}
            </Text>
          </View>

          <View style={styles.benefits}>
            <Text style={styles.benefitItem}>- Ate 3 personagens por conta</Text>
            <Text style={styles.benefitItem}>- Selecao avancada de inicial</Text>
            <Text style={styles.benefitItem}>- Acesso prioritario a novidades</Text>
          </View>

          <TouchableOpacity activeOpacity={0.9} onPress={handlePrimaryAction}>
            <LinearGradient
              colors={[COLORS.primary, COLORS.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryButton}
            >
              <Ionicons name="card-outline" size={20} color={COLORS.white} />
              <Text style={styles.primaryButtonText}>
                {isManageMode ? "Revisar assinatura" : "Confirmar pagamento"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.9} onPress={() => router.back()} style={{ marginTop: 12 }}>
            <View style={styles.secondaryButton}>
              <Ionicons name="arrow-back-outline" size={20} color={COLORS.primary} />
              <Text style={styles.secondaryButtonText}>Voltar</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>EloDex - VIP - Tech Minimal</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  topGlow: {
    position: "absolute",
    top: -160,
    left: -140,
    right: -140,
    height: 320,
    borderBottomLeftRadius: 160,
    borderBottomRightRadius: 160,
    opacity: 0.22,
  },

  container: { flex: 1, padding: 24, paddingTop: 44, justifyContent: "space-between" },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(45,45,45,0.08)",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },

  title: { color: COLORS.dark, fontSize: 26, fontWeight: "900" },
  subtitle: { color: "#555", marginTop: 8, fontWeight: "700", lineHeight: 20 },

  infoBox: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(167,139,250,0.10)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.20)",
  },
  infoText: { flex: 1, color: COLORS.dark, fontWeight: "700", lineHeight: 18 },

  benefits: {
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(45,45,45,0.10)",
    backgroundColor: "rgba(45,45,45,0.04)",
    gap: 6,
  },
  benefitItem: { color: COLORS.dark, fontWeight: "700" },

  primaryButton: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "900" },

  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.35)",
  },
  secondaryButtonText: { color: COLORS.primary, fontSize: 16, fontWeight: "900" },

  footer: { textAlign: "center", color: "#777", fontWeight: "700", marginTop: 18 },
});
