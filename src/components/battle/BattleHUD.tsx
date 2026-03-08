import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../theme/colors";

type Props = {
  name: string;
  level: number;
  hpCurrent: number;
  hpTotal: number;
  side: "player" | "enemy";
  showNumericHp?: boolean;
};

export function BattleHUD({ name, level, hpCurrent, hpTotal, side, showNumericHp }: Props) {
  const hpPct = useMemo(() => {
    const p = hpTotal > 0 ? hpCurrent / hpTotal : 0;
    return Math.max(0, Math.min(1, p));
  }, [hpCurrent, hpTotal]);
  const anim = useRef(new Animated.Value(hpPct)).current;
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
        <View style={styles.levelBadge}>
          <Text style={styles.level}>Nv {level}</Text>
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
  levelBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.11)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  level: { color: "rgba(255,255,255,0.94)", fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },
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
});
