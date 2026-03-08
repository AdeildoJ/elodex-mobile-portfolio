import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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

// 🔥 ÍCONES GRANDES (ajuste aqui se quiser ainda maior)
const ICON_INACTIVE = 34;
const ICON_ACTIVE = 42;

// barra mais alta (melhor leitura)
const BAR_H = 92;

type NavItem = {
  key: GameActionKey;
  label: string;
  Icon: any;
};

export function GameMenu({ activeAction, onChange }: Props) {
  // Mantemos os labels em PT-BR, mas com chaves internas canônicas.
  const isPT = true;

  const nav: NavItem[] = useMemo(() => {
    if (isPT) {
      return [
        { key: "BAG" as GameActionKey, label: "Mochila", Icon: Backpack },
        { key: "EXPLORE" as GameActionKey, label: "Explorar", Icon: Compass },
        { key: "BATTLES" as GameActionKey, label: "Batalhas", Icon: Swords },
        { key: "SHOP" as GameActionKey, label: "Loja", Icon: ShoppingBag },
        { key: "EVENTS" as GameActionKey, label: "Eventos", Icon: CalendarDays },
      ];
    }

    // fallback EN (caso seu GameActionKey esteja em inglês no HUB)
    return [
      { key: "BAG" as GameActionKey, label: "Bag", Icon: Backpack },
      { key: "EXPLORE" as GameActionKey, label: "Explore", Icon: Compass },
      { key: "BATTLES" as GameActionKey, label: "Battles", Icon: Swords },
      { key: "SHOP" as GameActionKey, label: "Shop", Icon: ShoppingBag },
      { key: "EVENTS" as GameActionKey, label: "Events", Icon: CalendarDays },
    ];
  }, [isPT]);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        {/* Glass / HUD base */}
        <LinearGradient
          colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.04)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* “Traço rico” superior */}
        <View style={styles.hairlineTop} />

        {/* Conteúdo */}
        <View style={styles.row}>
          {nav.map((item) => {
            const isActive = String(item.key) === String(activeAction);
            const IconComp = item.Icon;

            return (
              <Pressable
                key={String(item.key)}
                onPress={() => onChange(item.key)}
                style={({ pressed }) => [
                  styles.slot,
                  pressed && { opacity: 0.9 },
                ]}
              >
                {/* “Chip” ativo (diferencial forte, mas minimalista) */}
                <View style={[styles.chip, isActive && styles.chipActive]}>
                  {/* brilho do ativo */}
                  {isActive && (
                    <LinearGradient
                      colors={[
                        "rgba(59,130,246,0.35)",
                        "rgba(167,139,250,0.22)",
                        "rgba(255,255,255,0.00)",
                      ]}
                      start={{ x: 0.2, y: 0 }}
                      end={{ x: 0.8, y: 1 }}
                      style={styles.activeGlow}
                    />
                  )}

                  <IconComp
                    size={isActive ? ICON_ACTIVE : ICON_INACTIVE}
                    color={isActive ? COLORS.white : "rgba(255,255,255,0.55)"}
                    strokeWidth={isActive ? 2.6 : 2.2}
                  />

                  {/* label opcional (profissional). Se você NÃO quiser texto, eu removo. */}
                  <Text style={[styles.label, isActive ? styles.labelActive : styles.labelInactive]}>
                    {item.label}
                  </Text>

                  {/* underline do ativo */}
                  <View style={[styles.underline, isActive && styles.underlineActive]} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: "center",
  },

  bar: {
    width: "94%",
    height: BAR_H,
    borderRadius: 30,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    // sombras
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },

  hairlineTop: {
    position: "absolute",
    top: 0,
    left: 18,
    right: 18,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
  },

  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  slot: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  chip: {
    width: 68,
    height: 66,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  chipActive: {
    backgroundColor: "rgba(255,255,255,0.09)",
    borderColor: "rgba(255,255,255,0.16)",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    transform: [{ translateY: -2 }],
  },

  activeGlow: {
    position: "absolute",
    top: -14,
    left: -14,
    right: -14,
    bottom: -14,
    borderRadius: 28,
  },

  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  labelActive: {
    color: "rgba(255,255,255,0.92)",
  },
  labelInactive: {
    color: "rgba(255,255,255,0.42)",
  },

  underline: {
    marginTop: 2,
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  underlineActive: {
    backgroundColor: "rgba(255,255,255,0.70)",
  },
});
