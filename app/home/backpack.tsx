import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";

import { COLORS } from "../../src/theme/colors";
import { auth, db } from "../../src/services/firebase/firebaseConfig";
import {
  listenPlayerAccountBackpack,
  listenPlayerAccountDistributionHistory,
  listenPlayerProductEntitlements,
  type PlayerAccountBackpackEntry,
  type PlayerAccountDistributionHistoryEntry,
  type PlayerProductEntitlement,
} from "../../src/services/firebase/monetization.service";
import {
  listenPlayerProfile,
  type PlayerProfile,
} from "../../src/services/firebase/players.service";
import {
  listenPlayerCharacters,
  type PlayerCharacter,
} from "../../src/services/firebase/characters.service";
import { allocateAccountBackpackRewardToCharacter } from "../../src/services/monetization/entitlement-claim.service";
import { isGymMainTeamSlotProduct, resolveProductRoute } from "../../src/services/monetization/product-routing.service";

const DEBUG_ECOIN_FLOW = true;

function isGymMainTeamSlotAccountBackpackEntry(entry: PlayerAccountBackpackEntry) {
  return isGymMainTeamSlotProduct(entry);
}

function isAccountOnly(entry: PlayerProductEntitlement) {
  return resolveProductRoute(entry).scope === "account";
}

function describeSharedEntry(entry: PlayerProductEntitlement) {
  return resolveProductRoute(entry).uiLocation;
}

export default function BackpackScreen() {
  const uid = auth.currentUser?.uid || "";
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [characters, setCharacters] = useState<PlayerCharacter[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("");
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [accountBackpack, setAccountBackpack] = useState<PlayerAccountBackpackEntry[]>([]);
  const [sharedEntries, setSharedEntries] = useState<PlayerProductEntitlement[]>([]);
  const [history, setHistory] = useState<PlayerAccountDistributionHistoryEntry[]>([]);

  useEffect(() => {
    if (!uid) return;
    const unsubs: Array<() => void> = [];
    let mounted = true;

    try {
      unsubs.push(
        listenPlayerProfile(uid, (next) => {
          if (!mounted) return;
          setProfile(next);
        })
      );
      unsubs.push(
        listenPlayerCharacters(uid, (rows) => {
          if (!mounted) return;
          setCharacters(rows);
          setSelectedCharacterId((current) => current || rows[0]?.id || "");
        })
      );
      unsubs.push(
        listenPlayerAccountBackpack(uid, (rows) => {
          if (!mounted) return;
          if (DEBUG_ECOIN_FLOW) {
            console.log("[ECOIN_FLOW][accountBackpack:rows]", {
              uid,
              count: rows.length,
              entries: rows.map((row) => ({
                id: row.id,
                rewardType: row.rewardType,
                productId: row.productId || null,
                productCode: row.productCode || null,
                productType: row.productType || null,
                deliveryScope: row.deliveryScope,
              })),
              hasGymSlot: rows.some((row) => {
                const type = String(row.productType || "").trim().toLowerCase();
                const code = String(row.productCode || "").trim().toLowerCase();
                const productId = String(row.productId || "").trim().toLowerCase();
                return type === "gym_main_team_slot" || type === "slot" || code === "gym-main-team-slot" || productId === "gym-main-team-slot";
              }),
            });
          }
          setAccountBackpack(rows.filter((row) => !isGymMainTeamSlotAccountBackpackEntry(row)));
          setLoading(false);
        })
      );
      unsubs.push(
        listenPlayerProductEntitlements(uid, (rows) => {
          if (!mounted) return;
          setSharedEntries(rows.filter((row) => !row.claimedAt && isAccountOnly(row)));
        })
      );
      unsubs.push(
        listenPlayerAccountDistributionHistory(uid, (rows) => {
          if (!mounted) return;
          setHistory(rows.slice(0, 8));
        })
      );
    } catch (e: any) {
      Alert.alert("Mochila", e?.message || "Falha ao carregar mochila da conta.");
      setLoading(false);
    }

    return () => {
      mounted = false;
      unsubs.forEach((unsub) => unsub());
    };
  }, [uid]);

  const deliverableEntries = useMemo(
    () => accountBackpack.filter((entry) => entry.deliveryScope === "character_backpack"),
    [accountBackpack]
  );

  async function handleDeliver(entry: PlayerAccountBackpackEntry) {
    if (!uid || !selectedCharacterId) {
      Alert.alert("Mochila", "Escolha um personagem para receber o item.");
      return;
    }
    try {
      setSubmittingId(entry.id);
      const type = String(entry.productType || "").trim().toLowerCase();
      const slotScope = String((entry.benefits?.metadata as Record<string, unknown> | null)?.slotScope || "").trim().toLowerCase();
      if ((type === "slot" || type === "gym_main_team_slot") && slotScope === "gym") {
        await runTransaction(db, async (tx) => {
          const rewardRef = doc(db, "players", uid, "accountBackpack", entry.id);
          const rewardSnap = await tx.get(rewardRef);
          if (!rewardSnap.exists()) throw new Error("Recompensa nao encontrada.");
          const itemRef = doc(db, "players", uid, "characters", selectedCharacterId, "itens", "gym-main-team-slot-token");
          const metaRef = doc(db, "players", uid, "characters", selectedCharacterId, "itens", "_meta");
          const [itemSnap, metaSnap] = await Promise.all([tx.get(itemRef), tx.get(metaRef)]);
          const add = Math.max(
            1,
            Number(
              entry.benefits?.gymDefenseSlotsAdded ||
                entry.benefits?.gymMainTeamSlots ||
                (entry.benefits?.metadata as Record<string, unknown> | null)?.slotsAdded ||
                1
            )
          );
          const currentQty = Math.max(0, Number(itemSnap.data()?.quantity || 0));
          const totalQuantity = Math.max(0, Number(metaSnap.data()?.totalQuantity || 0));
          tx.set(itemRef, { id: "gym-main-team-slot-token", kind: "ITEM", name: "Slot do time principal do GYM", description: "Use na mochila do personagem para liberar um novo slot do time principal do GYM.", quantity: currentQty + add, effectType: "ACTIVATE_GYM_MAIN_TEAM_SLOT", updatedAt: serverTimestamp() }, { merge: true });
          tx.set(metaRef, { totalQuantity: totalQuantity + add, updatedAt: serverTimestamp() }, { merge: true });
          tx.set(doc(collection(db, "players", uid, "accountDistributionHistory")), {
            accountBackpackEntryId: entry.id,
            rewardType: entry.rewardType,
            rewardName: entry.name,
            quantity: add,
            characterId: selectedCharacterId,
            source: entry.source,
            sourceOrderId: entry.sourceOrderId || null,
            sourcePlanId: entry.sourcePlanId || null,
            sourceProductId: entry.sourceProductId || entry.productId || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          tx.delete(rewardRef);
        });
      } else {
        await allocateAccountBackpackRewardToCharacter({
          uid,
          characterId: selectedCharacterId,
          reward: entry as unknown as PlayerAccountBackpackEntry,
        });
      }
      Alert.alert("Mochila", "Recompensa distribuida para o personagem.");
    } catch (e: any) {
      Alert.alert("Mochila", e?.message || "Falha ao distribuir recompensa.");
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#050b1e", "#0f172a", "#1e3a8a"]} style={StyleSheet.absoluteFillObject} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.white} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Mochila da conta</Text>
            <Text style={styles.subtitle}>Distribua manualmente os beneficios que pertencem a personagem.</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.white} />
            <Text style={styles.loadingText}>Carregando mochila...</Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Recursos compartilhados da conta</Text>
              <Text style={styles.resourceValue}>{Math.max(0, Number(profile?.ecoinBalance || 0))} ECoins</Text>
              <Text style={styles.resourceMeta}>
                Todos os personagens podem consumir esse saldo, mas cada uso registra qual personagem gastou.
              </Text>
              {sharedEntries.length === 0 ? (
                <Text style={styles.emptyText}>Nenhum beneficio compartilhado pendente no momento.</Text>
              ) : (
                sharedEntries.map((entry) => (
                  <View key={entry.id} style={styles.accountRow}>
                    <Text style={styles.itemName}>{entry.productName}</Text>
                    <Text style={styles.itemMeta}>{describeSharedEntry(entry)}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Personagem de destino</Text>
              <View style={styles.chipsWrap}>
                {characters.map((character) => {
                  const active = selectedCharacterId === character.id;
                  return (
                    <Pressable
                      key={character.id}
                      onPress={() => setSelectedCharacterId(character.id)}
                      style={[styles.chip, active ? styles.chipActive : null]}
                    >
                      <Text style={styles.chipText}>{character.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Pendentes de distribuicao</Text>
              {deliverableEntries.length === 0 ? (
                <Text style={styles.emptyText}>Nenhum item pendente para enviar a personagem.</Text>
              ) : (
                deliverableEntries.map((entry) => (
                  <View key={entry.id} style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{entry.name}</Text>
                      <Text style={styles.itemMeta}>
                        {entry.rewardType} • qtd {Math.max(1, Number(entry.quantity || 1))}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDeliver(entry)}
                      style={styles.actionBtn}
                      disabled={submittingId === entry.id}
                    >
                      {submittingId === entry.id ? (
                        <ActivityIndicator color={COLORS.white} />
                      ) : (
                        <Text style={styles.actionText}>Enviar</Text>
                      )}
                    </Pressable>
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Historico minimo</Text>
              {history.length === 0 ? (
                <Text style={styles.emptyText}>Nenhuma distribuicao registrada ainda.</Text>
              ) : (
                history.map((entry) => (
                  <View key={entry.id} style={styles.accountRow}>
                    <Text style={styles.itemName}>{entry.rewardName}</Text>
                    <Text style={styles.itemMeta}>
                      {entry.characterName || entry.characterId} • qtd {Math.max(1, Number(entry.quantity || 1))}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  content: { gap: 12, paddingBottom: 28 },
  header: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 10 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  title: { color: COLORS.white, fontSize: 24, fontWeight: "900" },
  subtitle: { color: "rgba(255,255,255,0.72)", marginTop: 4, fontWeight: "700" },
  loadingWrap: { paddingVertical: 40, alignItems: "center", gap: 10 },
  loadingText: { color: "rgba(255,255,255,0.72)", fontWeight: "700" },
  card: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(15,23,42,0.84)",
    gap: 10,
  },
  cardTitle: { color: COLORS.white, fontWeight: "900", fontSize: 16 },
  resourceValue: { color: "#facc15", fontWeight: "900", fontSize: 24 },
  resourceMeta: { color: "rgba(255,255,255,0.72)", lineHeight: 18, fontWeight: "700" },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 as any },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chipActive: {
    borderColor: "rgba(96,165,250,0.55)",
    backgroundColor: "rgba(59,130,246,0.22)",
  },
  chipText: { color: COLORS.white, fontWeight: "800" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(2,6,23,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  accountRow: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(2,6,23,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 4,
  },
  itemName: { color: COLORS.white, fontWeight: "900" },
  itemMeta: { color: "rgba(255,255,255,0.70)", fontWeight: "700", marginTop: 4 },
  actionBtn: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#2563eb",
    minWidth: 98,
    alignItems: "center",
  },
  actionText: { color: COLORS.white, fontWeight: "900" },
  emptyText: { color: "rgba(255,255,255,0.70)", fontWeight: "700" },
});
