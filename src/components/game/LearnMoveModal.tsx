import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "../../theme/colors";

type Props = {
  visible: boolean;
  pokemonName: string;
  newMoveId: string | null;
  currentMoves: string[];
  onForgetMove: (moveIndex: number) => void;
  onCancelLearn: () => void;
};

function toLabel(moveId: string): string {
  const raw = String(moveId || "").trim();
  if (!raw) return "-";
  return raw
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function LearnMoveModal({
  visible,
  pokemonName,
  newMoveId,
  currentMoves,
  onForgetMove,
  onCancelLearn,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelLearn}>
      <View style={styles.overlay}>
        <LinearGradient colors={["#0B1020", "#121B30"]} style={styles.card}>
          <Text style={styles.title}>Learn New Move</Text>
          <Text style={styles.subtitle}>{pokemonName} wants to learn {toLabel(String(newMoveId || ""))}.</Text>
          <Text style={styles.hint}>Choose a move to forget, or cancel to keep current moves.</Text>

          <View style={styles.list}>
            {currentMoves.slice(0, 4).map((moveId, idx) => (
              <Pressable key={`${moveId}-${idx}`} onPress={() => onForgetMove(idx)} style={styles.rowPress}>
                <View style={styles.row}>
                  <Text style={styles.rowText}>{toLabel(moveId)}</Text>
                  <Text style={styles.rowCta}>Forget</Text>
                </View>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={onCancelLearn} style={styles.cancelPress}>
            <View style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel - Do not learn</Text>
            </View>
          </Pressable>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 10,
  },
  title: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
  },
  subtitle: {
    color: "rgba(255,255,255,0.88)",
    fontWeight: "800",
  },
  hint: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    lineHeight: 17,
  },
  list: {
    gap: 8,
  },
  rowPress: {
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowText: {
    color: COLORS.white,
    fontWeight: "900",
  },
  rowCta: {
    color: "rgba(255,255,255,0.82)",
    fontWeight: "800",
    fontSize: 12,
  },
  cancelPress: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
  },
  cancelBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.45)",
    backgroundColor: "rgba(239,68,68,0.22)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
  },
  cancelText: {
    color: COLORS.white,
    fontWeight: "900",
  },
});
