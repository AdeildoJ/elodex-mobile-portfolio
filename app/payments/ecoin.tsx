import React from "react";
import { Alert, Pressable, StyleSheet, Text, View, FlatList } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { COLORS } from "../../src/theme/colors";

type Pack = {
  id: string;
  coins: number;
  priceLabel: string; // placeholder
  bonusLabel?: string;
};

const PACKS: Pack[] = [
  { id: "p1", coins: 100, priceLabel: "R$ 4,90" },
  { id: "p2", coins: 550, priceLabel: "R$ 19,90", bonusLabel: "+10%" },
  { id: "p3", coins: 1200, priceLabel: "R$ 39,90", bonusLabel: "+20%" },
  { id: "p4", coins: 2500, priceLabel: "R$ 79,90", bonusLabel: "+30%" },
];

export default function EcoinShopScreen() {
  function onBuy(pack: Pack) {
    Alert.alert(
      "Comprar ECoin",
      `Pacote: ${pack.coins} ECoin\nPreço: ${pack.priceLabel}\n\nIntegração de pagamento será conectada na próxima etapa.`
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#050B1E", "#0A1440", "#0E1B57", "#050B1E"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={COLORS.white} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Loja de ECoin</Text>
          <Text style={styles.subtitle}>Escolha um pacote para comprar</Text>
        </View>
      </View>

      <FlatList
        data={PACKS}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable onPress={() => onBuy(item)} style={styles.card}>
            <LinearGradient
              colors={["rgba(59,130,246,0.25)", "rgba(167,139,250,0.10)", "rgba(0,0,0,0)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGlow}
            >
              <View style={styles.cardInner}>
                <View>
                  <Text style={styles.coins}>{item.coins} ECoin</Text>
                  <Text style={styles.price}>{item.priceLabel}</Text>

                  {item.bonusLabel ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.bonusLabel}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.buyBtn}>
                  <Text style={styles.buyBtnText}>Comprar</Text>
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        )}
      />

      <View style={styles.footerHint}>
        <Text style={styles.footerText}>
          Pagamento real será integrado depois (sem mudar regras agora).
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    marginBottom: 16,
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
  title: { color: COLORS.white, fontSize: 20, fontWeight: "900" },
  subtitle: { color: "rgba(255,255,255,0.70)", marginTop: 2, fontWeight: "700" },

  list: { gap: 12, paddingBottom: 20 },

  card: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  cardGlow: { padding: 1 },
  cardInner: {
    padding: 14,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.35)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  coins: { color: COLORS.white, fontSize: 18, fontWeight: "900" },
  price: { color: "rgba(255,255,255,0.75)", fontWeight: "800", marginTop: 4 },

  badge: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.35)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.55)",
  },
  badgeText: { color: COLORS.white, fontWeight: "900", fontSize: 12 },

  buyBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(59,130,246,0.95)",
  },
  buyBtnText: { color: COLORS.white, fontWeight: "900" },

  footerHint: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  footerText: { color: "rgba(255,255,255,0.70)", fontWeight: "700" },
});
