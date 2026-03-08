import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../theme/colors";
import type { BattleMove, BattleMonster } from "./types";

type BallItem = { id: string; name: string; quantity: number };

type Props = {
  canUseBag: boolean;
  canRun: boolean;
  playerActive: BattleMonster | null;
  team: BattleMonster[];
  currentIndex: number;
  balls?: BallItem[];
  busy?: boolean;
  onFight: (moveIndex: number) => void;
  onBall: (ballId: string) => void;
  onOpenPokemon: () => void;
  onRun: () => void;
};

type MenuState = "root" | "fight" | "bag";

function moveLabel(m: BattleMove) {
  const n = String(m.name || m.id || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return n || "Move";
}

function typeColor(type?: string) {
  const t = String(type || "").toLowerCase();
  if (t === "fire") return "#f97316";
  if (t === "water") return "#38bdf8";
  if (t === "grass") return "#4ade80";
  if (t === "electric") return "#facc15";
  if (t === "ice") return "#67e8f9";
  if (t === "fighting") return "#fb7185";
  if (t === "poison") return "#c084fc";
  if (t === "ground") return "#d4a373";
  if (t === "flying") return "#a5b4fc";
  if (t === "psychic") return "#f472b6";
  if (t === "bug") return "#a3e635";
  if (t === "rock") return "#ca8a04";
  if (t === "ghost") return "#818cf8";
  if (t === "dragon") return "#6366f1";
  if (t === "dark") return "#94a3b8";
  if (t === "steel") return "#94a3b8";
  if (t === "fairy") return "#f9a8d4";
  return "rgba(255,255,255,0.45)";
}

export function BattleMenu({
  canUseBag,
  canRun,
  playerActive,
  team,
  currentIndex,
  balls = [],
  busy,
  onFight,
  onBall,
  onOpenPokemon,
  onRun,
}: Props) {
  const [state, setState] = useState<MenuState>("root");
  const canSwitch = useMemo(() => {
    return team.some((m, idx) => idx !== currentIndex && m.hpCurrent > 0);
  }, [team, currentIndex]);

  if (state === "fight") {
    return (
      <View style={styles.grid}>
        {(playerActive?.moves || []).slice(0, 4).map((mv, idx) => (
          <Pressable key={`${mv.id}-${idx}`} style={[styles.btn, mv.pp <= 0 && styles.disabled]} disabled={busy || mv.pp <= 0} onPress={() => onFight(idx)}>
            <Text style={styles.label} numberOfLines={1}>{moveLabel(mv)}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>PP {mv.pp}/{mv.ppMax}</Text>
              <View style={[styles.typeChip, { borderColor: typeColor(mv.type) }]}>
                <Text style={styles.typeText}>{String(mv.type || "normal").toUpperCase()}</Text>
              </View>
            </View>
          </Pressable>
        ))}
        <Pressable style={styles.back} onPress={() => setState("root")}><Text style={styles.label}>Voltar</Text></Pressable>
      </View>
    );
  }

  if (state === "bag") {
    return (
      <View style={styles.gridSingle}>
        {canUseBag && balls.filter((b) => b.quantity > 0).slice(0, 4).map((b) => (
          <Pressable key={b.id} style={styles.btnWide} disabled={busy} onPress={() => onBall(b.id)}>
            <Text style={styles.label}>{b.name}</Text>
            <Text style={styles.meta}>x{b.quantity}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.back} onPress={() => setState("root")}><Text style={styles.label}>Voltar</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      <Pressable style={styles.btn} disabled={busy} onPress={() => setState("fight")}><Text style={styles.label}>FIGHT</Text></Pressable>
      <Pressable style={[styles.btn, !canUseBag && styles.disabled]} disabled={busy || !canUseBag} onPress={() => setState("bag")}><Text style={styles.label}>BAG</Text></Pressable>
      <Pressable style={[styles.btn, !canSwitch && styles.disabled]} disabled={busy || !canSwitch} onPress={onOpenPokemon}><Text style={styles.label}>POKEMON</Text></Pressable>
      <Pressable style={[styles.btn, !canRun && styles.disabled]} disabled={busy || !canRun} onPress={onRun}><Text style={styles.label}>RUN</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridSingle: { gap: 8 },
  btn: {
    width: "48%",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(16,23,45,0.98)",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: 56,
  },
  btnWide: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(16,23,45,0.98)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    minHeight: 50,
  },
  back: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    minHeight: 40,
  },
  label: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  metaRow: { width: "100%", marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  meta: { color: "rgba(255,255,255,0.75)", fontWeight: "700", fontSize: 10 },
  typeChip: {
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  typeText: { color: "rgba(255,255,255,0.88)", fontSize: 9, fontWeight: "800" },
  disabled: { opacity: 0.45 },
});
