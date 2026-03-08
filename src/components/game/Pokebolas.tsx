import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "../../theme/colors";
import type { InventoryEntry } from "./types";
import itemsDex from "../../data/items/items.json";

type CatalogItem = {
  id: string;
  name?: string | null;
  descriptionPtBr?: string | null;
  effectPtBr?: string | null;
};

function formatName(name: string) {
  return name
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function getCatalogItem(itemId: string): CatalogItem | null {
  const byId = (itemsDex as Record<string, CatalogItem>)[itemId];
  if (byId) return byId;
  return null;
}

function getDisplayName(ball: InventoryEntry) {
  const catalog = getCatalogItem(ball.id);
  const raw = (catalog?.name ?? ball.name ?? ball.id ?? "").trim();
  return formatName(raw || ball.id);
}

function getDisplayDescription(ball: InventoryEntry) {
  const catalog = getCatalogItem(ball.id);
  return (
    catalog?.descriptionPtBr ||
    catalog?.effectPtBr ||
    ball.description ||
    "Descricao indisponivel."
  );
}

function getBallImageUrl(ballId: string) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${ballId}.png`;
}

type Props = {
  pokeballs: InventoryEntry[];
  capacityUsed: number;
  capacityLimit: number;
};

export function Pokebolas({
  pokeballs,
  capacityUsed,
  capacityLimit,
}: Props) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["rgba(59,130,246,0.20)", "rgba(255,255,255,0.04)"]}
        style={styles.headerCard}
      >
        <Text style={styles.headerTitle}>Bolsa de Pokebolas</Text>
        <Text style={styles.headerSub}>
          Espaco ocupado: {capacityUsed}/{capacityLimit}
        </Text>
      </LinearGradient>

      <View style={{ gap: 10 }}>
        {pokeballs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Sem Pokebolas</Text>
            <Text style={styles.emptyText}>Compre pokebolas na loja para capturar Pokemon.</Text>
          </View>
        ) : (
          pokeballs.map((ball) => (
            <View key={ball.id} style={styles.ballCard}>
              <View style={styles.ballImageWrap}>
                <Image source={{ uri: getBallImageUrl(ball.id) }} style={styles.ballImage} resizeMode="contain" />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.ballName}>{getDisplayName(ball)}</Text>
                <Text style={styles.ballDesc}>{getDisplayDescription(ball)}</Text>
              </View>

              <View style={styles.right}>
                <Text style={styles.qty}>x{ball.quantity}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  headerCard: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  headerTitle: { color: COLORS.white, fontWeight: "900", fontSize: 14 },
  headerSub: { color: "rgba(255,255,255,0.78)", marginTop: 4, fontWeight: "700" },

  emptyCard: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 14,
  },
  emptyTitle: { color: COLORS.white, fontWeight: "900", marginBottom: 6 },
  emptyText: { color: "rgba(255,255,255,0.75)", lineHeight: 18, fontWeight: "700" },

  ballCard: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  ballImageWrap: {
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
  ballImage: { width: 36, height: 36 },
  ballName: { color: COLORS.white, fontWeight: "900", textTransform: "capitalize" },
  ballDesc: { color: "rgba(255,255,255,0.75)", marginTop: 4, lineHeight: 17, fontSize: 12 },
  right: { alignItems: "flex-end", gap: 8 },
  qty: { color: COLORS.white, fontWeight: "900" },
});
