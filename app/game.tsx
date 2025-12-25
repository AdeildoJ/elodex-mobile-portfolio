// app/game.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

import { db } from "../src/services/firebase/firebaseConfig";
import { COLORS } from "../src/theme/colors";

type ClassType = "TRAINER" | "THIEF";

type StarterPokemon = {
  speciesId: number;
  speciesName: string;
  nickname?: string;
  abilityId?: string;
  nature?: string;
  gender?: string;
};

type CharacterDoc = {
  name: string;
  avatarUrl?: string | null;
  region: string;
  classType: ClassType;
  starterPokemon: StarterPokemon;
  createdAt?: any;
  updatedAt?: any;
};

type GameActionKey =
  | "RADAR"
  | "BATTLES"
  | "CAPTURES"
  | "EVENTS"
  | "INVENTORY";

export default function GameScreen() {
  const router = useRouter();
  const { characterId } = useLocalSearchParams<{ characterId?: string }>();

  // ✅ NÃO USAR useAuth() (no seu projeto ele não é hook).
  // ✅ Pegamos o usuário logado direto do Firebase Auth.
  const uid = getAuth().currentUser?.uid || "";

  const [loading, setLoading] = useState(true);
  const [character, setCharacter] = useState<CharacterDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  const safeCharacterId = useMemo(() => {
    if (!characterId) return "";
    return Array.isArray(characterId) ? characterId[0] : characterId;
  }, [characterId]);

  const starterLabel = useMemo(() => {
    if (!character?.starterPokemon?.speciesName) return "—";
    const nick = character.starterPokemon.nickname?.trim();
    return nick
      ? `${character.starterPokemon.speciesName} (${nick})`
      : character.starterPokemon.speciesName;
  }, [character]);

  const classLabel = useMemo(() => {
    if (!character?.classType) return "—";
    return character.classType === "TRAINER" ? "Trainer" : "Thief";
  }, [character]);

  useEffect(() => {
    let isMounted = true;

    async function loadCharacter() {
      try {
        setLoading(true);
        setError(null);
        setCharacter(null);

        if (!uid) {
          throw new Error("Usuário não autenticado.");
        }

        if (!safeCharacterId) {
          throw new Error("characterId não informado.");
        }

        const ref = doc(db, "players", uid, "characters", safeCharacterId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          throw new Error("Personagem não encontrado.");
        }

        const data = snap.data() as CharacterDoc;

        // validações mínimas para evitar tela quebrada
        if (
          !data?.name ||
          !data?.region ||
          !data?.classType ||
          !data?.starterPokemon?.speciesName
        ) {
          throw new Error("Dados do personagem incompletos no Firestore.");
        }

        if (!isMounted) return;
        setCharacter(data);
      } catch (e: any) {
        if (!isMounted) return;
        setError(e?.message || "Erro ao carregar personagem.");
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    }

    loadCharacter();

    return () => {
      isMounted = false;
    };
  }, [uid, safeCharacterId]);

  function onBack() {
    router.back();
  }

  function comingSoon(action: GameActionKey) {
    const map: Record<GameActionKey, string> = {
      RADAR: "Explorar / Radar",
      BATTLES: "Batalhas",
      CAPTURES: "Capturas",
      EVENTS: "Eventos",
      INVENTORY: "Inventário / Itens",
    };

    Alert.alert(
      "Em desenvolvimento",
      `${map[action]} ainda está em desenvolvimento.`
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={[COLORS.dark, "#111827"]} style={styles.bg}>
        <ScrollView contentContainerStyle={styles.container}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <Pressable onPress={onBack} style={styles.backBtn}>
              <Text style={styles.backBtnText}>Voltar</Text>
            </Pressable>

            <View style={styles.brandWrap}>
              <Image
                source={require("../assets/images/EloDexLogo.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            <View style={{ width: 72 }} />
          </View>

          {/* Loading */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Carregando personagem...</Text>
            </View>
          ) : null}

          {/* Error */}
          {!loading && error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorTitle}>Ops!</Text>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={onBack} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Voltar para Home</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Content */}
          {!loading && !error && character ? (
            <>
              {/* Character Header */}
              <LinearGradient
                colors={[COLORS.primary, COLORS.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.characterCard}
              >
                <View style={styles.characterHeaderRow}>
                  <View style={styles.avatarWrap}>
                    {character.avatarUrl ? (
                      <Image
                        source={{ uri: character.avatarUrl }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarPlaceholderText}>
                          {character.name?.slice(0, 1)?.toUpperCase() || "?"}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.characterInfo}>
                    <Text style={styles.characterName}>{character.name}</Text>

                    <View style={styles.pillsRow}>
                      <View style={styles.pill}>
                        <Text style={styles.pillText}>{character.region}</Text>
                      </View>
                      <View style={styles.pill}>
                        <Text style={styles.pillText}>{classLabel}</Text>
                      </View>
                    </View>

                    <Text style={styles.metaLine}>
                      <Text style={styles.metaLabel}>Inicial: </Text>
                      <Text style={styles.metaValue}>{starterLabel}</Text>
                    </Text>

                    <Text style={styles.metaLine}>
                      <Text style={styles.metaLabel}>Nature: </Text>
                      <Text style={styles.metaValue}>
                        {character.starterPokemon.nature || "—"}
                      </Text>
                      <Text style={styles.metaSpacer}>  •  </Text>
                      <Text style={styles.metaLabel}>Gênero: </Text>
                      <Text style={styles.metaValue}>
                        {character.starterPokemon.gender || "—"}
                      </Text>
                    </Text>
                  </View>
                </View>
              </LinearGradient>

              {/* Actions */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Ações do Jogo</Text>
                <Text style={styles.sectionSubtitle}>
                  Selecione uma opção para iniciar. (Algumas funções ainda estão
                  em desenvolvimento)
                </Text>
              </View>

              <View style={styles.actionsGrid}>
                <ActionCard
                  title="Explorar / Radar"
                  subtitle="Encontros e exploração"
                  onPress={() => comingSoon("RADAR")}
                />
                <ActionCard
                  title="Batalhas"
                  subtitle="PVE / PVP"
                  onPress={() => comingSoon("BATTLES")}
                />
                <ActionCard
                  title="Capturas"
                  subtitle="Capturar Pokémon"
                  onPress={() => comingSoon("CAPTURES")}
                />
                <ActionCard
                  title="Eventos"
                  subtitle="NPCs, missões e eventos"
                  onPress={() => comingSoon("EVENTS")}
                />
                <ActionCard
                  title="Inventário / Itens"
                  subtitle="Itens e recursos"
                  onPress={() => comingSoon("INVENTORY")}
                />
              </View>

              {/* World Status */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Status do Mundo</Text>
                <Text style={styles.sectionSubtitle}>
                  Atividade recente do seu personagem
                </Text>
              </View>

              <View style={styles.worldCard}>
                <Text style={styles.worldEmptyTitle}>
                  Nenhuma atividade recente
                </Text>
                <Text style={styles.worldEmptyText}>
                  Quando eventos, capturas e batalhas forem ativados, você verá
                  um histórico aqui.
                </Text>
              </View>
            </>
          ) : null}
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

function ActionCard({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.actionPressable}>
      {({ pressed }) => (
        <LinearGradient
          colors={pressed ? ["#111827", "#0B1220"] : ["#141B2D", "#0B1220"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.actionCard}
        >
          <View style={styles.actionAccent} />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>{title}</Text>
            <Text style={styles.actionSubtitle}>{subtitle}</Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </LinearGradient>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.dark,
  },
  bg: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: 28,
  },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  backBtn: {
    width: 72,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnText: {
    color: COLORS.white,
    fontWeight: "700",
  },
  brandWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 110,
    height: 40,
  },

  // Loading / Error
  loadingWrap: {
    paddingTop: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
  },
  errorWrap: {
    marginTop: 22,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  errorTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },
  errorText: {
    color: "rgba(255,255,255,0.85)",
    lineHeight: 20,
    marginBottom: 14,
  },
  primaryBtn: {
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: COLORS.white,
    fontWeight: "800",
  },

  // Character card
  characterCard: {
    borderRadius: 22,
    padding: 14,
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  characterHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarWrap: {
    width: 74,
    height: 74,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.20)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  avatarPlaceholderText: {
    color: COLORS.white,
    fontSize: 26,
    fontWeight: "900",
  },
  characterInfo: {
    flex: 1,
  },
  characterName: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },
  pillsRow: {
    flexDirection: "row",
    gap: 8 as any,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  pillText: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 12,
  },
  metaLine: {
    color: "rgba(255,255,255,0.92)",
    marginTop: 2,
  },
  metaLabel: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
  },
  metaValue: {
    color: COLORS.white,
    fontWeight: "800",
  },
  metaSpacer: {
    color: "rgba(255,255,255,0.65)",
  },

  // Sections
  sectionHeader: {
    marginTop: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: "rgba(255,255,255,0.70)",
    lineHeight: 18,
  },

  // Actions
  actionsGrid: {
    gap: 10 as any,
    marginBottom: 12,
  },
  actionPressable: {
    borderRadius: 18,
    overflow: "hidden",
  },
  actionCard: {
    minHeight: 74,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  actionAccent: {
    width: 6,
    height: "100%",
    borderRadius: 8,
    backgroundColor: "rgba(59,130,246,0.55)",
    marginRight: 12,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 2,
  },
  actionSubtitle: {
    color: "rgba(255,255,255,0.70)",
    fontWeight: "600",
  },
  actionArrow: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 26,
    fontWeight: "900",
    marginLeft: 10,
  },

  // World
  worldCard: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 14,
  },
  worldEmptyTitle: {
    color: COLORS.white,
    fontWeight: "900",
    marginBottom: 6,
  },
  worldEmptyText: {
    color: "rgba(255,255,255,0.75)",
    lineHeight: 18,
  },
});
