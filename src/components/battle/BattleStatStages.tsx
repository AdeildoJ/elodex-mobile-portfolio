import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Crosshair, Shield, Sparkles, Sword, Wind, ShieldPlus, Rabbit } from "lucide-react-native";

type Props = {
  atkStage?: number;
  defStage?: number;
  spaStage?: number;
  spdStage?: number;
  speStage?: number;
  accuracyStage?: number;
  evasionStage?: number;
};

type StageEntry = {
  key: string;
  value: number;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
};

const ICON_COLOR = "rgba(255,255,255,0.92)";

export function BattleStatStages(props: Props) {
  const items = useMemo<StageEntry[]>(() => {
    const entries: StageEntry[] = [
      { key: "atk", value: Number(props.atkStage || 0), icon: Sword },
      { key: "def", value: Number(props.defStage || 0), icon: Shield },
      { key: "spa", value: Number(props.spaStage || 0), icon: Sparkles },
      { key: "spd", value: Number(props.spdStage || 0), icon: ShieldPlus },
      { key: "spe", value: Number(props.speStage || 0), icon: Rabbit },
      { key: "acc", value: Number(props.accuracyStage || 0), icon: Crosshair },
      { key: "eva", value: Number(props.evasionStage || 0), icon: Wind },
    ];
    return entries.filter((entry) => entry.value !== 0);
  }, [props.accuracyStage, props.atkStage, props.defStage, props.evasionStage, props.spaStage, props.spdStage, props.speStage]);

  if (!items.length) return null;

  return (
    <View style={styles.row}>
      {items.map((item) => {
        const Icon = item.icon;
        const positive = item.value > 0;
        return (
          <View
            key={item.key}
            style={[
              styles.badge,
              positive ? styles.buffBadge : styles.debuffBadge,
            ]}
          >
            <Icon size={11} color={ICON_COLOR} strokeWidth={2.2} />
            <Text style={styles.value}>{positive ? `+${item.value}` : `${item.value}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
  },
  buffBadge: {
    backgroundColor: "rgba(34,197,94,0.18)",
    borderColor: "rgba(34,197,94,0.42)",
  },
  debuffBadge: {
    backgroundColor: "rgba(239,68,68,0.16)",
    borderColor: "rgba(239,68,68,0.34)",
  },
  value: {
    color: ICON_COLOR,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
});
