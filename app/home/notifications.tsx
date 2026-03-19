import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "../../src/theme/colors";

export default function NotificationsScreen() {
  return (
    <View style={styles.root}>
      <LinearGradient colors={["#050b1e", "#0f172a", "#1e3a8a"]} style={StyleSheet.absoluteFillObject} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.white} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Notificacoes</Text>
            <Text style={styles.subtitle}>Central simples do jogador preparada para etapas futuras</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hoje</Text>
          <Text style={styles.cardText}>Nenhuma notificacao nova nesta conta.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Preparado para depois</Text>
          <Text style={styles.cardText}>
            Esta tela fica pronta para avisos de pagamento, upgrades de GYM, renovacao VIP e alertas de eventos em etapas futuras.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  content: { gap: 12, paddingBottom: 28 },
  header: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 10 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  title: { color: COLORS.white, fontSize: 24, fontWeight: "900" },
  subtitle: { color: "rgba(255,255,255,0.72)", marginTop: 4, fontWeight: "700" },
  card: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(15,23,42,0.84)",
    gap: 6,
  },
  cardTitle: { color: COLORS.white, fontWeight: "900", fontSize: 16 },
  cardText: { color: "rgba(255,255,255,0.74)", fontWeight: "700", lineHeight: 18 },
});
