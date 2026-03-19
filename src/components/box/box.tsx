import React, { useMemo, useState } from "react";
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { X, ArrowLeftRight, Crown, Lock } from "lucide-react-native";
import { COLORS } from "../../theme/colors";


// Use o mesmo tipo que você já usa no time/box (Mochila usa TeamPokemonUI)
import type { TeamPokemonUI } from "../game/types";

type PlayerType = "FREE" | "VIP";

function getBoxLimit(playerType: PlayerType) {
  return playerType === "VIP" ? 50 : 20;
}

function safeStr(v: any, fallback = "—") {
  if (v === null || v === undefined) return fallback;
  const s = String(v);
  return s.trim().length ? s : fallback;
}

function getGenderSymbol(g: any): { symbol: string; color: string } {
  if (g === "M") return { symbol: "♂", color: "#93C5FD" };
  if (g === "F") return { symbol: "♀", color: "#F9A8D4" };
  return { symbol: "—", color: "rgba(255,255,255,0.65)" };
}

export function Box({
  playerType,
  team,
  box,
  onClose,
  title = "BOX",
  capacityLimitOverride,
  teamPanelTitle = "TIME (selecione um slot)",
  boxPanelTitle = "POKEMON NO BOX",
  primaryActionLabel,
  emptyBoxText = "Capture Pokemon ou mova do time para guardar aqui.",
  extraTeamActionLabel,
  onExtraTeamAction,

  // transfers
  onSwapTeamWithBox,
  onMoveTeamToBox,
  onMoveBoxToTeam,
}: {
  playerType: PlayerType;
  team: TeamPokemonUI[];
  box: TeamPokemonUI[];
  onClose: () => void;
  title?: string;
  capacityLimitOverride?: number;
  teamPanelTitle?: string;
  boxPanelTitle?: string;
  primaryActionLabel?: string;
  emptyBoxText?: string;
  extraTeamActionLabel?: string | null;
  onExtraTeamAction?: (teamSlotIndex: number) => void;

  onSwapTeamWithBox: (teamSlotIndex: number, boxIndex: number) => void;
  onMoveTeamToBox: (teamSlotIndex: number) => void;
  onMoveBoxToTeam: (boxIndex: number, teamSlotIndex: number) => void;
}) {
  const boxLimit = useMemo(
    () => Math.max(1, Number(capacityLimitOverride || getBoxLimit(playerType))),
    [capacityLimitOverride, playerType]
  );
  void boxPanelTitle;
  void emptyBoxText;
  const boxCount = box.length;
  const isBoxFull = boxCount >= boxLimit;

  // seleção do slot do time (1..6). Por padrão, seleciona 1.
  const [selectedTeamSlot, setSelectedTeamSlot] = useState<number>(1);

  const selectedTeamPokemon = useMemo(() => {
    return team[selectedTeamSlot - 1] ?? null;
  }, [team, selectedTeamSlot]);

  function requireTeamSlotValid() {
    const p = selectedTeamPokemon;
    if (!p || p.speciesId === 0) {
      Alert.alert("Selecione um Pokémon", "Escolha um slot do time que tenha um Pokémon.");
      return false;
    }
    return true;
  }

  function handleMoveTeamToBox() {
    if (!requireTeamSlotValid()) return;

    if (isBoxFull) {
      Alert.alert("BOX cheio", "Seu BOX está cheio. Vire VIP para expandir.");
      return;
    }

    // regra: manter pelo menos 1 pokémon no time (mesma regra que você já aplica na Mochila)
    const nonEmpty = team.filter((p) => p && p.speciesId !== 0).length;
    if (nonEmpty <= 1) {
      Alert.alert("Ação não permitida", "Você precisa manter pelo menos 1 Pokémon no time.");
      return;
    }

    onMoveTeamToBox(selectedTeamSlot);
  }

  function handlePickBoxPokemon(boxIndex: number) {

    // se quiser, você pode permitir “mover box -> time” mesmo que slot esteja vazio;
    // aqui a regra: se slot vazio => move box->time, se slot ocupado => swap
    const teamP = selectedTeamPokemon;
    if (!teamP) return;
    if (teamP.speciesId === 0) {
      onMoveBoxToTeam(boxIndex, selectedTeamSlot);
      return;
    }

    if (!requireTeamSlotValid()) return;
    onSwapTeamWithBox(selectedTeamSlot, boxIndex);
  }

  function renderTeamSlot(p: TeamPokemonUI, idx: number) {
    const slot = idx + 1;
    const active = slot === selectedTeamSlot;
    const empty = p.speciesId === 0;

    return (
      <Pressable key={(p as any)?.id ?? `team_${slot}`} onPress={() => setSelectedTeamSlot(slot)} style={styles.teamSlotPress}>
        <LinearGradient
          colors={
            active
              ? [COLORS.primary, COLORS.secondary]
              : ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.06)"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.teamSlotIconWrap, active ? styles.teamSlotActive : null]}
        >
          <View style={styles.teamSlotSpriteOnly}>
            {!empty && p.spriteUrl ? (
              <Image source={{ uri: p.spriteUrl }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
            ) : (
              <Text style={styles.teamSlotSpriteText}>{empty ? "?" : String((p as any)?.name).slice(0, 1).toUpperCase()}</Text>
            )}
          </View>
        </LinearGradient>
      </Pressable>
    );
  }

  function renderBoxItem({ item, index }: { item: TeamPokemonUI; index: number }) {
    const g = getGenderSymbol((item as any)?.gender);

    return (
      <Pressable onPress={() => handlePickBoxPokemon(index)} style={{ flex: 1, borderRadius: 18, overflow: "hidden" }}>
        <LinearGradient
          colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.06)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.boxCard}
        >
          <View style={styles.boxSpriteFrame}>
            {item.spriteUrl ? (
              <Image source={{ uri: item.spriteUrl }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
            ) : (
              <Text style={styles.teamSlotSpriteText}>{String((item as any)?.name).slice(0, 1).toUpperCase()}</Text>
            )}
          </View>

          <Text style={styles.boxName} numberOfLines={1}>
            {safeStr((item as any)?.nickname, safeStr((item as any)?.name))}
          </Text>

          <View style={styles.boxMetaRow}>
            <Text style={styles.boxMeta}>{`Nv ${item.level}`}</Text>
            <Text style={[styles.genderIcon, { color: g.color }]}>{g.symbol}</Text>
          </View>

          <Text style={styles.boxHint} numberOfLines={1}>
            Toque para trocar
          </Text>
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={["rgba(0,0,0,0.92)", "rgba(45,45,45,0.92)"]} style={styles.shell}>
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.subtitle}>{`Capacidade: ${boxCount}/${boxLimit}`}</Text>
              {playerType === "VIP" ? (
                <View style={styles.vipBadge}>
                  <Crown size={14} color={COLORS.white} />
                  <Text style={styles.vipText}>VIP</Text>
                </View>
              ) : (
                <View style={styles.freeBadge}>
                  <Lock size={14} color={COLORS.white} />
                  <Text style={styles.vipText}>FREE</Text>
                </View>
              )}
            </View>
          </View>

          <Pressable onPress={onClose} style={styles.iconBtn}>
            <X size={18} color={COLORS.white} />
          </Pressable>
        </View>

        {/* TEAM SELECTOR */}
        <LinearGradient colors={["rgba(59,130,246,0.20)", "rgba(167,139,250,0.10)"]} style={styles.teamPanel}>
          <Text style={styles.panelTitle}>{teamPanelTitle}</Text>
          <View style={styles.teamSlotsRow}>
            {team.map((p, idx) => renderTeamSlot(p, idx))}
          </View>

          <LinearGradient colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.05)"]} style={styles.teamSelectedCard}>
            {selectedTeamPokemon && selectedTeamPokemon.speciesId !== 0 ? (
              <View style={styles.teamSelectedRow}>
                <View style={styles.teamSelectedSprite}>
                  {selectedTeamPokemon.spriteUrl ? (
                    <Image source={{ uri: selectedTeamPokemon.spriteUrl }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
                  ) : (
                    <Text style={styles.teamSlotSpriteText}>{String((selectedTeamPokemon as any)?.name).slice(0, 1).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.teamSelectedName} numberOfLines={1}>
                    {safeStr((selectedTeamPokemon as any)?.nickname, safeStr((selectedTeamPokemon as any)?.name))}
                  </Text>
                  <View style={styles.teamSelectedMetaRow}>
                    <Text style={styles.teamSelectedMeta}>{`Nv ${selectedTeamPokemon.level}`}</Text>
                    {(() => {
                      const g = getGenderSymbol((selectedTeamPokemon as any)?.gender);
                      return <Text style={[styles.genderIcon, { color: g.color }]}>{g.symbol}</Text>;
                    })()}
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.teamSelectedEmpty}>
                <Text style={styles.teamSelectedEmptyTitle}>{`Slot ${selectedTeamSlot}`}</Text>
                <Text style={styles.teamSelectedEmptyMeta}>Vazio</Text>
              </View>
            )}
          </LinearGradient>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable onPress={handleMoveTeamToBox} style={{ flex: 1 }}>
              <LinearGradient
                colors={
                  isBoxFull
                    ? ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.06)"]
                    : [COLORS.primary, COLORS.secondary]
                }
                style={styles.primaryBtn}
              >
                <ArrowLeftRight size={16} color={COLORS.white} />
                <Text style={styles.primaryBtnText}>
                  {isBoxFull ? "BOX cheio" : primaryActionLabel || "Mover p/ BOX"}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
          {extraTeamActionLabel && onExtraTeamAction ? (
            <View style={{ marginTop: 10 }}>
              <Pressable onPress={() => onExtraTeamAction(selectedTeamSlot)}>
                <LinearGradient colors={["rgba(16,185,129,0.24)", "rgba(59,130,246,0.16)"]} style={styles.secondaryBtn}>
                  <Text style={styles.primaryBtnText}>{extraTeamActionLabel}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : null}

          {isBoxFull && playerType === "FREE" ? (
            <Text style={styles.limitHint}>Seu BOX está cheio. Vire VIP para expandir.</Text>
          ) : null}
        </LinearGradient>

        {/* BOX GRID */}
        <View style={{ flex: 1 }}>
          <Text style={[styles.panelTitle, { marginBottom: 10 }]}>POKÉMON NO BOX</Text>

          <FlatList
            data={box}
            keyExtractor={(item, index) => String((item as any)?.id ?? `box_${index}`)}
            numColumns={3}
            columnWrapperStyle={{ gap: 10 }}
            contentContainerStyle={{ gap: 10, paddingBottom: 12 }}
            renderItem={renderBoxItem}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>BOX vazia</Text>
                <Text style={styles.emptyText}>Capture Pokémon ou mova do time para guardar aqui.</Text>
              </View>
            }
          />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 14 },
  shell: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 14,
  },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  title: { color: COLORS.white, fontSize: 18, fontWeight: "900", letterSpacing: 2 },
  subtitle: { color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 12 },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  vipBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(167,139,250,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  freeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  vipText: { color: COLORS.white, fontWeight: "900", fontSize: 11, letterSpacing: 0.4 },

  teamPanel: {
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginBottom: 12,
  },
  teamSlotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  teamSlotPress: {
    width: 44,
    height: 44,
    borderRadius: 14,
    overflow: "hidden",
  },
  teamSlotIconWrap: {
    width: "100%",
    height: "100%",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  teamSlotSpriteOnly: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  teamSelectedCard: {
    marginTop: 10,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  teamSelectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  teamSelectedSprite: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  teamSelectedName: { color: COLORS.white, fontWeight: "900", fontSize: 13 },
  teamSelectedMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  teamSelectedMeta: { color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 12 },
  teamSelectedEmpty: { alignItems: "center", justifyContent: "center", paddingVertical: 6 },
  teamSelectedEmptyTitle: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  teamSelectedEmptyMeta: { color: "rgba(255,255,255,0.70)", fontWeight: "800", marginTop: 2 },

  panelTitle: { color: "rgba(255,255,255,0.75)", fontWeight: "900", fontSize: 11, letterSpacing: 1.2 },

  teamSlot: {
    borderRadius: 18,
    padding: 10,
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
  },
  teamSlotActive: { borderColor: "rgba(255,255,255,0.22)" },

  teamSlotSprite: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  teamSlotSpriteText: { color: COLORS.white, fontWeight: "900", fontSize: 18 },

  teamSlotName: { color: COLORS.white, fontWeight: "900", fontSize: 13 },
  teamSlotMeta: { color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 12 },
  genderIcon: { fontWeight: "900", fontSize: 14 },

  primaryBtn: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtn: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  primaryBtnText: { color: COLORS.white, fontWeight: "900", fontSize: 12, letterSpacing: 0.5 },

  limitHint: { marginTop: 8, color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 12 },

  boxCard: {
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
  boxSpriteFrame: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    marginBottom: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  boxName: { color: COLORS.white, fontWeight: "900", fontSize: 11, textAlign: "center" },
  boxMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  boxMeta: { color: "rgba(255,255,255,0.75)", fontWeight: "800", fontSize: 11 },
  boxHint: { color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 10, marginTop: 6 },

  emptyBox: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  emptyTitle: { color: COLORS.white, fontWeight: "900", marginBottom: 6 },
  emptyText: { color: "rgba(255,255,255,0.70)", fontWeight: "800", lineHeight: 18 },
});
