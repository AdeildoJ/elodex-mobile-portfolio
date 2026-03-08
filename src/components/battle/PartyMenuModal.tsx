import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../theme/colors";
import type { BattleMonster } from "./types";

type Props = {
  visible: boolean;
  team: BattleMonster[];
  currentIndex: number;
  busy?: boolean;
  force?: boolean;
  onClose: () => void;
  onSelect: (targetIndex: number) => void;
};

export function PartyMenuModal({ visible, team, currentIndex, busy, force, onClose, onSelect }: Props) {
  const selectableTeam = team
    .map((m, idx) => ({ m, idx }))
    .filter(({ m, idx }) => idx === currentIndex || m.hpCurrent > 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={force ? () => {} : onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Escolha um Pokemon</Text>
          <View style={styles.list}>
            {selectableTeam.map(({ m, idx }) => {
              const invalid = idx === currentIndex || m.hpCurrent <= 0 || !!busy;
              return (
                <Pressable
                  key={`${m.id}-${idx}`}
                  style={[styles.item, invalid && styles.disabled]}
                  disabled={invalid}
                  onPress={() => onSelect(idx)}
                >
                  <Text style={styles.name}>{m.name}</Text>
                  <Text style={styles.meta}>Nv {m.level} • HP {m.hpCurrent}/{m.hpTotal}</Text>
                </Pressable>
              );
            })}
          </View>
          {!force ? (
            <Pressable style={styles.closeBtn} onPress={onClose} disabled={!!busy}>
              <Text style={styles.closeText}>Fechar</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: {
    width: "100%",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(15,23,42,0.98)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 10,
  },
  title: { color: COLORS.white, fontWeight: "900", fontSize: 15 },
  list: { gap: 8 },
  item: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.55)",
    backgroundColor: "rgba(59,130,246,0.16)",
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 4,
  },
  name: { color: COLORS.white, fontWeight: "900", fontSize: 13 },
  meta: { color: "rgba(255,255,255,0.75)", fontWeight: "700", fontSize: 11 },
  closeBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  closeText: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  disabled: { opacity: 0.45 },
});
