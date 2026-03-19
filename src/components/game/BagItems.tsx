import React, { useMemo, useState } from "react";
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
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "../../theme/colors";
import type { ActionResult, InventoryEntry, TeamPokemonUI } from "./types";
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

function getDisplayName(item: InventoryEntry) {
  const catalog = getCatalogItem(item.id);
  const raw = (catalog?.name ?? item.name ?? item.id ?? "").trim();
  return formatName(raw || item.id);
}

function getDisplayDescription(item: InventoryEntry) {
  const catalog = getCatalogItem(item.id);
  return (
    catalog?.descriptionPtBr ||
    catalog?.effectPtBr ||
    item.description ||
    "Descricao indisponivel."
  );
}

function getItemImageUrl(itemId: string) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${itemId}.png`;
}

function requiresPokemonTarget(item: InventoryEntry | null) {
  if (!item?.effectType) return true;
  return !["UNLOCK_GYM_SCENARIO", "UNLOCK_GYM_NPC", "ACTIVATE_GYM_MAIN_TEAM_SLOT"].includes(item.effectType);
}

type Props = {
  items: InventoryEntry[];
  capacityUsed: number;
  capacityLimit: number;
  team: TeamPokemonUI[];
  onUseItem: (itemId: string, slotIndex: number) => Promise<ActionResult>;
};

export function BagItems({
  items,
  capacityUsed,
  capacityLimit,
  team,
  onUseItem,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedItem = useMemo(
    () => items.find((x) => x.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  const activeTeam = useMemo(() => {
    return team
      .map((pokemon, idx) => ({ pokemon, slotIndex: idx + 1 }))
      .filter((entry) => entry.pokemon.speciesId > 0);
  }, [team]);

  async function handleUseOnSlot(slotIndex: number) {
    if (!selectedItem) return;

    try {
      setLoading(true);
      const result = await onUseItem(selectedItem.id, slotIndex);
      if (!result.ok) {
        Alert.alert("Item", result.message);
        return;
      }
      Alert.alert("Item", result.message);
      setPickerOpen(false);
      setSelectedItemId(null);
    } finally {
      setLoading(false);
    }
  }

  function openPicker(itemId: string) {
    setSelectedItemId(itemId);
    setPickerOpen(true);
  }

  return (
    <>
      <View style={styles.root}>
        <LinearGradient
          colors={["rgba(59,130,246,0.20)", "rgba(255,255,255,0.04)"]}
          style={styles.headerCard}
        >
          <Text style={styles.headerTitle}>Inventario de Itens</Text>
          <Text style={styles.headerSub}>
            Espaco ocupado: {capacityUsed}/{capacityLimit}
          </Text>
        </LinearGradient>

        {items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Sem itens</Text>
            <Text style={styles.emptyText}>
              Nao ha itens na bolsa. Compre na loja para usar cura e progressao.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {items.map((item) => (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemImageWrap}>
                  <Image source={{ uri: item.imageUrl || getItemImageUrl(item.id) }} style={styles.itemImage} resizeMode="contain" />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{getDisplayName(item)}</Text>
                  <Text style={styles.itemDesc}>{getDisplayDescription(item)}</Text>
                </View>

                <View style={styles.right}>
                  <Text style={styles.qty}>x{item.quantity}</Text>
                  <Pressable
                    style={[styles.useBtn, item.quantity <= 0 && styles.useBtnDisabled]}
                    disabled={item.quantity <= 0}
                    onPress={() => openPicker(item.id)}
                  >
                    <Text style={styles.useBtnText}>Usar</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (loading) return;
          setPickerOpen(false);
          setSelectedItemId(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {selectedItem ? `Usar ${selectedItem.name}` : "Usar item"}
            </Text>
            <Text style={styles.modalSub}>
              {requiresPokemonTarget(selectedItem) ? "Escolha o Pokemon alvo." : "Confirme a ativacao deste item na mochila."}
            </Text>

            {requiresPokemonTarget(selectedItem) ? (
              <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8 }}>
                {activeTeam.map(({ pokemon, slotIndex }) => (
                  <Pressable
                    key={`slot_${slotIndex}`}
                    style={styles.slotRow}
                    disabled={loading}
                    onPress={() => handleUseOnSlot(slotIndex)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.slotName}>
                        Slot {slotIndex} - {pokemon.nickname || pokemon.name}
                      </Text>
                      <Text style={styles.slotMeta}>
                        Nv {pokemon.level} | HP {pokemon.hpCurrent}/{pokemon.hpTotal}
                      </Text>
                    </View>
                    {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.slotCta}>Usar</Text>}
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Pressable
                style={styles.slotRow}
                disabled={loading || !selectedItem}
                onPress={() => handleUseOnSlot(1)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.slotName}>{selectedItem?.name || "Ativar item"}</Text>
                  <Text style={styles.slotMeta}>{selectedItem?.description || "Disponibiliza o item para uso no GYM."}</Text>
                </View>
                {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.slotCta}>Ativar</Text>}
              </Pressable>
            )}

            <Pressable
              disabled={loading}
              style={styles.closeBtn}
              onPress={() => {
                setPickerOpen(false);
                setSelectedItemId(null);
              }}
            >
              <Text style={styles.closeBtnText}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
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

  itemCard: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  itemImageWrap: {
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
  itemImage: { width: 36, height: 36 },
  itemName: { color: COLORS.white, fontWeight: "900", textTransform: "capitalize" },
  itemDesc: { color: "rgba(255,255,255,0.75)", marginTop: 4, lineHeight: 17, fontSize: 12 },
  right: { alignItems: "flex-end", gap: 8 },
  qty: { color: COLORS.white, fontWeight: "900" },
  useBtn: {
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(16,185,129,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  useBtnDisabled: { opacity: 0.4 },
  useBtnText: { color: COLORS.white, fontWeight: "900", fontSize: 12 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#111827",
    gap: 10,
  },
  modalTitle: { color: COLORS.white, fontWeight: "900", fontSize: 15 },
  modalSub: { color: "rgba(255,255,255,0.75)", fontWeight: "700" },
  slotRow: {
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  slotName: { color: COLORS.white, fontWeight: "900", fontSize: 13 },
  slotMeta: { color: "rgba(255,255,255,0.72)", marginTop: 2, fontSize: 12, fontWeight: "700" },
  slotCta: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  closeBtn: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  closeBtnText: { color: COLORS.white, fontWeight: "900" },
});
