import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../theme/colors";
import { BattleStatStages } from "./BattleStatStages";

type Props = {
  name: string;
  level: number;
  hpCurrent: number;
  hpTotal: number;
  side: "player" | "enemy";
  showNumericHp?: boolean;
  status?: string | null;
  expCurrent?: number;
  expToNext?: number;
  showExpBar?: boolean;
  atkStage?: number;
  defStage?: number;
  spaStage?: number;
  spdStage?: number;
  speStage?: number;
  accuracyStage?: number;
  evasionStage?: number;
};

function statusBadge(status: string | null | undefined) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "sleep") return { label: "SLP", bg: "#7c3aed" };
  if (value === "poison") return { label: "PSN", bg: "#a855f7" };
  if (value === "bad-poison") return { label: "TOX", bg: "#7e22ce" };
  if (value === "burn") return { label: "BRN", bg: "#f97316" };
  if (value === "paralyze") return { label: "PAR", bg: "#facc15" };
  if (value === "freeze") return { label: "FRZ", bg: "#38bdf8" };
  return null;
}

export function BattleHUD({
  name,
  level,
  hpCurrent,
  hpTotal,
  side,
  showNumericHp,
  status,
  expCurrent = 0,
  expToNext = 100,
  showExpBar,
  atkStage,
  defStage,
  spaStage,
  spdStage,
  speStage,
  accuracyStage,
  evasionStage,
}: Props) {
  const hpPct = useMemo(() => {
    const p = hpTotal > 0 ? hpCurrent / hpTotal : 0;
    return Math.max(0, Math.min(1, p));
  }, [hpCurrent, hpTotal]);
  const expPct = useMemo(() => {
    const max = Math.max(1, expToNext);
    return Math.max(0, Math.min(1, expCurrent / max));
  }, [expCurrent, expToNext]);
  const statusMeta = useMemo(() => statusBadge(status), [status]);
  const anim = useRef(new Animated.Value(hpPct)).current;
  const expAnim = useRef(new Animated.Value(expPct)).current;
  const lowHpPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: hpPct,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [anim, hpPct]);

  useEffect(() => {
    Animated.timing(expAnim, {
      toValue: expPct,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [expAnim, expPct]);

  useEffect(() => {
    if (hpPct > 0.2) {
      lowHpPulse.stopAnimation();
      lowHpPulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(lowHpPulse, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(lowHpPulse, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hpPct, lowHpPulse]);

  return (
    <Animated.View
      style={[
        styles.box,
        side === "enemy" ? styles.enemy : styles.player,
        hpPct <= 0.2
          ? {
              borderColor: lowHpPulse.interpolate({
                inputRange: [0, 1],
                outputRange: ["rgba(248,113,113,0.35)", "rgba(239,68,68,0.92)"],
              }),
            }
          : null,
      ]}
    >
      <View style={styles.topRow}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <View style={styles.topMetaRow}>
          {statusMeta ? (
            <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
              <Text style={styles.statusText}>{statusMeta.label}</Text>
            </View>
          ) : null}
          <View style={styles.levelBadge}>
            <Text style={styles.level}>Nv {level}</Text>
          </View>
        </View>
      </View>
      <View style={styles.hpRow}>
        <Text style={styles.hpTag}>HP</Text>
        <View style={styles.track}>
          <Animated.View
            style={[
              styles.fill,
              hpPct < 0.2 ? styles.red : hpPct < 0.5 ? styles.yellow : styles.green,
              {
                width: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
      </View>
      <View style={styles.bottomRow}>
        {showNumericHp ? <Text style={styles.hpText}>{Math.max(0, hpCurrent)}/{Math.max(1, hpTotal)}</Text> : <View />}
        <Text style={styles.percent}>{Math.round(hpPct * 100)}%</Text>
      </View>
      <BattleStatStages
        atkStage={atkStage}
        defStage={defStage}
        spaStage={spaStage}
        spdStage={spdStage}
        speStage={speStage}
        accuracyStage={accuracyStage}
        evasionStage={evasionStage}
      />
      {showExpBar ? (
        <View style={styles.expRow}>
          <Text style={styles.expTag}>EXP</Text>
          <View style={styles.expTrack}>
            <Animated.View
              style={[
                styles.expFill,
                {
                  width: expAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    minWidth: 208,
    maxWidth: 290,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(4,9,24,0.64)",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  enemy: { alignSelf: "flex-start" },
  player: { alignSelf: "flex-end" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: { color: COLORS.white, fontWeight: "900", fontSize: 15, flex: 1, letterSpacing: 0.2 },
  topMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  levelBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.11)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  level: { color: "rgba(255,255,255,0.94)", fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  statusText: { color: COLORS.white, fontWeight: "900", fontSize: 10, letterSpacing: 0.4 },
  hpRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hpTag: { color: "#fde047", fontWeight: "900", fontSize: 11 },
  track: {
    flex: 1,
    height: 12,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  fill: { height: "100%" },
  green: { backgroundColor: "#22c55e" },
  yellow: { backgroundColor: "#eab308" },
  red: { backgroundColor: "#ef4444" },
  bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hpText: { color: "rgba(255,255,255,0.94)", fontWeight: "800", fontSize: 11, textAlign: "right" },
  percent: { color: "rgba(255,255,255,0.76)", fontWeight: "800", fontSize: 10 },
  expRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  expTag: { color: "#93c5fd", fontWeight: "900", fontSize: 10 },
  expTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(59,130,246,0.16)",
    borderWidth: 1,
    borderColor: "rgba(147,197,253,0.28)",
  },
  expFill: { height: "100%", backgroundColor: "#60a5fa" },
});
