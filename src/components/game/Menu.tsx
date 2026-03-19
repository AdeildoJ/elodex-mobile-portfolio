import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "../../theme/colors";
import type { GameActionKey } from "./types";

import {
  Backpack,
  Compass,
  Swords,
  CalendarDays,
  ShoppingBag,
} from "lucide-react-native";

type Props = {
  activeAction: GameActionKey;
  onChange: (key: GameActionKey) => void;
};

type NavItem = {
  key: GameActionKey;
  Icon: typeof Backpack;
};

const BAR_HEIGHT = 58;
const ACTIVE_SIZE = 58;

export function GameMenu({ activeAction, onChange }: Props) {
  const nav: NavItem[] = useMemo(
    () => [
      { key: "BAG" as GameActionKey, Icon: Backpack },
      { key: "EXPLORE" as GameActionKey, Icon: Compass },
      { key: "BATTLES" as GameActionKey, Icon: Swords },
      { key: "SHOP" as GameActionKey, Icon: ShoppingBag },
      { key: "EVENTS" as GameActionKey, Icon: CalendarDays },
    ],
    []
  );

  const activeIndex = Math.max(0, nav.findIndex((item) => String(item.key) === String(activeAction)));
  const activeCenterStyle = { left: `${((activeIndex + 0.5) / nav.length) * 100}%` as any };
  const ActiveIcon = nav[activeIndex]?.Icon ?? Backpack;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.shell}>
        <View style={styles.shadowPlate} />

        <View style={styles.barWrap}>
          <View style={styles.leftCap} />
          <View style={styles.rightCap} />

          <View style={styles.bar}>
            <View style={[styles.notchSeat, activeCenterStyle]} />

            <View style={styles.row}>
              {nav.map((item) => {
                const isActive = String(item.key) === String(activeAction);
                const IconComp = item.Icon;

                return (
                  <Pressable
                    key={String(item.key)}
                    onPress={() => onChange(item.key)}
                    style={({ pressed }) => [styles.slot, pressed ? styles.slotPressed : null]}
                  >
                    {isActive ? (
                      <View style={styles.activeGhost} />
                    ) : (
                      <IconComp size={22} color="#FFFFFF" strokeWidth={2.1} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <Pressable onPress={() => onChange(nav[activeIndex]?.key ?? "BAG")} style={[styles.activeButton, activeCenterStyle]}>
          <View style={styles.activeRing}>
            <LinearGradient
              colors={[COLORS.secondary, COLORS.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.activeFill}
            >
              <ActiveIcon size={23} color={COLORS.white} strokeWidth={2.4} />
            </LinearGradient>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 46,
    alignItems: "center",
  },
  shell: {
    width: "88%",
    height: 86,
    justifyContent: "flex-end",
  },
  shadowPlate: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 2,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.16)",
    shadowColor: "#000",
    shadowOpacity: 0.34,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  barWrap: {
    position: "relative",
    justifyContent: "flex-end",
  },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: 18,
    backgroundColor: "#05070D",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    overflow: "hidden",
  },
  leftCap: {
    position: "absolute",
    left: 6,
    bottom: 18,
    width: 34,
    height: 20,
    borderRadius: 8,
    backgroundColor: "#05070D",
    transform: [{ skewX: "-28deg" }],
  },
  rightCap: {
    position: "absolute",
    right: 6,
    bottom: 18,
    width: 18,
    height: 16,
    borderRadius: 6,
    backgroundColor: "#05070D",
    transform: [{ skewX: "-24deg" }],
  },
  notchSeat: {
    position: "absolute",
    top: -18,
    width: 74,
    height: 34,
    marginLeft: -37,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: "#05070D",
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  slot: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  slotPressed: {
    opacity: 0.86,
  },
  activeGhost: {
    width: 24,
    height: 24,
  },
  activeButton: {
    position: "absolute",
    top: 0,
    width: ACTIVE_SIZE,
    height: ACTIVE_SIZE,
    marginLeft: -(ACTIVE_SIZE / 2),
  },
  activeRing: {
    flex: 1,
    borderRadius: ACTIVE_SIZE / 2,
    backgroundColor: "#05070D",
    padding: 3,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  activeFill: {
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
