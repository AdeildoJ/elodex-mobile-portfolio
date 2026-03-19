import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { COLORS } from "../../theme/colors";

type EggItem = {
  id: string;
  speciesName: string;
  stepsRequired: number;
  stepsProgress: number;
  status: "stored" | "incubating" | "ready" | "hatched";
  inheritedEggMoves?: string[];
  hatchMode?: "steps" | "time";
  readyAtMs?: number | null;
  requiresIncubator?: boolean;
  incubatorAssignedAt?: unknown;
  startedAtMs?: number | null;
  endsAtMs?: number | null;
  incubatorId?: string | null;
  storageLocation?: "team" | "box";
  storageSlotIndex?: number | null;
};

type IncubatorOption = {
  id: string;
  name: string;
  quantity: number;
  hatchDays: number;
};

type Props = {
  eggs: EggItem[];
  team: {
    speciesId: number;
    name: string;
    nickname?: string;
    gender?: string;
  }[];
  daycare: {
    active: boolean;
    parentSlotA: number | null;
    parentSlotB: number | null;
    stepsSinceLastEgg: number;
    eggStepThreshold: number;
    eggsGenerated: number;
    daycareTier?: "FREE" | "VIP";
    eggHatchDays?: number;
  };
  daycareUnlocked?: boolean;
  daycareUnlockHint?: string | null;
  incubatorCount?: number;
  incubators?: IncubatorOption[];
  onHatchEgg: (eggId: string) => Promise<void> | void;
  onCreateEgg: (slotA: number, slotB: number) => Promise<void> | void;
  onAssignIncubator: (eggId: string, incubatorId?: string) => Promise<void> | void;
  onSetDaycareParents: (slotA: number, slotB: number) => Promise<void> | void;
  onToggleDaycare: (active: boolean) => Promise<void> | void;
  onClearDaycare: () => Promise<void> | void;
};

function pct(progress: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((progress / total) * 100)));
}

export function EggsPanel({
  eggs,
  team,
  daycare,
  daycareUnlocked = true,
  daycareUnlockHint = null,
  incubatorCount = 0,
  incubators = [],
  onHatchEgg,
  onCreateEgg,
  onAssignIncubator,
  onSetDaycareParents,
  onToggleDaycare,
  onClearDaycare,
}: Props) {
  const activeEggs = eggs.filter((e) => e.status !== "hatched");
  const teamEggs = activeEggs.filter((egg) => egg.storageLocation === "team");
  const boxEggs = activeEggs.filter((egg) => egg.storageLocation !== "team");
  const teamSlots = useMemo(
    () =>
      team
        .map((p, idx) => ({ ...p, slotIndex: idx + 1 }))
        .filter((p) => Number(p.speciesId) > 0),
    [team]
  );
  const [slotA, setSlotA] = useState<number | null>(null);
  const [slotB, setSlotB] = useState<number | null>(null);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Ovos</Text>

      <View style={styles.breedingCard}>
        <Text style={styles.breedingTitle}>Breeding</Text>
        <Text style={styles.breedingHint}>Selecione dois slots do time para gerar um ovo.</Text>

        <View style={styles.slotGrid}>
          {teamSlots.map((p) => {
            const label = p.nickname ? `${p.name} (${p.nickname})` : p.name;
            const activeA = slotA === p.slotIndex;
            const activeB = slotB === p.slotIndex;
            return (
              <View key={`breed-slot-${p.slotIndex}`} style={styles.slotCard}>
                <Text style={styles.slotLabel}>Slot {p.slotIndex}</Text>
                <Text numberOfLines={1} style={styles.slotName}>{label}</Text>
                <Text style={styles.slotMeta}>Genero: {p.gender || "-"}</Text>
                <View style={styles.slotActions}>
                  <Pressable
                    onPress={() => setSlotA((prev) => (prev === p.slotIndex ? null : p.slotIndex))}
                    style={[styles.slotBtn, activeA && styles.slotBtnActive]}
                  >
                    <Text style={styles.slotBtnText}>Pai A</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSlotB((prev) => (prev === p.slotIndex ? null : p.slotIndex))}
                    style={[styles.slotBtn, activeB && styles.slotBtnActive]}
                  >
                    <Text style={styles.slotBtnText}>Pai B</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>

        <Pressable
          disabled={!slotA || !slotB || slotA === slotB}
          onPress={async () => {
            if (!slotA || !slotB || slotA === slotB) return;
            await onCreateEgg(slotA, slotB);
          }}
          style={[styles.createBtn, (!slotA || !slotB || slotA === slotB) && styles.createBtnDisabled]}
        >
          <Text style={styles.createBtnText}>Gerar Ovo</Text>
        </Pressable>
        <View style={styles.daycareBox}>
          <Text style={styles.daycareTitle}>Daycare</Text>
          {!daycareUnlocked ? (
            <Text style={styles.daycareMeta}>
              {daycareUnlockHint || "Daycare bloqueado. Desbloqueie um bioma com Daycare."}
            </Text>
          ) : (
            <>
              <Text style={styles.daycareMeta}>
                Status: {daycare.active ? "Ativo" : "Pausado"} | Pais:{" "}
                {daycare.parentSlotA ? `S${daycare.parentSlotA}` : "-"} /{" "}
                {daycare.parentSlotB ? `S${daycare.parentSlotB}` : "-"}
              </Text>
              <Text style={styles.daycareMeta}>
                Progresso: {daycare.stepsSinceLastEgg}/{daycare.eggStepThreshold} | Ovos gerados: {daycare.eggsGenerated}
              </Text>
              <Text style={styles.daycareMeta}>
                Perfil: {daycare.daycareTier || "FREE"} | Hatch por tempo: {Math.max(1, Number(daycare.eggHatchDays || 1))} dia(s)
              </Text>
              <View style={styles.daycareActions}>
                <Pressable
                  disabled={!slotA || !slotB || slotA === slotB}
                  onPress={async () => {
                    if (!slotA || !slotB || slotA === slotB) return;
                    await onSetDaycareParents(slotA, slotB);
                  }}
                  style={[styles.slotBtn, (!slotA || !slotB || slotA === slotB) && styles.createBtnDisabled]}
                >
                  <Text style={styles.slotBtnText}>Definir Pais</Text>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    await onToggleDaycare(!daycare.active);
                  }}
                  style={[styles.slotBtn, daycare.active && styles.slotBtnActive]}
                >
                  <Text style={styles.slotBtnText}>{daycare.active ? "Pausar" : "Ativar"}</Text>
                </Pressable>
                <Pressable onPress={async () => onClearDaycare()} style={styles.slotBtn}>
                  <Text style={styles.slotBtnText}>Limpar</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>

      {!activeEggs.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Sem ovos em incubacao</Text>
          <Text style={styles.emptyText}>Compre ou gere um ovo e inicie a incubacao manualmente.</Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {teamEggs.length ? <Text style={styles.sectionTitle}>Ovos reservados no time</Text> : null}
          {teamEggs.map((egg) => {
            const progress = Math.max(0, Number(egg.stepsProgress || 0));
            const required = Math.max(1, Number(egg.stepsRequired || 1));
            const hatchMode = egg.hatchMode === "time" ? "time" : "steps";
            const readyAtMs = Math.max(0, Number(egg.endsAtMs || egg.readyAtMs || 0));
            const readyByTime = hatchMode === "time" && readyAtMs > 0 && Date.now() >= readyAtMs;
            const ready = egg.status === "ready" || readyByTime || progress >= required;
            const requiresIncubator = !!egg.requiresIncubator;
            const incubatorAssigned = !!egg.incubatorAssignedAt;
            const needsIncubator = egg.status === "stored" && requiresIncubator && !incubatorAssigned;
            const remainingMs = hatchMode === "time" && readyAtMs > 0 ? Math.max(0, readyAtMs - Date.now()) : 0;
            const hours = Math.floor(remainingMs / (1000 * 60 * 60));
            const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
            return (
              <LinearGradient
                key={egg.id}
                colors={["rgba(59,130,246,0.18)", "rgba(255,255,255,0.05)"]}
                style={styles.card}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{egg.speciesName} Egg</Text>
                  <Text style={styles.badge}>{ready ? "Pronto" : egg.status === "stored" ? "Armazenado" : "Incubando"}</Text>
                </View>
                <Text style={styles.meta}>Local: Time principal{egg.storageSlotIndex ? ` • Slot ${egg.storageSlotIndex}` : ""}</Text>
                {egg.status === "stored" ? (
                  <>
                    <Text style={styles.meta}>Esse ovo aguarda incubacao manual.</Text>
                    <Text style={styles.meta}>Incubadoras disponiveis: {incubatorCount}</Text>
                  </>
                ) : hatchMode === "steps" ? (
                  <>
                    <Text style={styles.meta}>{progress}/{required} passos</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct(progress, required)}%` }]} />
                    </View>
                  </>
                ) : (
                  <Text style={styles.meta}>Hatch por tempo: {ready ? "pronto" : `${hours}h ${minutes}m restantes`}</Text>
                )}
                {!!egg.inheritedEggMoves?.length ? <Text style={styles.meta}>Egg Moves: {egg.inheritedEggMoves.join(", ")}</Text> : null}
                {!!egg.incubatorId ? <Text style={styles.meta}>Incubadora: {egg.incubatorId}</Text> : null}
                {needsIncubator ? (
                  <View style={styles.incubatorList}>
                    {incubators.length ? incubators.map((incubator) => (
                      <Pressable key={`${egg.id}-${incubator.id}`} onPress={() => onAssignIncubator(egg.id, incubator.id)} style={styles.hatchBtn}>
                        <Text style={styles.hatchBtnText}>Usar {incubator.name} ({incubator.quantity}x)</Text>
                      </Pressable>
                    )) : (
                      <Pressable onPress={() => onAssignIncubator(egg.id)} style={[styles.hatchBtn, styles.hatchBtnDisabled]} disabled>
                        <Text style={styles.hatchBtnText}>Sem incubadora disponivel</Text>
                      </Pressable>
                    )}
                  </View>
                ) : null}
                <Pressable onPress={() => onHatchEgg(egg.id)} disabled={!ready} style={[styles.hatchBtn, !ready && styles.hatchBtnDisabled]}>
                  <Text style={styles.hatchBtnText}>{ready ? "Chocar" : "Aguardando"}</Text>
                </Pressable>
              </LinearGradient>
            );
          })}
          {boxEggs.length ? <Text style={styles.sectionTitle}>Ovos armazenados na BOX</Text> : null}
          {boxEggs.map((egg) => {
            const progress = Math.max(0, Number(egg.stepsProgress || 0));
            const required = Math.max(1, Number(egg.stepsRequired || 1));
            const hatchMode = egg.hatchMode === "time" ? "time" : "steps";
            const readyAtMs = Math.max(0, Number(egg.endsAtMs || egg.readyAtMs || 0));
            const readyByTime = hatchMode === "time" && readyAtMs > 0 && Date.now() >= readyAtMs;
            const ready = egg.status === "ready" || readyByTime || progress >= required;
            const requiresIncubator = !!egg.requiresIncubator;
            const incubatorAssigned = !!egg.incubatorAssignedAt;
            const needsIncubator = egg.status === "stored" && requiresIncubator && !incubatorAssigned;
            const remainingMs = hatchMode === "time" && readyAtMs > 0 ? Math.max(0, readyAtMs - Date.now()) : 0;
            const hours = Math.floor(remainingMs / (1000 * 60 * 60));
            const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
            return (
              <LinearGradient
                key={egg.id}
                colors={["rgba(59,130,246,0.18)", "rgba(255,255,255,0.05)"]}
                style={styles.card}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{egg.speciesName} Egg</Text>
                  <Text style={styles.badge}>{ready ? "Pronto" : egg.status === "stored" ? "Armazenado" : "Incubando"}</Text>
                </View>
                <Text style={styles.meta}>Local: BOX</Text>

                {egg.status === "stored" ? (
                  <>
                    <Text style={styles.meta}>Esse ovo aguarda incubacao manual.</Text>
                    <Text style={styles.meta}>Incubadoras disponiveis: {incubatorCount}</Text>
                  </>
                ) : hatchMode === "steps" ? (
                  <>
                    <Text style={styles.meta}>{progress}/{required} passos</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct(progress, required)}%` }]} />
                    </View>
                    {requiresIncubator ? (
                      <Text style={styles.meta}>
                        Chocadeira: {incubatorAssigned ? "Ativa" : `Necessaria (${incubatorCount} no inventario)`}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.meta}>
                    Hatch por tempo: {ready ? "pronto" : `${hours}h ${minutes}m restantes`}
                  </Text>
                )}

                {!!egg.inheritedEggMoves?.length ? (
                  <Text style={styles.meta}>Egg Moves: {egg.inheritedEggMoves.join(", ")}</Text>
                ) : null}

                {needsIncubator ? (
                  <View style={styles.incubatorList}>
                    {incubators.length ? incubators.map((incubator) => (
                      <Pressable
                        key={`${egg.id}-${incubator.id}`}
                        onPress={() => onAssignIncubator(egg.id, incubator.id)}
                        style={styles.hatchBtn}
                      >
                        <Text style={styles.hatchBtnText}>
                          Usar {incubator.name} ({incubator.quantity}x)
                        </Text>
                      </Pressable>
                    )) : (
                      <Pressable
                        onPress={() => onAssignIncubator(egg.id)}
                        style={[styles.hatchBtn, styles.hatchBtnDisabled]}
                        disabled
                      >
                        <Text style={styles.hatchBtnText}>Sem incubadora disponivel</Text>
                      </Pressable>
                    )}
                  </View>
                ) : null}

                <Pressable
                  onPress={() => onHatchEgg(egg.id)}
                  disabled={!ready}
                  style={[styles.hatchBtn, !ready && styles.hatchBtnDisabled]}
                >
                  <Text style={styles.hatchBtnText}>{ready ? "Chocar" : "Aguardando"}</Text>
                </Pressable>
              </LinearGradient>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 10,
    gap: 8,
  },
  title: { color: COLORS.white, fontWeight: "900", fontSize: 14 },
  breedingCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 10,
    gap: 8,
  },
  breedingTitle: { color: COLORS.white, fontWeight: "900", fontSize: 13 },
  breedingHint: { color: "rgba(255,255,255,0.72)", fontSize: 12 },
  slotGrid: { gap: 8 },
  slotCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 8,
    gap: 5,
  },
  slotLabel: { color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 11 },
  slotName: { color: COLORS.white, fontWeight: "800", fontSize: 12 },
  slotMeta: { color: "rgba(255,255,255,0.70)", fontSize: 11 },
  slotActions: { flexDirection: "row", gap: 6 },
  slotBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.35)",
    backgroundColor: "rgba(59,130,246,0.12)",
    paddingVertical: 7,
    alignItems: "center",
  },
  slotBtnActive: {
    borderColor: "rgba(16,185,129,0.70)",
    backgroundColor: "rgba(16,185,129,0.24)",
  },
  slotBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 11 },
  createBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.70)",
    backgroundColor: "rgba(16,185,129,0.24)",
    paddingVertical: 9,
    alignItems: "center",
  },
  createBtnDisabled: { opacity: 0.45 },
  createBtnText: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  daycareBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 8,
    gap: 6,
  },
  daycareTitle: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  daycareMeta: { color: "rgba(255,255,255,0.72)", fontSize: 11 },
  daycareActions: { flexDirection: "row", gap: 6 },
  empty: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 10,
  },
  emptyTitle: { color: COLORS.white, fontWeight: "800" },
  emptyText: { color: "rgba(255,255,255,0.72)", marginTop: 4, fontSize: 12 },
  sectionTitle: { color: COLORS.white, fontWeight: "900", fontSize: 12, marginTop: 4 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 10,
    gap: 7,
  },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { color: COLORS.white, fontWeight: "900", flex: 1 },
  badge: { color: "rgba(255,255,255,0.9)", fontWeight: "800", fontSize: 11 },
  meta: { color: "rgba(255,255,255,0.78)", fontWeight: "700", fontSize: 12 },
  barTrack: {
    height: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  barFill: { height: "100%", backgroundColor: "rgba(16,185,129,0.88)" },
  hatchBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.70)",
    backgroundColor: "rgba(16,185,129,0.24)",
    paddingVertical: 9,
    alignItems: "center",
  },
  hatchBtnDisabled: { opacity: 0.45 },
  hatchBtnText: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  incubatorList: { gap: 6 },
});
