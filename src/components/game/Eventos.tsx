import React from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "../../theme/colors";

export function Eventos() {
  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={["rgba(16,185,129,0.24)", "rgba(59,130,246,0.10)", "rgba(255,255,255,0.04)"]}
        style={styles.hero}
      >
        <Text style={styles.title}>Eventos</Text>
        <Text style={styles.text}>
          Calendario sazonal e missoes globais em preparo. A tela ja esta pronta para receber os dados do backend.
        </Text>
      </LinearGradient>

      <View style={styles.row}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>Status: Integracao</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>Proxima etapa: Temporadas</Text>
        </View>
      </View>

      <Pressable
        style={styles.cta}
        onPress={() => Alert.alert("Eventos", "Em breve: eventos por temporada e recompensas especiais.")}
      >
        <Text style={styles.ctaText}>Ver previsao de recursos</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 14,
    gap: 12,
  },
  hero: { borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  title: { color: COLORS.white, fontWeight: "900", marginBottom: 6, fontSize: 16 },
  text: { color: "rgba(255,255,255,0.78)", lineHeight: 18, fontWeight: "700" },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { color: "rgba(255,255,255,0.85)", fontWeight: "800", fontSize: 12 },
  cta: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.55)",
    backgroundColor: "rgba(16,185,129,0.16)",
    alignItems: "center",
  },
  ctaText: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
});
