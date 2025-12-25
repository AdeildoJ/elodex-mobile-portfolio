import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  ImageBackground,
  Platform,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import { Timestamp } from "firebase/firestore";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "../../src/theme/colors";
import { auth } from "../../src/services/firebase/firebaseConfig";
import { getPlayerProfile } from "../../src/services/firebase/players.service";
import {
  deleteCharacterForPlayer,
  listenPlayerCharacters,
  PlayerCharacter,
  updateCharacterForPlayer,
} from "../../src/services/firebase/characters.service";

type GradientColors = readonly [string, string, ...string[]];

const DOWNGRADE_GRACE_DAYS = 45;

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function diffInDaysCeil(from: Date, to: Date) {
  const ms = to.getTime() - from.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(days));
}

export default function HomeScreen() {
  const uid = auth.currentUser?.uid;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [playerName, setPlayerName] = useState<string>("Jogador");
  const [playerType, setPlayerType] = useState<"FREE" | "VIP">("FREE");

  const [showSettings, setShowSettings] = useState(false);

  // Placeholder (saldo real a ser ligado depois)
  const [ecoinBalance] = useState<number>(0);

  const [characters, setCharacters] = useState<PlayerCharacter[]>([]);

  const maxChars = useMemo(() => (playerType === "VIP" ? 3 : 1), [playerType]);
  const canCreateMore = useMemo(
    () => characters.length < maxChars,
    [characters.length, maxChars]
  );

  const lockingInProgressRef = useRef<Set<string>>(new Set());

  async function loadProfile() {
    if (!uid) return;
    const profile = await getPlayerProfile(uid);

    setPlayerName(profile?.nomeJogador ?? "Jogador");
    setPlayerType(
      (profile?.playerType ?? "FREE").toUpperCase() === "VIP" ? "VIP" : "FREE"
    );
  }

  /**
   * ✅ Regra: se virar FREE tendo 2+ chars, bloquear o 2 e 3 (na prática: todos após o 1º)
   * - marca expireAt = now + 45 dias
   * - marca lockedAt
   */
  async function applyDowngradeRuleIfNeeded(currentChars: PlayerCharacter[]) {
    if (!uid) return;
    if (playerType !== "FREE") return;

    const extras = currentChars.slice(1);

    for (const char of extras) {
      if (char.expireAt) continue;

      if (lockingInProgressRef.current.has(char.id)) continue;
      lockingInProgressRef.current.add(char.id);

      try {
        const expireAtDate = addDays(new Date(), DOWNGRADE_GRACE_DAYS);
        const expireAt = Timestamp.fromDate(expireAtDate);

        await updateCharacterForPlayer(uid, char.id, { expireAt });

        await updateCharacterForPlayer(uid, char.id, {
          lockedAt: Timestamp.fromDate(new Date()),
        });
      } catch {
        // silencioso
      } finally {
        lockingInProgressRef.current.delete(char.id);
      }
    }
  }

  function onLogout() {
    setShowSettings(false);

    Alert.alert("Sair", "Deseja sair da sua conta?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
            router.replace("/public");
          } catch (e: any) {
            Alert.alert("Erro", e?.message ?? "Falha ao sair.");
          }
        },
      },
    ]);
  }

  useEffect(() => {
    let unsubChars: (() => void) | undefined;

    async function boot() {
      if (!uid) {
        setLoading(false);
        return;
      }

      try {
        await loadProfile();

        unsubChars = listenPlayerCharacters(uid, async (list) => {
          setCharacters(list);
          await applyDowngradeRuleIfNeeded(list);
        });
      } catch (e: any) {
        Alert.alert("Erro", e?.message ?? "Falha ao carregar dados do jogador.");
      } finally {
        setLoading(false);
      }
    }

    boot();

    return () => {
      if (unsubChars) unsubChars();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, playerType]); // ✅ playerType aqui ajuda a re-aplicar regra quando mudar

  async function onRefresh() {
    try {
      setRefreshing(true);

      // ✅ Atualiza perfil (nome/tipo) — o listener já mantém chars atualizados
      await loadProfile();
    } catch (e: any) {
      Alert.alert("Erro", e?.message ?? "Falha ao atualizar.");
    } finally {
      setRefreshing(false);
    }
  }

  function onBuyEcoin() {
    router.push("/payments/ecoin");
  }

  function onVipCardPress() {
    if (playerType === "VIP") {
      Alert.alert(
        "VIP",
        "Abrir tela de gerenciamento VIP (a implementar)."
      );
      return;
    }
    Alert.alert("VIP", "Abrir tela de pagamento VIP (a implementar).");
  }

  function onGoCreateCharacter() {
    if (!canCreateMore) {
      Alert.alert(
        "Limite atingido",
        playerType === "VIP"
          ? "Você já atingiu o limite de 3 personagens."
          : "Jogador FREE pode ter apenas 1 personagem."
      );
      return;
    }

    router.push("/home/create-character");
  }

  function showLockedAlert(char: PlayerCharacter) {
    const expireAt = char.expireAt?.toDate?.();
    if (!expireAt) {
      Alert.alert(
        "Personagem bloqueado",
        `Esse personagem será removido do nosso banco de dados em ${DOWNGRADE_GRACE_DAYS} dias (prazo ${DOWNGRADE_GRACE_DAYS} dias).`
      );
      return;
    }

    const daysLeft = diffInDaysCeil(new Date(), expireAt);
    Alert.alert(
      "Personagem bloqueado",
      `Esse personagem será removido do nosso banco de dados em ${daysLeft} dias (prazo ${DOWNGRADE_GRACE_DAYS} dias).`
    );
  }

  function onSelectCharacter(char: PlayerCharacter, isLocked: boolean) {
    if (isLocked) {
      showLockedAlert(char);
      return;
    }
    router.push({ pathname: "/game", params: { characterId: char.id } });
  }

  function onGoEditCharacter(char: PlayerCharacter, isLocked: boolean) {
    if (isLocked) {
      showLockedAlert(char);
      return;
    }

    router.push({
      pathname: "/home/create-character",
      params: { characterId: char.id },
    });
  }

  function onDeleteCharacter(char: PlayerCharacter, isLocked: boolean) {
    if (!uid) return Alert.alert("Erro", "Usuário não autenticado.");

    if (isLocked) {
      showLockedAlert(char);
      return;
    }

    Alert.alert("Excluir personagem", `Deseja excluir "${char.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCharacterForPlayer(uid, char.id);
            Alert.alert("OK", "Personagem excluído.");
          } catch (e: any) {
            Alert.alert("Erro", e?.message ?? "Falha ao excluir personagem.");
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  const vipGlow: GradientColors =
    playerType === "VIP"
      ? ["rgba(59,130,246,0.42)", "rgba(167,139,250,0.16)", "rgba(0,0,0,0)"]
      : ["rgba(167,139,250,0.30)", "rgba(59,130,246,0.14)", "rgba(0,0,0,0)"];

  const createButtonBottom = insets.bottom + 18; // ✅ sobe o botão acima da barra do celular
  const listBottomPadding = 120 + insets.bottom; // ✅ espaço pro botão + safe area

  return (
    <SafeAreaView style={styles.safeRoot} edges={["top"]}>
      <View style={styles.root}>
        <LinearGradient
          colors={["#050B1E", "#0A1440", "#0E1B57", "#050B1E"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>Olá,</Text>
            <Text style={styles.playerName} numberOfLines={1}>
              {playerName}
            </Text>
          </View>

          <View style={styles.headerRight}>
            <Pressable
              onPress={() => setShowSettings((v) => !v)}
              style={styles.settingsBtn}
              hitSlop={10}
            >
              <Ionicons name="settings-outline" size={20} color={COLORS.white} />
            </Pressable>

            {showSettings && (
              <View style={styles.settingsMenu}>
                <Pressable onPress={onLogout} style={styles.settingsItem}>
                  <Ionicons name="log-out-outline" size={18} color={COLORS.white} />
                  <Text style={styles.settingsText}>Sair</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* VIP card */}
        <Pressable onPress={onVipCardPress} style={styles.vipCardWrap}>
          <LinearGradient
            colors={vipGlow}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.vipGlow}
          >
            <View style={styles.vipCard}>
              <Text style={styles.vipTitle}>
                {playerType === "VIP" ? "Conta VIP" : "Conta FREE"}
              </Text>
              <Text style={styles.vipSub}>
                {playerType === "VIP"
                  ? "Você tem benefícios e 3 slots de personagens."
                  : "Upgrade para VIP e tenha 3 slots de personagens."}
              </Text>
            </View>
          </LinearGradient>
        </Pressable>

        {/* ECoin */}
        <View style={styles.ecoinRow}>
          <View style={styles.ecoinBox}>
            <Text style={styles.ecoinLabel}>ECoin</Text>
            <Text style={styles.ecoinValue}>{ecoinBalance}</Text>
          </View>
          <Pressable onPress={onBuyEcoin} style={styles.ecoinBuyBtn}>
            <Text style={styles.ecoinBuyText}>Comprar</Text>
          </Pressable>
        </View>

        {/* Personagens */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Seus personagens</Text>
          <Text style={styles.sectionHint}>
            {Math.min(characters.length, maxChars)}/{maxChars}
          </Text>
        </View>

        <FlatList
          data={characters}
          keyExtractor={(item) => item.id}
          alwaysBounceVertical
          bounces
          progressViewOffset={Platform.OS === "android" ? 80 : 0}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.white}
              colors={[COLORS.primary]}
              progressBackgroundColor="rgba(0,0,0,0.35)"
            />
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: listBottomPadding, flexGrow: 1 },
          ]}
          renderItem={({ item, index }) => {
            const isLocked = playerType === "FREE" && index >= 1;

            const avatarSource =
              item.avatarUrl && item.avatarUrl.length > 0
                ? { uri: item.avatarUrl }
                : require("../../assets/images/pokemonGif1.gif");

            return (
              <Pressable
                style={[styles.charCard, isLocked && styles.charCardLocked]}
                onPress={() => onSelectCharacter(item, isLocked)}
              >
                <ImageBackground
                  source={avatarSource}
                  style={styles.charAvatar}
                  imageStyle={[
                    styles.charAvatarImg,
                    isLocked && styles.charAvatarImgLocked,
                  ]}
                >
                  <LinearGradient
                    colors={["rgba(0,0,0,0.10)", "rgba(0,0,0,0.65)"]}
                    style={styles.charAvatarOverlay}
                  />

                  {isLocked && <View style={styles.lockedVeil} />}

                  <View style={styles.charInfo}>
                    <Text style={styles.charName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.charMeta}>
                      {item.region} • {item.classType}
                    </Text>

                    {isLocked && (
                      <View style={styles.lockBadge}>
                        <Ionicons name="lock-closed-outline" size={14} color={COLORS.white} />
                        <Text style={styles.lockBadgeText}>Bloqueado</Text>
                      </View>
                    )}
                  </View>
                </ImageBackground>

                <View style={styles.charActions}>
                  <Pressable
                    onPress={() => onGoEditCharacter(item, isLocked)}
                    style={[styles.actionBtn, isLocked && { opacity: 0.45 }]}
                  >
                    <Ionicons name="create-outline" size={18} color={COLORS.white} />
                  </Pressable>

                  <Pressable
                    onPress={() => onDeleteCharacter(item, isLocked)}
                    style={[styles.actionBtnDanger, isLocked && { opacity: 0.45 }]}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.white} />
                  </Pressable>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Nenhum personagem</Text>
              <Text style={styles.emptySub}>
                Puxe para baixo para atualizar, ou crie seu primeiro personagem.
              </Text>
            </View>
          }
        />

        {/* Criar personagem */}
        <Pressable
          onPress={onGoCreateCharacter}
          style={[
            styles.createBtn,
            { bottom: createButtonBottom },
            !canCreateMore && { opacity: 0.55 },
          ]}
        >
          <Text style={styles.createBtnText}>Criar personagem</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeRoot: { flex: 1, backgroundColor: "#050B1E" },

  root: { flex: 1, padding: 16 },
  center: { alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 10,
    marginBottom: 10,
  },
  hello: { color: "rgba(255,255,255,0.70)", fontSize: 14 },
  playerName: { color: COLORS.white, fontSize: 22, fontWeight: "800", maxWidth: 220 },

  headerRight: { alignItems: "flex-end" },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  settingsMenu: {
    marginTop: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    overflow: "hidden",
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  settingsText: { color: COLORS.white, fontWeight: "700" },

  vipCardWrap: { marginTop: 8, marginBottom: 12 },
  vipGlow: { borderRadius: 16, padding: 1 },
  vipCard: {
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 15,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  vipTitle: { color: COLORS.white, fontWeight: "900", fontSize: 16 },
  vipSub: { color: "rgba(255,255,255,0.70)", marginTop: 4 },

  ecoinRow: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 10 },
  ecoinBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  ecoinLabel: { color: "rgba(255,255,255,0.70)", fontSize: 12 },
  ecoinValue: { color: COLORS.white, fontSize: 20, fontWeight: "900", marginTop: 2 },
  ecoinBuyBtn: {
    backgroundColor: "rgba(59,130,246,0.95)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  ecoinBuyText: { color: COLORS.white, fontWeight: "900" },

  sectionHeader: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  sectionTitle: { color: COLORS.white, fontWeight: "900", fontSize: 16 },
  sectionHint: { color: "rgba(255,255,255,0.65)", fontWeight: "800" },

  listContent: { paddingVertical: 12, gap: 12 },

  charCard: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  charCardLocked: {
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  charAvatar: { height: 120, justifyContent: "flex-end" },
  charAvatarImg: { resizeMode: "cover" },
  charAvatarImgLocked: { opacity: 0.45 },
  charAvatarOverlay: { ...StyleSheet.absoluteFillObject },

  lockedVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },

  charInfo: { padding: 12 },
  charName: { color: COLORS.white, fontWeight: "900", fontSize: 16 },
  charMeta: { color: "rgba(255,255,255,0.70)", marginTop: 2 },

  lockBadge: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  lockBadgeText: { color: COLORS.white, fontWeight: "900", fontSize: 12 },

  charActions: {
    position: "absolute",
    right: 10,
    top: 10,
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnDanger: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(239,68,68,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyBox: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  emptyTitle: { color: COLORS.white, fontWeight: "900", fontSize: 16 },
  emptySub: { color: "rgba(255,255,255,0.70)", marginTop: 4 },

  createBtn: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "rgba(167,139,250,0.95)",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  createBtnText: { color: COLORS.white, fontWeight: "900", fontSize: 16 },
});
