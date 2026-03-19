import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

import { COLORS } from "../src/theme/colors";
import pokemonSpecies from "../src/data/pokemon/pokemonSpecies.json";
import { auth, db } from "../src/services/firebase/firebaseConfig";
import {
  addPokemonToGymMainTeam,
  createGymForPlayer,
  createGymChallenge,
  findStandaloneGymTicket,
  getGymById,
  getGymInitialMainTeamLimit,
  healGymPokemon,
  listenGymMainTeam,
  listenGymChallenges,
  listenGymStorage,
  listenPlayerGymByCharacter,
  renewPlayerGymWithTicket,
  respondGymChallenge,
  resolveGymCreationMode,
  updatePlayerGymNpc,
  updatePlayerGymScenario,
  type GymChallengeDoc,
  type GymRosterEntry,
  type PlayerGymDoc,
} from "../src/services/firebase/gym.service";
import { resolveThiefPoliceOutcome, resolveThiefPvpLoot } from "../src/services/firebase/thief.service";
import {
  listenPlayerProductEntitlements,
  type PlayerProductEntitlement,
} from "../src/services/firebase/monetization.service";
import { getPlayerProfile } from "../src/services/firebase/players.service";
import { normalizeBadgeSnapshot, type BadgeRecord } from "../src/services/firebase/badge.service";
import { normalizeScenarioSnapshot, type GymScenarioRecord } from "../src/services/firebase/scenario.service";
import { biomeAllowsGym, getBiomeDocByKey } from "../src/services/firebase/biome.service";
import {
  listenPlayerGymCustomizationUnlocks,
  type PlayerGymCustomizationUnlocks,
} from "../src/services/firebase/gym-customization.service";
import { BattleScene } from "../src/components/battle/BattleScene";
import type { BattleMonster, BattleMove } from "../src/components/battle/types";
import { buildBattleMove } from "../src/components/battle/moveCatalog";
import { getBattleBackSprite, getBattleFrontSprite, getTypeMultiplier } from "../src/pokemon/PokemonSprites";

const GYM_TYPES = ["bug", "dark", "dragon", "electric", "fairy", "fighting", "fire", "flying", "ghost", "grass", "ground", "ice", "normal", "poison", "psychic", "rock", "steel", "water"];
const STEPS = ["Nome", "Tipo/Cenario", "Time", "NPC", "Insignia"];

type CharacterPokemonOption = {
  id: string;
  sourceCollection: "time" | "box";
  speciesId: number;
  speciesName: string;
  nickname?: string | null;
  nature?: string | null;
  hpCurrent?: number | null;
  hpTotal?: number | null;
  expCurrent?: number | null;
  expToNext?: number | null;
  isStarter?: boolean | null;
  spriteUrl?: string | null;
  level: number;
};

type GymNpcOption = {
  id: string;
  name: string;
  role: string;
  imageUrl: string;
  isCommercialized: boolean;
  ecoinPrice: number | null;
};

type CharacterBattleOption = {
  id: string;
  speciesId: number;
  speciesName: string;
  nickname?: string | null;
  level: number;
  hpCurrent: number;
  hpTotal: number;
  moves: string[];
};

function getSpeciesTypes(speciesId: number) {
  const list = Array.isArray(pokemonSpecies) ? pokemonSpecies : Object.values(pokemonSpecies as Record<string, unknown>);
  const row = list.find((entry: any) => Number(entry?.id ?? entry?.speciesId) === Number(speciesId)) as any;
  return Array.isArray(row?.types) ? row.types.map((value: unknown) => String(value).trim().toLowerCase()).filter(Boolean) : [];
}

function monKey(entry: Pick<CharacterPokemonOption, "sourceCollection" | "id">) {
  return `${entry.sourceCollection}:${entry.id}`;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoveLabel(moveId: string) {
  return String(moveId || "")
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function buildBattleMonster(
  speciesId: number,
  level: number,
  label: string,
  slotIndex: number,
  hpCurrent?: number,
  hpTotal?: number,
  moves?: string[]
): BattleMonster | null {
  const sid = Math.max(1, numberValue(speciesId, 0));
  const lv = Math.max(1, numberValue(level, 1));
  if (!sid) return null;
  const fallbackHp = Math.max(20, lv * 5);
  const totalHp = Math.max(1, numberValue(hpTotal, fallbackHp));
  const currentHp = Math.max(0, Math.min(totalHp, numberValue(hpCurrent, totalHp)));
  const selectedMoves = Array.isArray(moves) && moves.length ? moves.slice(0, 4) : ["tackle", "quick-attack"];
  const mappedMoves = selectedMoves.map((moveId) => buildBattleMove(String(moveId || "tackle"))) as BattleMove[];
  return {
    id: `gym-battle-${slotIndex}-${sid}-${label}`,
    speciesId: sid,
    name: label,
    level: lv,
    hpCurrent: currentHp,
    hpTotal: totalHp,
    stats: {
      hp: totalHp,
      atk: Math.max(8, lv * 2),
      def: Math.max(8, lv * 2),
      spa: Math.max(8, lv * 2),
      spd: Math.max(8, lv * 2),
      spe: Math.max(8, lv * 2),
    },
    types: getSpeciesTypes(sid),
    sprite: {
      front: getBattleFrontSprite(sid),
      back: getBattleBackSprite(sid),
    },
    moves: mappedMoves,
    slotIndex,
    expCurrent: 0,
    expToNext: 100,
    expTotal: 0,
    abilityId: null,
    heldItemId: null,
  };
}

export default function GymScreen() {
  const params = useLocalSearchParams<{ characterId?: string; biomeId?: string; targetGymId?: string; mode?: string }>();
  const [uid, setUid] = useState(auth.currentUser?.uid || "");
  const characterId = String(params.characterId || "").trim();
  const biomeId = String(params.biomeId || "").trim().toLowerCase();
  const targetGymId = String(params.targetGymId || "").trim();
  const mode = String(params.mode || "").trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gym, setGym] = useState<PlayerGymDoc | null>(null);
  const [storageRows, setStorageRows] = useState<GymRosterEntry[]>([]);
  const [mainTeamRows, setMainTeamRows] = useState<GymRosterEntry[]>([]);
  const [targetGymStorageRows, setTargetGymStorageRows] = useState<GymRosterEntry[]>([]);
  const [targetGymMainTeamRows, setTargetGymMainTeamRows] = useState<GymRosterEntry[]>([]);
  const [challengeRows, setChallengeRows] = useState<GymChallengeDoc[]>([]);
  const [entitlements, setEntitlements] = useState<PlayerProductEntitlement[]>([]);
  const [characterName, setCharacterName] = useState("Treinador");
  const [characterClassType, setCharacterClassType] = useState("TRAINER");
  const [characterBattleTeam, setCharacterBattleTeam] = useState<CharacterBattleOption[]>([]);
  const [candidatePokemon, setCandidatePokemon] = useState<CharacterPokemonOption[]>([]);
  const [biomeGymEnabled, setBiomeGymEnabled] = useState(false);
  const [resolvedBiomeId, setResolvedBiomeId] = useState("");
  const [biomeGymRows, setBiomeGymRows] = useState<PlayerGymDoc[]>([]);
  const [availableNpcs, setAvailableNpcs] = useState<GymNpcOption[]>([]);
  const [availableBadges, setAvailableBadges] = useState<BadgeRecord[]>([]);
  const [availableScenarios, setAvailableScenarios] = useState<GymScenarioRecord[]>([]);
  const [unlocks, setUnlocks] = useState<PlayerGymCustomizationUnlocks>({ npcIds: [], scenarioIds: [] });
  const [selectedTargetGymId, setSelectedTargetGymId] = useState<string>(targetGymId);
  const [selectedChallengePokemonKeys, setSelectedChallengePokemonKeys] = useState<string[]>([]);
  const [targetGym, setTargetGym] = useState<PlayerGymDoc | null>(null);
  const [targetLeaderAvatarUrl, setTargetLeaderAvatarUrl] = useState<string>("");
  const [stealBusyId, setStealBusyId] = useState<string>("");
  const [policeBattleVisible, setPoliceBattleVisible] = useState(false);
  const [policeCaseId, setPoliceCaseId] = useState<string>("");
  const [policeNpcName, setPoliceNpcName] = useState<string>("");
  const [policePlayerTeam, setPolicePlayerTeam] = useState<BattleMonster[]>([]);
  const [policeEnemyTeam, setPoliceEnemyTeam] = useState<BattleMonster[]>([]);
  const [policeBattleLabel, setPoliceBattleLabel] = useState("Intercepcao policial");
  const [gymName, setGymName] = useState("");
  const [gymType, setGymType] = useState("fire");
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [selectedBadgeId, setSelectedBadgeId] = useState("");
  const [selectedNpcId, setSelectedNpcId] = useState("");
  const [selectedPokemonKeys, setSelectedPokemonKeys] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const [manageSelector, setManageSelector] = useState<"scenario" | "npc" | null>(null);
  const [pendingVisualSlot, setPendingVisualSlot] = useState<number | null>(null);
  const [selectedGymPokemon, setSelectedGymPokemon] = useState<{
    entry: GymRosterEntry;
    sourceData: Record<string, unknown> | null;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || "");
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) {
      setUnlocks({ npcIds: [], scenarioIds: [] });
      return;
    }
    return listenPlayerGymCustomizationUnlocks(uid, setUnlocks);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let unsubGym: (() => void) | undefined;
    let unsubStorage: (() => void) | undefined;
    let unsubMainTeam: (() => void) | undefined;
        let unsubEntitlements: (() => void) | undefined;
        let unsubChallenges: (() => void) | undefined;
        let unsubTargetStorage: (() => void) | undefined;
        let unsubTargetTeam: (() => void) | undefined;
        let mounted = true;

    async function load() {
      try {
        await auth.currentUser?.getIdToken();
        const profile = await getPlayerProfile(uid);
        if (!mounted) return;
          setCharacterName(String(profile?.nomeJogador || "Treinador"));
          unsubGym = listenPlayerGymByCharacter(uid, characterId, (row) => {
            setGym(row);
            unsubStorage?.();
            unsubMainTeam?.();
            unsubChallenges?.();
            if (row) {
              unsubStorage = listenGymStorage(uid, setStorageRows);
              unsubMainTeam = listenGymMainTeam(uid, setMainTeamRows);
              unsubChallenges = listenGymChallenges(uid, setChallengeRows);
            } else {
              setStorageRows([]);
              setMainTeamRows([]);
              setChallengeRows([]);
            }
          });
          unsubTargetStorage = selectedTargetGymId
            ? listenGymStorage(selectedTargetGymId, setTargetGymStorageRows)
            : undefined;
          unsubTargetTeam = selectedTargetGymId
            ? listenGymMainTeam(selectedTargetGymId, setTargetGymMainTeamRows)
            : undefined;
          unsubEntitlements = listenPlayerProductEntitlements(uid, setEntitlements);

        const biomeLookupId = resolvedBiomeId || biomeId;
        const [npcSnap, badgeSnap, scenarioSnap, teamSnap, boxSnap, charSnap, biomeRow, biomeGymsSnap] = await Promise.all([
          getDocs(collection(db, "npcs")),
          getDocs(collection(db, "badges")),
          getDocs(collection(db, "scenarios")),
          characterId ? getDocs(collection(db, "players", uid, "characters", characterId, "time")) : Promise.resolve(null as any),
          characterId ? getDocs(collection(db, "players", uid, "characters", characterId, "box")) : Promise.resolve(null as any),
          characterId ? getDocs(collection(db, "players", uid, "characters")) : Promise.resolve(null as any),
          biomeLookupId ? getBiomeDocByKey(biomeLookupId) : Promise.resolve(null),
          biomeLookupId ? getDocs(query(collection(db, "gyms"), where("biomeId", "==", biomeLookupId))) : Promise.resolve(null as any),
        ]);
        if (!mounted) return;
        setResolvedBiomeId(String(biomeRow?.id || biomeId || "").trim().toLowerCase());
        setBiomeGymEnabled(biomeAllowsGym(biomeRow?.data || null));
        setBiomeGymRows(
          biomeGymsSnap
            ? biomeGymsSnap.docs.map((docSnap: any) => ({ id: docSnap.id, ...(docSnap.data() as Omit<PlayerGymDoc, "id">) }))
            : []
        );

        setAvailableNpcs(
          npcSnap.docs
            .map((docSnap) => {
              const data = docSnap.data() as Record<string, unknown>;
              return {
                id: docSnap.id,
                name: String(data.nome || docSnap.id),
                role: String(data.role || ""),
                imageUrl: String(data.imageUrl || ""),
                isCommercialized: Boolean(data.isCommercialized),
                ecoinPrice:
                  typeof data.ecoinPrice === "number" && Number.isFinite(data.ecoinPrice)
                    ? data.ecoinPrice
                    : null,
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        );
        const badges = badgeSnap.docs.map(normalizeBadgeSnapshot).filter((item) => item.isActive).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        setAvailableBadges(badges);
        if (badges[0]?.id) setSelectedBadgeId((current) => current || badges[0].id);
        setAvailableScenarios(scenarioSnap.docs.map(normalizeScenarioSnapshot).filter((item) => item.isActive));

          if (teamSnap && boxSnap && charSnap) {
            const rows = [...teamSnap.docs.map((row: any) => ({ id: row.id, sourceCollection: "time" as const, ...(row.data() as any) })), ...boxSnap.docs.map((row: any) => ({ id: row.id, sourceCollection: "box" as const, ...(row.data() as any) }))];
            setCharacterBattleTeam(
              teamSnap.docs
                .map((row: any) => ({ id: row.id, ...(row.data() as any) }))
                .filter((row: any) => Number(row.speciesId || 0) > 0)
                .map((row: any) => ({
                  id: row.id,
                  speciesId: Number(row.speciesId || 0),
                  speciesName: String(row.speciesName || `#${row.speciesId}`),
                  nickname: String(row.nickname || "") || null,
                  level: Math.max(1, Number(row.level || 1)),
                  hpCurrent: Math.max(1, Number(row.hpCurrent ?? row.hp?.current ?? row.hpTotal ?? row.hp?.total ?? 1)),
                  hpTotal: Math.max(1, Number(row.hpTotal ?? row.hp?.total ?? row.hpCurrent ?? row.hp?.current ?? 1)),
                  moves: Array.isArray(row.moves) ? row.moves.slice(0, 4) : [],
                }))
            );
            setCandidatePokemon(rows.filter((row: any) => Number(row.speciesId || 0) > 0).map((row: any) => ({
              id: row.id,
            sourceCollection: row.sourceCollection,
            speciesId: Number(row.speciesId || 0),
            speciesName: String(row.speciesName || `#${row.speciesId}`),
            nickname: String(row.nickname || "") || null,
            nature: String(row.nature || "") || null,
            hpCurrent: Math.max(1, Number(row.hpCurrent ?? row.hp?.current ?? row.hpTotal ?? row.hp?.total ?? 1)),
            hpTotal: Math.max(1, Number(row.hpTotal ?? row.hp?.total ?? row.hpCurrent ?? row.hp?.current ?? 1)),
            expCurrent: Math.max(0, Number(row.expCurrent ?? row.currentExp ?? row.exp ?? 0)),
            expToNext: Math.max(1, Number(row.expToNext ?? row.nextExp ?? row.expToNextLevel ?? 100)),
            isStarter: Boolean(row.isStarter),
            spriteUrl: String(row.spriteUrl || "") || null,
            level: Math.max(1, Number(row.level || 1)),
            })));
            const currentChar = charSnap.docs.find((row: any) => row.id === characterId);
            if (currentChar?.data()?.name) setCharacterName(String(currentChar.data()?.name || "Treinador"));
            if (currentChar?.data()?.classType) setCharacterClassType(String(currentChar.data()?.classType || "TRAINER").toUpperCase());
          }
      } catch (e: any) {
        Alert.alert("GYM", e?.message || "Falha ao carregar tela do GYM.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
      unsubGym?.();
      unsubStorage?.();
      unsubMainTeam?.();
      unsubEntitlements?.();
      unsubChallenges?.();
      unsubTargetStorage?.();
      unsubTargetTeam?.();
    };
  }, [uid, characterId, biomeId, resolvedBiomeId, selectedTargetGymId]);

  const creationMode = useMemo(
    () => resolveGymCreationMode(null, entitlements),
    [entitlements]
  );
  const standaloneTicket = useMemo(() => findStandaloneGymTicket(entitlements), [entitlements]);
  const creationTeamLimit = useMemo(() => (creationMode ? getGymInitialMainTeamLimit(creationMode) : 0), [creationMode]);
  const effectiveGymActive = useMemo(() => Boolean(gym?.active), [gym]);
  const candidateByKey = useMemo(() => new Map(candidatePokemon.map((entry) => [monKey(entry), entry])), [candidatePokemon]);
  const eligibleCreationPokemon = useMemo(() => candidatePokemon.filter((entry) => getSpeciesTypes(entry.speciesId).includes(gymType)), [candidatePokemon, gymType]);
  const selectedCreationPokemon = useMemo(() => selectedPokemonKeys.map((key) => candidateByKey.get(key)).filter(Boolean) as CharacterPokemonOption[], [candidateByKey, selectedPokemonKeys]);
  const selectedBadge = useMemo(() => availableBadges.find((item) => item.id === selectedBadgeId) || null, [availableBadges, selectedBadgeId]);
  const selectedNpc = useMemo(
    () => availableNpcs.find((npc) => npc.id === selectedNpcId) || null,
    [availableNpcs, selectedNpcId]
  );
  const selectedScenario = useMemo(
    () => availableScenarios.find((scenario) => scenario.id === selectedScenarioId) || null,
    [availableScenarios, selectedScenarioId]
  );
  const unlockedNpcIds = useMemo(() => new Set(unlocks.npcIds), [unlocks.npcIds]);
  const unlockedScenarioIds = useMemo(() => new Set(unlocks.scenarioIds), [unlocks.scenarioIds]);
  const canUseNpc = useMemo(
    () => (npc: GymNpcOption | null | undefined) => !!npc && (!npc.isCommercialized || unlockedNpcIds.has(npc.id)),
    [unlockedNpcIds]
  );
  const canUseScenario = useMemo(
    () => (scenario: GymScenarioRecord | null | undefined) =>
      !!scenario && (!scenario.isCommercialized || unlockedScenarioIds.has(scenario.id)),
    [unlockedScenarioIds]
  );
  const suggestedScenarios = useMemo(
    () => availableScenarios.filter((scenario) => scenario.gymElementType === gymType),
    [availableScenarios, gymType]
  );
  const freeScenarios = useMemo(
    () => availableScenarios.filter((scenario) => !scenario.isCommercialized),
    [availableScenarios]
  );
  const unlockedScenarios = useMemo(
    () =>
      availableScenarios.filter(
        (scenario) => scenario.isCommercialized && unlockedScenarioIds.has(scenario.id)
      ),
    [availableScenarios, unlockedScenarioIds]
  );
  const lockedScenarios = useMemo(
    () =>
      availableScenarios.filter(
        (scenario) => scenario.isCommercialized && !unlockedScenarioIds.has(scenario.id)
      ),
    [availableScenarios, unlockedScenarioIds]
  );
  const freeNpcs = useMemo(() => availableNpcs.filter((npc) => !npc.isCommercialized), [availableNpcs]);
  const unlockedNpcs = useMemo(
    () => availableNpcs.filter((npc) => npc.isCommercialized && unlockedNpcIds.has(npc.id)),
    [availableNpcs, unlockedNpcIds]
  );
  const lockedNpcs = useMemo(
    () => availableNpcs.filter((npc) => npc.isCommercialized && !unlockedNpcIds.has(npc.id)),
    [availableNpcs, unlockedNpcIds]
  );
  const storageMainTeamIds = useMemo(() => new Set(mainTeamRows.map((entry) => entry.id)), [mainTeamRows]);
  const selectableGymStorageRows = useMemo(
    () =>
      storageRows.filter((entry) => {
        if (storageMainTeamIds.has(entry.id)) return false;
        if (!gym?.gymType) return true;
        return getSpeciesTypes(entry.speciesId).includes(String(gym.gymType || "").trim().toLowerCase());
      }),
    [gym?.gymType, storageMainTeamIds, storageRows]
  );
  const usableScenarios = useMemo(
    () => availableScenarios.filter((scenario) => !scenario.isCommercialized || unlockedScenarioIds.has(scenario.id)),
    [availableScenarios, unlockedScenarioIds]
  );
  const usableNpcs = useMemo(
    () => availableNpcs.filter((npc) => !npc.isCommercialized || unlockedNpcIds.has(npc.id)),
    [availableNpcs, unlockedNpcIds]
  );
  const currentGymScenario = useMemo(
    () => availableScenarios.find((scenario) => scenario.id === String(gym?.scenarioThemeId || "").trim().toLowerCase()) || null,
    [availableScenarios, gym?.scenarioThemeId]
  );
  const currentGymNpc = useMemo(
    () => availableNpcs.find((npc) => npc.id === String(gym?.linkedNpcId || "").trim().toLowerCase()) || null,
    [availableNpcs, gym?.linkedNpcId]
  );
  const currentMainTeamLimit = Math.max(1, Math.min(6, Number(gym?.totalSlots || gym?.mainTeamSlotLimit || 1)));
  const mainTeamBySlot = useMemo(
    () =>
      new Map(
        mainTeamRows
          .map((entry) => [Math.max(1, Number(entry.slotOrder || 0)), entry] as const)
          .filter(([slotNumber]) => Number.isFinite(slotNumber) && slotNumber > 0)
      ),
    [mainTeamRows]
  );
  const visualMainTeamSlots = useMemo(
    () =>
      Array.from({ length: 6 }, (_, index) => {
        const slotNumber = index + 1;
        const pokemon = mainTeamBySlot.get(slotNumber) || null;
        let status: "active" | "empty" | "blocked" = "blocked";
        if (slotNumber <= currentMainTeamLimit) {
          status = pokemon ? "active" : "empty";
        }
        return { slotNumber, pokemon, status };
      }),
    [currentMainTeamLimit, mainTeamBySlot]
  );
  const selectedRemoteGym = useMemo(
    () => biomeGymRows.find((row) => row.id === selectedTargetGymId) || targetGym,
    [biomeGymRows, selectedTargetGymId, targetGym]
  );
  const requiredChallengeSlots = Math.max(
    1,
    Math.min(6, Number(selectedRemoteGym?.totalSlots || selectedRemoteGym?.mainTeamSlotLimit || 1))
  );
  const challengeCandidatePokemon = useMemo(
    () => candidatePokemon.filter((entry) => entry.level > 0),
    [candidatePokemon]
  );
  const challengeCandidateByKey = useMemo(
    () => new Map(challengeCandidatePokemon.map((entry) => [monKey(entry), entry])),
    [challengeCandidatePokemon]
  );
  const selectedChallengePokemon = useMemo(
    () => selectedChallengePokemonKeys.map((key) => challengeCandidateByKey.get(key)).filter(Boolean) as CharacterPokemonOption[],
    [challengeCandidateByKey, selectedChallengePokemonKeys]
  );

  useEffect(() => {
    setSelectedPokemonKeys((current) => current.filter((key) => {
      const entry = candidateByKey.get(key);
      return entry ? getSpeciesTypes(entry.speciesId).includes(gymType) : false;
    }));
  }, [candidateByKey, gymType]);

  useEffect(() => {
    setSelectedScenarioId((current) => {
      if (!current) return current;
      const scenario = availableScenarios.find((item) => item.id === current);
      return canUseScenario(scenario) ? current : "";
    });
  }, [availableScenarios, canUseScenario]);

  useEffect(() => {
    setSelectedNpcId((current) => {
      if (!current) return current;
      const npc = availableNpcs.find((item) => item.id === current);
      return canUseNpc(npc) ? current : "";
    });
  }, [availableNpcs, canUseNpc]);

  useEffect(() => {
    if (!gym) return;
    setSelectedScenarioId((current) => current || String(gym.scenarioThemeId || ""));
    setSelectedBadgeId((current) => current || String(gym.primaryBadgeId || ""));
    setSelectedNpcId((current) => current || String(gym.linkedNpcId || ""));
  }, [gym]);

  useEffect(() => {
    setSelectedTargetGymId(targetGymId);
  }, [targetGymId]);

  useEffect(() => {
    if (loading) return;
    if (mode !== "manage") return;
    if (!characterId) return;
    if (gym) return;
    Alert.alert("GYM", "Esse personagem nao pode gerenciar esse GYM.");
    router.replace({ pathname: "/game", params: { characterId } });
  }, [loading, mode, characterId, gym]);

  useEffect(() => {
    if (!selectedRemoteGym) return;
    setSelectedChallengePokemonKeys((current) => current.slice(0, requiredChallengeSlots));
  }, [requiredChallengeSlots, selectedRemoteGym?.id]);

  useEffect(() => {
    let cancelled = false;
    async function loadTargetGym() {
      if (!selectedTargetGymId || selectedTargetGymId === uid) {
        if (!cancelled) {
          setTargetGym(null);
          setTargetLeaderAvatarUrl("");
        }
        return;
      }
      const gymRow = await getGymById(selectedTargetGymId);
      if (!gymRow) {
        if (!cancelled) {
          setTargetGym(null);
          setTargetLeaderAvatarUrl("");
        }
        return;
      }
      let avatarUrl = "";
      if (gymRow.ownerUid && gymRow.ownerCharacterId) {
        const characterSnap = await getDoc(doc(db, "players", gymRow.ownerUid, "characters", gymRow.ownerCharacterId));
        if (characterSnap.exists()) {
          avatarUrl = String(characterSnap.data()?.avatarUrl || characterSnap.data()?.imageUrl || "").trim();
        }
      }
      if (!cancelled) {
        setTargetGym(gymRow);
        setTargetLeaderAvatarUrl(avatarUrl);
      }
    }
    void loadTargetGym();
    return () => {
      cancelled = true;
    };
  }, [selectedTargetGymId, uid]);

  function nextStep() {
    if (step === 0 && !gymName.trim()) return Alert.alert("GYM", "Informe o nome do GYM.");
    if (step === 1 && !selectedScenario?.id) return Alert.alert("GYM", "Selecione manualmente um cenario para o GYM.");
    if (step === 2 && !selectedCreationPokemon.length) return Alert.alert("GYM", "Selecione pelo menos 1 Pokemon para o time principal.");
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  }

  function toggleScenarioSelection(scenarioId: string) {
    const scenario = availableScenarios.find((item) => item.id === scenarioId) || null;
    if (!canUseScenario(scenario)) {
      const price = scenario?.ecoinPrice != null ? `${scenario.ecoinPrice} ECoins` : "ECoins";
      Alert.alert("GYM", `Esse cenario precisa ser desbloqueado na EloMart antes do uso. Preco: ${price}.`);
      return;
    }
    setSelectedScenarioId((current) => (current === scenarioId ? "" : scenarioId));
  }

  function toggleNpcSelection(npcId: string) {
    const npc = availableNpcs.find((item) => item.id === npcId) || null;
    if (!canUseNpc(npc)) {
      const price = npc?.ecoinPrice != null ? `${npc.ecoinPrice} ECoins` : "ECoins";
      Alert.alert("GYM", `Esse NPC precisa ser desbloqueado na EloMart antes do uso. Preco: ${price}.`);
      return;
    }
    setSelectedNpcId((current) => (current === npcId ? "" : npcId));
  }

  function toggleCreationPokemon(entry: CharacterPokemonOption) {
    const key = monKey(entry);
    setSelectedPokemonKeys((current) => {
      if (current.includes(key)) return current.filter((value) => value !== key);
      if (current.length >= creationTeamLimit) {
        Alert.alert("GYM", `Esse direito de criacao permite ate ${creationTeamLimit} Pokemon.`);
        return current;
      }
      return [...current, key];
    });
  }

  function toggleChallengePokemon(entry: CharacterPokemonOption) {
    const key = monKey(entry);
    setSelectedChallengePokemonKeys((current) => {
      if (current.includes(key)) return current.filter((value) => value !== key);
      if (current.length >= requiredChallengeSlots) {
        Alert.alert("GYM", `Esse desafio exige exatamente ${requiredChallengeSlots} Pokemon.`);
        return current;
      }
      return [...current, key];
    });
  }

  async function handleCreateGym() {
    if (!uid || !characterId) return Alert.alert("GYM", "Abra o GYM a partir de um personagem.");
    if (!biomeGymEnabled) return Alert.alert("GYM", "Esse bioma nao permite criacao de GYM.");
    if (!creationMode || !standaloneTicket) return Alert.alert("GYM", "Voce precisa de um ticket GYM valido na mochila.");
    if (!selectedScenario?.id) return Alert.alert("GYM", "Selecione manualmente um cenario para o GYM.");
    if (!selectedBadge?.id) return Alert.alert("GYM", "Selecione uma insignia principal ativa.");
    if (!selectedCreationPokemon.length) return Alert.alert("GYM", "Selecione pelo menos 1 Pokemon para o time principal.");
    try {
      setSaving(true);
      await createGymForPlayer({
        uid,
        characterId,
        characterName,
        biomeId: resolvedBiomeId || biomeId,
        gymName,
        gymType,
        scenarioThemeId: selectedScenario.id,
        primaryBadgeId: selectedBadge.id,
        creationEntitlement: standaloneTicket,
        initialMainTeam: selectedCreationPokemon.map((entry) => ({ sourceCollection: entry.sourceCollection, sourceDocId: entry.id })),
        linkedNpcId: selectedNpc?.id || null,
      });
      Alert.alert("GYM", "GYM criado com sucesso.");
    } catch (e: any) {
      Alert.alert("GYM", e?.message || "Falha ao criar GYM.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRenewGym() {
    if (!uid || !characterId || !gym) return;
    if (!standaloneTicket) return Alert.alert("GYM", "Nenhum ticket GYM temporario disponivel para renovacao.");
    try {
      setSaving(true);
      await renewPlayerGymWithTicket({ uid, characterId, entitlement: standaloneTicket });
      Alert.alert("GYM", "GYM renovado e desbloqueado.");
    } catch (e: any) {
      Alert.alert("GYM", e?.message || "Falha ao renovar o GYM.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyScenarioChange() {
    if (!uid || !gym) return;
    if (!selectedScenarioId) return Alert.alert("GYM", "Selecione um cenario.");
    try {
      setSaving(true);
      await updatePlayerGymScenario({ uid, scenarioId: selectedScenarioId });
      Alert.alert("GYM", "Cenario atualizado.");
    } catch (e: any) {
      Alert.alert("GYM", e?.message || "Falha ao trocar o cenario.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyNpcChange() {
    if (!uid || !gym) return;
    if (!selectedNpcId) return Alert.alert("GYM", "Selecione um NPC.");
    try {
      setSaving(true);
      await updatePlayerGymNpc({ uid, npcId: selectedNpcId });
      Alert.alert("GYM", "NPC do GYM atualizado.");
    } catch (e: any) {
      Alert.alert("GYM", e?.message || "Falha ao trocar o NPC.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGymNpcPrimaryAction() {
    if (!uid || !characterId || !currentGymNpc) return;
    const role = String(currentGymNpc.role || "").trim().toLowerCase();
    if (!role.includes("enfer")) return;
    try {
      setSaving(true);
      const result = await healGymPokemon(
        uid,
        characterId,
        Array.from(new Set([...storageRows.map((entry) => entry.id), ...mainTeamRows.map((entry) => entry.id)]))
      );
      Alert.alert("GYM", `${result.healedCount} Pokemon curados por ${result.totalCost} moedas.`);
    } catch (e: any) {
      Alert.alert("GYM", e?.message || "Falha ao curar os Pokemon do GYM.");
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenGymPokemonDetails(entry: GymRosterEntry) {
    if (!uid) return;
    try {
      setDetailLoading(true);
      const sourceCharacterId = String(entry.sourceCharacterId || characterId || "").trim();
      if (!sourceCharacterId) throw new Error("Personagem de origem do Pokemon nao encontrado.");
      const sourceRef = doc(
        db,
        "players",
        uid,
        "characters",
        sourceCharacterId,
        entry.sourceCollection,
        entry.sourceDocId
      );
      const sourceSnap = await getDoc(sourceRef);
      setSelectedGymPokemon({
        entry,
        sourceData: sourceSnap.exists() ? (sourceSnap.data() as Record<string, unknown>) : null,
      });
    } catch (e: any) {
      Alert.alert("GYM", e?.message || "Falha ao abrir os detalhes do Pokemon do GYM.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAssignPokemonToVisualSlot(entry: GymRosterEntry, slotNumber: number) {
    if (!uid || !characterId) return;
    if (gym && !effectiveGymActive) return Alert.alert("GYM", "Seu GYM esta inativo no momento.");
    try {
      setSaving(true);
      await addPokemonToGymMainTeam(uid, entry.id, slotNumber);
      setPendingVisualSlot(null);
    } catch (e: any) {
      Alert.alert("GYM", e?.message || "Falha ao preencher o slot do time principal.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateChallenge(targetGym: PlayerGymDoc) {
    if (!uid || !characterId) return;
    const requiredSlots = Math.max(1, Math.min(6, Number(targetGym.totalSlots || targetGym.mainTeamSlotLimit || 1)));
    if (selectedChallengePokemon.length !== requiredSlots) {
      return Alert.alert("GYM", `Selecione exatamente ${requiredSlots} Pokemon para esse desafio.`);
    }
    const selectedTeam = selectedChallengePokemon.map((entry, index) => ({
      slotIndex: index + 1,
      speciesId: entry.speciesId,
      speciesName: entry.speciesName,
      level: entry.level,
    }));
    try {
      setSaving(true);
      await createGymChallenge({
        leaderUid: targetGym.ownerUid,
        challengerUid: uid,
        challengerCharacterId: characterId,
        challengerName: characterName,
        slotsRequested: requiredSlots,
        selectedTeam,
      });
      setSelectedChallengePokemonKeys([]);
      Alert.alert("GYM", "Desafio enviado para a fila do lider.");
    } catch (e: any) {
      Alert.alert("GYM", e?.message || "Falha ao enviar desafio.");
    } finally {
      setSaving(false);
    }
  }

  async function handleQueueResponse(challengeId: string, accept: boolean) {
    if (!uid) return;
    try {
      if (accept) {
        const challenge = challengeRows.find((row) => row.id === challengeId);
        const onlineSnap = challenge
          ? await getDocs(
              query(
                collection(db, "battlePresence"),
                where("uid", "==", challenge.challengerUid),
                where("characterId", "==", challenge.challengerCharacterId),
                where("online", "==", true)
              )
            )
          : null;
        if (!challenge || !onlineSnap || onlineSnap.empty) {
          return Alert.alert("GYM", "O desafiante esta offline. A solicitacao permanece pendente.");
        }
      }
      setSaving(true);
      await respondGymChallenge({ leaderUid: uid, challengeId, accept });
      Alert.alert("GYM", accept ? "Desafio aceito." : "Desafio recusado.");
    } catch (e: any) {
      Alert.alert("GYM", e?.message || "Falha ao responder desafio.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStealGymPokemon(entry: GymRosterEntry) {
    if (!uid || !characterId || !selectedRemoteGym?.ownerUid) return;
    if (String(characterClassType || "").toUpperCase() !== "THIEF") {
      Alert.alert("GYM", "Somente personagens da classe THIEF podem roubar Pokemon de um GYM.");
      return;
    }
    if (!characterBattleTeam.length) {
      Alert.alert("GYM", "Seu personagem precisa ter Pokemon no time para tentar o roubo.");
      return;
    }
    setStealBusyId(entry.id);
    try {
      const result = await resolveThiefPvpLoot({
        thiefUid: uid,
        thiefCharacterId: characterId,
        victimUid: selectedRemoteGym.ownerUid,
        victimCharacterId: selectedRemoteGym.ownerCharacterId || "",
        targetScope: "gym",
        gymOwnerUid: selectedRemoteGym.ownerUid,
        gymPokemonEntryId: entry.id,
      });
      if (!result.ok) {
        Alert.alert("Roubo de GYM", result.message || "O roubo falhou.");
        return;
      }
      if (result.policeInterceptRequired && result.caseId) {
        const playerTeam = characterBattleTeam
          .map((row, index) =>
            buildBattleMonster(
              row.speciesId,
              row.level,
              String(row.nickname || row.speciesName || `#${row.speciesId}`),
              index + 1,
              row.hpCurrent,
              row.hpTotal,
              row.moves
            )
          )
          .filter(Boolean) as BattleMonster[];
        if (!playerTeam.length) {
          Alert.alert("Roubo de GYM", "Intercepcao policial iniciada, mas seu time nao esta pronto para batalhar.");
          return;
        }
        const enemyTeam = [
          buildBattleMonster(
            Math.max(1, entry.speciesId || 25),
            Math.max(1, entry.level || 1),
            `${result.policeNpcName || "Policial"} - Guarda`,
            1,
            Math.max(20, entry.level * 5),
            Math.max(20, entry.level * 5),
            ["tackle", "bite", "quick-attack", "protect"]
          ),
        ].filter(Boolean) as BattleMonster[];
        setPoliceCaseId(String(result.caseId || ""));
        setPoliceNpcName(String(result.policeNpcName || "Policial do GYM"));
        setPoliceBattleLabel(`${String(result.policeNpcName || "Policial")} interceptou o roubo`);
        setPolicePlayerTeam(playerTeam);
        setPoliceEnemyTeam(enemyTeam);
        setPoliceBattleVisible(true);
        Alert.alert(
          "Roubo de GYM",
          `${result.policeNpcName || "Um policial"} interceptou o roubo. VenÃ§a a batalha para levar o Pokemon para a sede dos ladroes.`
        );
        return;
      }
      Alert.alert("Roubo de GYM", result.message || "Pokemon roubado com sucesso.");
    } catch (e: any) {
      Alert.alert("Roubo de GYM", e?.message || "Falha ao tentar roubar Pokemon do GYM.");
    } finally {
      setStealBusyId("");
    }
  }

  function renderScenarioOptionRow(scenario: GymScenarioRecord, status: "free" | "unlocked" | "locked") {
    const selected = selectedScenarioId === scenario.id;
    const imageUri = scenario.processedImageUrl || scenario.imageUrl || "";
    const meta =
      status === "free"
        ? `Gratis${scenario.gymElementType ? ` â€¢ Sugestao ${scenario.gymElementType}` : ""}`
        : status === "unlocked"
        ? `Desbloqueado com ECoins${scenario.gymElementType ? ` â€¢ Sugestao ${scenario.gymElementType}` : ""}`
        : `Bloqueado${scenario.ecoinPrice != null ? ` â€¢ ${scenario.ecoinPrice} ECoins` : " â€¢ Comercializado"}`;

    if (status === "locked") {
      return (
        <View key={`scenario-${status}-${scenario.id}`} style={styles.rowLocked}>
          {imageUri ? <Image source={{ uri: imageUri }} style={styles.icon} /> : <View style={styles.icon} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{scenario.name}</Text>
            <Text style={styles.rowMeta}>{meta}</Text>
          </View>
          <Text style={styles.pill}>Bloqueado</Text>
        </View>
      );
    }

    return (
      <Pressable
        key={`scenario-${status}-${scenario.id}`}
        onPress={() => toggleScenarioSelection(scenario.id)}
        style={[styles.row, selected ? styles.rowActive : null]}
      >
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.icon} /> : <View style={styles.icon} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{scenario.name}</Text>
          <Text style={styles.rowMeta}>{meta}</Text>
        </View>
        <Text style={styles.pill}>{selected ? "Selecionado" : "Selecionar"}</Text>
      </Pressable>
    );
  }

  function renderNpcOptionRow(npc: GymNpcOption, status: "free" | "unlocked" | "locked") {
    const selected = selectedNpcId === npc.id;
    const meta =
      status === "free"
        ? `${npc.role} â€¢ Gratis`
        : status === "unlocked"
        ? `${npc.role} â€¢ Desbloqueado com ECoins`
        : `${npc.role} â€¢ Bloqueado${npc.ecoinPrice != null ? ` â€¢ ${npc.ecoinPrice} ECoins` : ""}`;

    if (status === "locked") {
      return (
        <View key={`npc-${status}-${npc.id}`} style={styles.rowLocked}>
          {npc.imageUrl ? <Image source={{ uri: npc.imageUrl }} style={styles.icon} /> : <View style={styles.icon} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{npc.name}</Text>
            <Text style={styles.rowMeta}>{meta}</Text>
          </View>
          <Text style={styles.pill}>Bloqueado</Text>
        </View>
      );
    }

    return (
      <Pressable
        key={`npc-${status}-${npc.id}`}
        onPress={() => toggleNpcSelection(npc.id)}
        style={[styles.row, selected ? styles.rowActive : null]}
      >
        {npc.imageUrl ? <Image source={{ uri: npc.imageUrl }} style={styles.icon} /> : <View style={styles.icon} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{npc.name}</Text>
          <Text style={styles.rowMeta}>{meta}</Text>
        </View>
        <Text style={styles.pill}>{selected ? "Adicionado" : "Adicionar"}</Text>
      </Pressable>
    );
  }

  function renderGymTeamSlotCard(slot: { slotNumber: number; pokemon: GymRosterEntry | null; status: "active" | "empty" | "blocked" }) {
    const isSelected = pendingVisualSlot === slot.slotNumber;
    const displayName = slot.pokemon?.nickname || slot.pokemon?.speciesName || `Slot ${slot.slotNumber}`;
    const hpCurrent = Math.max(0, Number(slot.pokemon?.hpCurrent || 0));
    const hpTotal = Math.max(1, Number(slot.pokemon?.hpTotal || 100));
    const expCurrent = Math.max(0, Number(slot.pokemon?.expCurrent || 0));
    const expToNext = Math.max(1, Number(slot.pokemon?.expToNext || 100));
    const imageUri = String(slot.pokemon?.spriteUrl || getBattleFrontSprite(Number(slot.pokemon?.speciesId || 0)) || "").trim();

    return (
      <Pressable
        key={`visual-slot-card-${slot.slotNumber}`}
        style={[styles.gymSlotPressable, slot.status === "blocked" ? styles.gymSlotCardLocked : null, isSelected ? styles.gymSlotCardSelected : null]}
        onPress={() => {
          if (slot.status === "blocked") {
            router.push({ pathname: "/game", params: { characterId, openStore: "1" } });
            return;
          }
          if (slot.status === "empty") {
            setPendingVisualSlot(slot.slotNumber);
            return;
          }
          if (slot.status === "active" && slot.pokemon) {
            void handleOpenGymPokemonDetails(slot.pokemon);
          }
        }}
        disabled={saving}
      >
        <LinearGradient
          colors={
            slot.status === "active"
              ? ["rgba(59,130,246,0.22)", "rgba(99,102,241,0.12)"]
              : ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.04)"]
          }
          style={styles.gymSlotCard}
        >
          <View style={styles.gymSlotImageWrap}>
            <LinearGradient
              colors={
                slot.status === "active"
                  ? ["rgba(96,165,250,0.92)", "rgba(147,197,253,0.35)"]
                  : ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.05)"]
              }
              style={styles.gymSlotImageFrame}
            >
              <View style={styles.gymSlotImageInner}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.gymSlotSprite} resizeMode="contain" />
                ) : (
                  <Ionicons
                    name={
                      slot.status === "empty"
                        ? "add-circle-outline"
                        : slot.status === "blocked"
                        ? "lock-closed-outline"
                        : "add-circle-outline"
                    }
                    size={28}
                    color={COLORS.white}
                  />
                )}
              </View>
            </LinearGradient>
            <View style={styles.gymSlotBadge}>
              <Text style={styles.gymSlotBadgeText}>
                {slot.status === "active" ? "ATIVO" : slot.status === "empty" ? "LIVRE" : "BLOQUEADO"}
              </Text>
            </View>
          </View>
          <View style={styles.gymSlotInfo}>
            <View style={styles.gymSlotTopRow}>
              <Text style={styles.gymSlotName} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.gymSlotLevel}>{slot.pokemon ? `Nv ${slot.pokemon.level}` : `Slot ${slot.slotNumber}`}</Text>
            </View>
            <Text style={styles.gymSlotMeta} numberOfLines={1}>
              {slot.pokemon
                ? `${slot.pokemon.nature || "-"} | Slot ${slot.slotNumber}`
                : slot.status === "empty"
                ? `Toque para escolher um Pokemon para o Slot ${slot.slotNumber}`
                : `Toque para abrir a loja e liberar o Slot ${slot.slotNumber}`}
            </Text>
            <View style={styles.gymSlotBarBlock}>
              <View style={styles.gymSlotBarRow}>
                <Text style={styles.gymSlotBarLabel}>HP</Text>
                <Text style={styles.gymSlotBarValue}>{slot.pokemon ? `${hpCurrent}/${hpTotal}` : "--"}</Text>
              </View>
              <View style={styles.gymSlotBarTrack}>
                <View style={[styles.gymSlotBarFill, styles.gymSlotHpFill, { width: `${slot.pokemon ? Math.max(8, Math.min(100, (hpCurrent / hpTotal) * 100)) : 12}%` }]} />
              </View>
            </View>
            <View style={styles.gymSlotBarBlock}>
              <View style={styles.gymSlotBarRow}>
                <Text style={styles.gymSlotBarLabel}>EXP</Text>
                <Text style={styles.gymSlotBarValue}>{slot.pokemon ? `${expCurrent}/${expToNext}` : "--"}</Text>
              </View>
              <View style={styles.gymSlotBarTrack}>
                <View style={[styles.gymSlotBarFill, styles.gymSlotExpFill, { width: `${slot.pokemon ? Math.max(8, Math.min(100, (expCurrent / expToNext) * 100)) : 12}%` }]} />
              </View>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    );
  }

  if (loading) {
    return <View style={styles.center}><LinearGradient colors={["#050b1e", "#0f172a", "#1e3a8a"]} style={StyleSheet.absoluteFillObject} /><ActivityIndicator color={COLORS.white} /><Text style={styles.muted}>Carregando GYM...</Text></View>;
  }

  const selectedGymPokemonSprite = String(
    selectedGymPokemon?.sourceData?.spriteUrl ||
      selectedGymPokemon?.entry.spriteUrl ||
      getBattleFrontSprite(Number(selectedGymPokemon?.entry.speciesId || 0)) ||
      ""
  ).trim();
  const selectedGymPokemonName =
    String(selectedGymPokemon?.sourceData?.nickname || "").trim() ||
    selectedGymPokemon?.entry.nickname ||
    selectedGymPokemon?.entry.speciesName ||
    "Pokemon do GYM";
  const selectedGymPokemonSpeciesName =
    String(selectedGymPokemon?.sourceData?.speciesName || "").trim() ||
    selectedGymPokemon?.entry.speciesName ||
    "";
  const selectedGymPokemonLevel = Math.max(
    1,
    numberValue(selectedGymPokemon?.sourceData?.level, numberValue(selectedGymPokemon?.entry.level, 1))
  );
  const selectedGymPokemonHpData =
    selectedGymPokemon?.sourceData?.hp && typeof selectedGymPokemon.sourceData.hp === "object"
      ? (selectedGymPokemon.sourceData.hp as Record<string, unknown>)
      : null;
  const selectedGymPokemonHpCurrent = Math.max(
    0,
    numberValue(selectedGymPokemonHpData?.current, numberValue(selectedGymPokemon?.entry.hpCurrent, 0))
  );
  const selectedGymPokemonHpTotal = Math.max(
    1,
    numberValue(selectedGymPokemonHpData?.total, numberValue(selectedGymPokemon?.entry.hpTotal, 1))
  );
  const selectedGymPokemonExpData =
    selectedGymPokemon?.sourceData?.exp && typeof selectedGymPokemon.sourceData.exp === "object"
      ? (selectedGymPokemon.sourceData.exp as Record<string, unknown>)
      : null;
  const selectedGymPokemonExpCurrent = Math.max(
    0,
    numberValue(selectedGymPokemonExpData?.current, numberValue(selectedGymPokemon?.entry.expCurrent, 0))
  );
  const selectedGymPokemonExpToNext = Math.max(
    1,
    numberValue(selectedGymPokemonExpData?.toNext, numberValue(selectedGymPokemon?.entry.expToNext, 1))
  );
  const selectedGymPokemonStats =
    selectedGymPokemon?.sourceData?.stats && typeof selectedGymPokemon.sourceData.stats === "object"
      ? (selectedGymPokemon.sourceData.stats as Record<string, unknown>)
      : {};
  const selectedGymPokemonEvs =
    selectedGymPokemon?.sourceData?.evs && typeof selectedGymPokemon.sourceData.evs === "object"
      ? (selectedGymPokemon.sourceData.evs as Record<string, unknown>)
      : {};
  const selectedGymPokemonMoves = Array.isArray(selectedGymPokemon?.sourceData?.moves)
    ? selectedGymPokemon.sourceData.moves.map((move) => String(move || "").trim()).filter(Boolean)
    : [];

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#050b1e", "#0f172a", "#1e3a8a"]} style={StyleSheet.absoluteFillObject} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={22} color={COLORS.white} /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>GYM</Text>
            <Text style={styles.muted}>Registro, gerenciamento e upgrades do seu GYM</Text>
          </View>
        </View>

        {!gym ? (
          <>
            {selectedRemoteGym && selectedRemoteGym.ownerUid !== uid ? (
              <View style={styles.card}>
                <Text style={styles.titleSmall}>GYM encontrado no bioma</Text>
                <View style={styles.row}>
                  {targetLeaderAvatarUrl ? <Image source={{ uri: targetLeaderAvatarUrl }} style={styles.icon} /> : <View style={styles.icon} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{selectedRemoteGym.name}</Text>
                    <Text style={styles.rowMeta}>Lider: {selectedRemoteGym.ownerCharacterName || "Treinador"}</Text>
                    <Text style={styles.rowMeta}>Tipo: {selectedRemoteGym.gymType} Ã¢â‚¬Â¢ Slots: {requiredChallengeSlots}</Text>
                    <Text style={styles.rowMeta}>Insignia: {selectedRemoteGym.primaryBadgeName || "Nao definida"}</Text>
                    <Text style={styles.rowMeta}>Cenario: {selectedRemoteGym.scenarioThemeId || "padrao"} Ã¢â‚¬Â¢ Status: {selectedRemoteGym.status}</Text>
                  </View>
                </View>
                <Text style={styles.muted}>Selecione exatamente {requiredChallengeSlots} Pokemon para desafiar esse GYM.</Text>
                {challengeCandidatePokemon.map((entry) => {
                  const selected = selectedChallengePokemonKeys.includes(monKey(entry));
                  return (
                    <Pressable key={`challenge-pre-${monKey(entry)}`} onPress={() => toggleChallengePokemon(entry)} style={[styles.row, selected ? styles.rowActive : null]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{entry.nickname || entry.speciesName}</Text>
                        <Text style={styles.rowMeta}>{entry.speciesName} Ã¢â‚¬Â¢ Lv {entry.level} Ã¢â‚¬Â¢ {entry.sourceCollection}</Text>
                      </View>
                      <Text style={styles.pill}>{selected ? "Selecionado" : "Selecionar"}</Text>
                    </Pressable>
                  );
                })}
                <Pressable onPress={() => handleCreateChallenge(selectedRemoteGym)} style={styles.primary} disabled={saving}>
                  {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Entrar na fila do lider</Text>}
                </Pressable>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.eyebrow}>Fluxo inteligente</Text>
              <Text style={styles.titleSmall}>Criacao de GYM em 5 etapas</Text>
              <Text style={styles.muted}>Criacao manual via ticket GYM no bioma atual.</Text>
              <View style={styles.steps}>{STEPS.map((label, index) => <View key={label} style={[styles.stepDot, index <= step ? styles.stepDotActive : null]} />)}</View>
              <Text style={styles.muted}>Etapa atual: {STEPS[step]}</Text>
            </View>

            {!creationMode ? (
              <View style={styles.card}><Text style={styles.titleSmall}>Criar GYM</Text><Text style={styles.muted}>{biomeGymEnabled ? "Nenhum ticket GYM valido encontrado para esta conta." : "Este bioma nao permite criacao de GYM."}</Text></View>
            ) : null}

            {creationMode && step === 0 ? (
              <View style={styles.card}>
                <Text style={styles.titleSmall}>1. Nome do GYM</Text>
                <Text style={styles.muted}>Ticket pronto para consumo neste bioma.</Text>
                <Text style={styles.muted}>Time principal inicial: ate {creationTeamLimit} Pokemon.</Text>
                <TextInput value={gymName} onChangeText={setGymName} placeholder="Nome do GYM" placeholderTextColor="#94a3b8" style={styles.input} />
              </View>
            ) : null}

            {creationMode && step === 1 ? (
              <View style={styles.card}>
                <Text style={styles.titleSmall}>2. Tipo do GYM</Text>
                <View style={styles.wrap}>{GYM_TYPES.map((type) => <Pressable key={type} onPress={() => setGymType(type)} style={[styles.chip, gymType === type ? styles.chipActive : null]}><Text style={styles.chipText}>{type}</Text></Pressable>)}</View>
                <View style={styles.panel}>
                  <Text style={styles.eyebrow}>Bioma e cenario</Text>
                  <Text style={styles.titleMini}>O bioma libera o GYM; o cenario sera escolhido manualmente.</Text>
                  <Text style={styles.muted}>O tipo do GYM nao define cenario automaticamente.</Text>
                </View>
                {suggestedScenarios.length ? (
                  <View style={styles.panel}>
                    <Text style={styles.eyebrow}>Sugestoes para {gymType}</Text>
                    <Text style={styles.muted}>{suggestedScenarios.map((scenario) => scenario.name).join(", ")}</Text>
                  </View>
                ) : null}
                {freeScenarios.map((scenario) => renderScenarioOptionRow(scenario, "free"))}
                {unlockedScenarios.map((scenario) => renderScenarioOptionRow(scenario, "unlocked"))}
                {lockedScenarios.map((scenario) => renderScenarioOptionRow(scenario, "locked"))}
              </View>
            ) : null}

            {creationMode && step === 2 ? (
              <View style={styles.card}>
                <Text style={styles.titleSmall}>3. Time principal</Text>
                <Text style={styles.muted}>Somente Pokemon compativeis com o tipo {gymType}. Selecionados: {selectedCreationPokemon.length}/{creationTeamLimit}</Text>
                {eligibleCreationPokemon.map((entry) => {
                  const selected = selectedPokemonKeys.includes(monKey(entry));
                  return (
                    <Pressable key={monKey(entry)} onPress={() => toggleCreationPokemon(entry)} style={[styles.row, selected ? styles.rowActive : null]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{entry.nickname || entry.speciesName}</Text>
                        <Text style={styles.rowMeta}>{entry.speciesName} â€¢ Lv {entry.level} â€¢ {entry.sourceCollection}</Text>
                      </View>
                      <Text style={styles.pill}>{selected ? "Selecionado" : "Selecionar"}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {creationMode && step === 3 ? (
              <View style={styles.card}>
                <Text style={styles.titleSmall}>4. NPC do GYM</Text>
                <Text style={styles.muted}>Etapa opcional. Apenas NPCs gratis ou ja desbloqueados podem ser usados.</Text>
                {availableNpcs.map((npc) => {
                  const selected = selectedNpcId === npc.id;
                  return (
                    <Pressable key={npc.id} onPress={() => toggleNpcSelection(npc.id)} style={[styles.row, selected ? styles.rowActive : null, !canUseNpc(npc) ? styles.rowLocked : null]}>
                      {npc.imageUrl ? <Image source={{ uri: npc.imageUrl }} style={styles.icon} /> : <View style={styles.icon} />}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{npc.name}</Text>
                        <Text style={styles.rowMeta}>
                          {npc.role}
                          {npc.isCommercialized ? ` â€¢ Comercializado${npc.ecoinPrice != null ? ` â€¢ ${npc.ecoinPrice} ECoins` : ""}` : " â€¢ Gratis"}
                        </Text>
                      </View>
                      <Text style={styles.pill}>{selected ? "Adicionado" : npc.isCommercialized ? "Comprar / Adicionar" : "Adicionar"}</Text>
                    </Pressable>
                  );
                })}
                <View style={styles.panel}>
                  <Text style={styles.muted}>NPC vinculado: {selectedNpc ? selectedNpc.name : "nenhum"}. Essa etapa e opcional.</Text>
                </View>
              </View>
            ) : null}

            {creationMode && step === 4 ? (
              <View style={styles.card}>
                <Text style={styles.titleSmall}>5. Insignia principal</Text>
                <Text style={styles.muted}>Regra segura: apenas o maior bonus ativo por categoria e aplicado.</Text>
                {availableBadges.map((badge) => (
                  <Pressable key={badge.id} onPress={() => setSelectedBadgeId(badge.id)} style={[styles.row, badge.id === selectedBadgeId ? styles.rowActive : null]}>
                    {badge.imageUrl ? <Image source={{ uri: badge.imageUrl }} style={styles.icon} /> : <View style={styles.icon} />}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{badge.name}</Text>
                      <Text style={styles.rowMeta}>{badge.bonusType} â€¢ {badge.bonusValue}%</Text>
                      <Text style={styles.muted}>{badge.description}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable onPress={() => setStep((current) => Math.max(0, current - 1))} style={[styles.secondary, step === 0 ? styles.disabled : null]} disabled={step === 0}><Text style={styles.buttonText}>Voltar</Text></Pressable>
              {step < STEPS.length - 1 ? <Pressable onPress={nextStep} style={styles.primary}><Text style={styles.buttonText}>Continuar</Text></Pressable> : <Pressable onPress={handleCreateGym} style={styles.primary} disabled={saving}>{saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Criar GYM</Text>}</Pressable>}
            </View>
          </>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.inlineActions}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.titleSmall}>{gym.name}</Text>
                  <Text style={styles.muted}>
                    {gym.ticketMode === "temporary" && gym.expiresAtMs
                      ? `Ticket temporario â€¢ ${Math.max(0, Math.ceil((gym.expiresAtMs - Date.now()) / (24 * 60 * 60 * 1000)))} dia(s) restantes`
                      : "Ticket permanente"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.rowMeta}>BOX {gym.storageCount}/{gym.storageLimit}</Text>
                  <Text style={styles.rowMeta}>TIME PRINCIPAL {gym.mainTeamCount}/{currentMainTeamLimit}</Text>
                </View>
              </View>
              <View style={styles.inlineActions}>
                <Pressable
                  onPress={() => router.push({ pathname: "/game", params: { characterId, openGymBox: "1" } })}
                  style={styles.secondaryIcon}
                >
                  <Ionicons name="desktop-outline" size={18} color={COLORS.white} />
                  <Text style={styles.buttonText}>BOX</Text>
                </Pressable>
                <Pressable onPress={() => setQueueOpen((current) => !current)} style={styles.secondaryIcon}>
                  <Ionicons name="mail-outline" size={18} color={COLORS.white} />
                  <Text style={styles.buttonText}>EMAIL</Text>
                </Pressable>
              </View>
              <Text style={styles.muted}>Tipo do GYM: {gym.gymType}</Text>
              <Text style={styles.muted}>Insignia principal: {gym.primaryBadgeName || "Nao definida"}</Text>
              {gym.status === "blocked" ? (
                <Pressable onPress={handleRenewGym} style={styles.primary} disabled={saving}>
                  <Text style={styles.buttonText}>Renovar / desbloquear com ticket</Text>
                </Pressable>
              ) : null}
              {queueOpen ? (
                <View style={styles.panel}>
                  {challengeRows.length === 0 ? (
                    <Text style={styles.muted}>Nenhum desafio pendente.</Text>
                  ) : (
                    challengeRows.map((challenge) => (
                      <View key={challenge.id} style={[styles.row, { marginBottom: 8 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>{challenge.challengerName}</Text>
                          <Text style={styles.rowMeta}>{challenge.status} â€¢ {challenge.slotsRequested}x{challenge.slotsRequested}</Text>
                        </View>
                        <Pressable onPress={() => handleQueueResponse(challenge.id, true)} style={styles.secondary}><Text style={styles.buttonText}>Aceitar</Text></Pressable>
                        <Pressable onPress={() => handleQueueResponse(challenge.id, false)} style={styles.danger}><Text style={styles.buttonText}>Recusar</Text></Pressable>
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.titleSmall}>Time principal atual</Text>
              <Text style={styles.muted}>O Slot 1 fica ocupado pelo Pokemon inicial do GYM. Os Slots 2 a 6 ficam bloqueados ate serem liberados, e slots livres mostram + para preencher com Pokemon da BOX do GYM.</Text>
              {visualMainTeamSlots.map((slot) => renderGymTeamSlotCard(slot))}
            </View>


            <View style={styles.card}>
              <Text style={styles.titleSmall}>Cenario atual</Text>
              <Pressable onPress={() => setManageSelector("scenario")} style={styles.row}>
                {currentGymScenario?.processedImageUrl || currentGymScenario?.imageUrl ? (
                  <Image source={{ uri: currentGymScenario.processedImageUrl || currentGymScenario.imageUrl }} style={styles.icon} />
                ) : (
                  <View style={styles.icon} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{currentGymScenario?.name || gym.scenarioThemeId}</Text>
                  <Text style={styles.rowMeta}>{currentGymScenario?.gymElementType || "Sem tipo especial"}</Text>
                </View>
                <Text style={styles.pill}>Selecionar</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.titleSmall}>NPC atual</Text>
              <Pressable onPress={() => setManageSelector("npc")} style={styles.row}>
                {currentGymNpc?.imageUrl ? <Image source={{ uri: currentGymNpc.imageUrl }} style={styles.icon} /> : <View style={styles.icon} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{currentGymNpc?.name || gym.linkedNpcName || "Nenhum NPC configurado"}</Text>
                  <Text style={styles.rowMeta}>{currentGymNpc?.role || gym.linkedNpcRole || "Sem funcao especial"}</Text>
                </View>
                <Text style={styles.pill}>Opcoes</Text>
              </Pressable>
              {String(currentGymNpc?.role || "").trim().toLowerCase().includes("enfer") ? (
                <Pressable onPress={handleGymNpcPrimaryAction} style={styles.secondary}>
                  <Text style={styles.buttonText}>Curar todos os Pokemon do GYM</Text>
                </Pressable>
              ) : null}
            </View>

            {selectedRemoteGym && selectedRemoteGym.ownerUid !== uid ? (
              <View style={styles.card}>
                <Text style={styles.titleSmall}>Desafio do GYM</Text>
                <View style={styles.row}>
                  {targetLeaderAvatarUrl ? <Image source={{ uri: targetLeaderAvatarUrl }} style={styles.icon} /> : <View style={styles.icon} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{selectedRemoteGym.name}</Text>
                    <Text style={styles.rowMeta}>Lider: {selectedRemoteGym.ownerCharacterName || "Treinador"}</Text>
                    <Text style={styles.rowMeta}>Tipo: {selectedRemoteGym.gymType} Ã¢â‚¬Â¢ Slots: {requiredChallengeSlots}</Text>
                    <Text style={styles.rowMeta}>Insignia: {selectedRemoteGym.primaryBadgeName || "Nao definida"}</Text>
                    <Text style={styles.rowMeta}>Cenario: {selectedRemoteGym.scenarioThemeId || "padrao"} Ã¢â‚¬Â¢ Status: {selectedRemoteGym.status}</Text>
                  </View>
                </View>
                <Text style={styles.muted}>Selecione exatamente {requiredChallengeSlots} Pokemon para entrar na fila do lider.</Text>
                {challengeCandidatePokemon.map((entry) => {
                  const selected = selectedChallengePokemonKeys.includes(monKey(entry));
                  return (
                    <Pressable key={`challenge-${monKey(entry)}`} onPress={() => toggleChallengePokemon(entry)} style={[styles.row, selected ? styles.rowActive : null]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{entry.nickname || entry.speciesName}</Text>
                        <Text style={styles.rowMeta}>{entry.speciesName} Ã¢â‚¬Â¢ Lv {entry.level} Ã¢â‚¬Â¢ {entry.sourceCollection}</Text>
                      </View>
                      <Text style={styles.pill}>{selected ? "Selecionado" : "Selecionar"}</Text>
                    </Pressable>
                  );
                })}
                <Pressable onPress={() => handleCreateChallenge(selectedRemoteGym)} style={styles.primary} disabled={saving}>
                  {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Enviar desafio</Text>}
                </Pressable>
              </View>
            ) : null}

            {selectedRemoteGym && selectedRemoteGym.ownerUid !== uid ? (
              <View style={styles.card}>
                <Text style={styles.titleSmall}>Roubo de Pokemon do GYM</Text>
                <Text style={styles.muted}>
                  {String(characterClassType || "").toUpperCase() === "THIEF"
                    ? "Escolha um Pokemon do GYM para tentar roubar. Se houver policial ativo, voce pode ser interceptado."
                    : "Apenas personagens THIEF podem iniciar roubo de Pokemon do GYM."}
                </Text>
                {targetGymMainTeamRows.length === 0 ? <Text style={styles.muted}>Nenhum Pokemon visivel no time principal.</Text> : null}
                {targetGymMainTeamRows.map((entry) => (
                  <View key={`gym-main-steal-${entry.id}`} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{entry.nickname || entry.speciesName}</Text>
                      <Text style={styles.rowMeta}>Time principal â€¢ {entry.speciesName} â€¢ Lv {entry.level}</Text>
                    </View>
                    <Pressable
                      onPress={() => handleStealGymPokemon(entry)}
                      style={styles.danger}
                      disabled={stealBusyId === entry.id || String(characterClassType || "").toUpperCase() !== "THIEF"}
                    >
                      <Text style={styles.buttonText}>{stealBusyId === entry.id ? "Tentando..." : "Roubar"}</Text>
                    </Pressable>
                  </View>
                ))}
                {targetGymStorageRows.length === 0 ? <Text style={styles.muted}>Nenhum Pokemon visivel no storage.</Text> : null}
                {targetGymStorageRows.map((entry) => (
                  <View key={`gym-storage-steal-${entry.id}`} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{entry.nickname || entry.speciesName}</Text>
                      <Text style={styles.rowMeta}>Storage â€¢ {entry.speciesName} â€¢ Lv {entry.level}</Text>
                    </View>
                    <Pressable
                      onPress={() => handleStealGymPokemon(entry)}
                      style={styles.danger}
                      disabled={stealBusyId === entry.id || String(characterClassType || "").toUpperCase() !== "THIEF"}
                    >
                      <Text style={styles.buttonText}>{stealBusyId === entry.id ? "Tentando..." : "Roubar"}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            {biomeGymRows.filter((row) => row.ownerUid !== uid).length ? (
              <View style={styles.card}>
                <Text style={styles.titleSmall}>GYMs do bioma</Text>
                {biomeGymRows.filter((row) => row.ownerUid !== uid).map((row) => (
                  <View key={row.id} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{row.name}</Text>
                      <Text style={styles.rowMeta}>{row.gymType} â€¢ {row.status} â€¢ {row.totalSlots || row.mainTeamSlotLimit} slots</Text>
                    </View>
                    <Pressable onPress={() => setSelectedTargetGymId(row.id)} style={styles.primary}>
                      <Text style={styles.buttonText}>{selectedTargetGymId === row.id ? "Selecionado" : "Ver GYM"}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      <Modal visible={pendingVisualSlot != null} transparent animationType="fade" onRequestClose={() => setPendingVisualSlot(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalWrap, { maxWidth: 520 }]}>
            <LinearGradient colors={["#0f172a", "#111827"]} style={styles.modalCard}>
              <View style={styles.modalGlow} />
              <View style={styles.modalTopRow}>
                <View style={styles.modalLeft}>
                  <Text style={styles.modalTitle}>{pendingVisualSlot ? `Selecionar Pokemon para o Slot ${pendingVisualSlot}` : "Selecionar Pokemon"}</Text>
                  <Text style={styles.modalSubtitle}>Apenas Pokemon da BOX do GYM, do tipo {gym?.gymType}, podem preencher esse slot.</Text>
                </View>
                <Pressable onPress={() => setPendingVisualSlot(null)} style={styles.modalCloseBtn}>
                  <Text style={styles.modalCloseText}>Fechar</Text>
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10 }}>
                {selectableGymStorageRows.length === 0 ? (
                  <View style={styles.panel}>
                    <Text style={styles.muted}>Nenhum Pokemon elegivel disponivel na BOX do GYM para esse slot.</Text>
                  </View>
                ) : (
                  selectableGymStorageRows.map((entry) => (
                    <Pressable
                      key={`picker-${entry.id}`}
                      onPress={() => pendingVisualSlot ? void handleAssignPokemonToVisualSlot(entry, pendingVisualSlot) : undefined}
                      style={styles.row}
                      disabled={saving}
                    >
                      {entry.spriteUrl || entry.speciesId ? <Image source={{ uri: String(entry.spriteUrl || getBattleFrontSprite(Number(entry.speciesId || 0)) || "") }} style={styles.icon} /> : <View style={styles.icon} />}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{entry.nickname || entry.speciesName}</Text>
                        <Text style={styles.rowMeta}>{entry.speciesName} â€¢ Lv {entry.level} â€¢ BOX do GYM</Text>
                        <Text style={styles.muted}>{entry.nature || "Sem natureza"} â€¢ {getSpeciesTypes(entry.speciesId).join("/")}</Text>
                      </View>
                      <Text style={styles.pill}>Usar</Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </LinearGradient>
          </View>
        </View>
      </Modal>
      <Modal visible={!!manageSelector} transparent animationType="fade" onRequestClose={() => setManageSelector(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalWrap, { maxWidth: 520 }]}>
            <LinearGradient colors={["#0f172a", "#111827"]} style={styles.modalCard}>
              <View style={styles.modalGlow} />
              <View style={styles.modalTopRow}>
                <View style={styles.modalLeft}>
                  <Text style={styles.modalTitle}>{manageSelector === "scenario" ? "Selecionar cenario" : "Selecionar NPC"}</Text>
                  <Text style={styles.modalSubtitle}>
                    {manageSelector === "scenario"
                      ? "Apenas cenarios gratuitos ou ja adquiridos podem ser aplicados."
                      : "Apenas NPCs gratuitos ou ja adquiridos aparecem aqui."}
                  </Text>
                </View>
                <Pressable onPress={() => setManageSelector(null)} style={styles.modalCloseBtn}>
                  <Text style={styles.modalCloseText}>Fechar</Text>
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10 }}>
                {manageSelector === "scenario"
                  ? usableScenarios.map((scenario) => renderScenarioOptionRow(scenario, scenario.isCommercialized ? "unlocked" : "free"))
                  : usableNpcs.map((npc) => renderNpcOptionRow(npc, npc.isCommercialized ? "unlocked" : "free"))}
              </ScrollView>

              <Pressable
                onPress={() => {
                  if (manageSelector === "scenario") {
                    void handleApplyScenarioChange().finally(() => setManageSelector(null));
                  } else {
                    void handleApplyNpcChange().finally(() => setManageSelector(null));
                  }
                }}
                style={[
                  styles.primary,
                  manageSelector === "scenario"
                    ? (!selectedScenarioId || !canUseScenario(selectedScenario)) ? styles.disabled : null
                    : (!selectedNpcId || !canUseNpc(selectedNpc)) ? styles.disabled : null,
                ]}
                disabled={
                  manageSelector === "scenario"
                    ? !selectedScenarioId || !canUseScenario(selectedScenario) || saving
                    : !selectedNpcId || !canUseNpc(selectedNpc) || saving
                }
              >
                <Text style={styles.buttonText}>{manageSelector === "scenario" ? "Aplicar cenario" : "Aplicar NPC"}</Text>
              </Pressable>
            </LinearGradient>
          </View>
        </View>
      </Modal>
      <Modal visible={!!selectedGymPokemon || detailLoading} transparent animationType="fade" onRequestClose={() => setSelectedGymPokemon(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalWrap, { maxWidth: 560 }]}>
            <LinearGradient colors={["#0f172a", "#111827"]} style={styles.modalCard}>
              <View style={styles.modalGlow} />
              <View style={styles.modalTopRow}>
                <View style={styles.modalLeft}>
                  <Text style={styles.modalTitle}>Detalhes do Pokemon do GYM</Text>
                  <Text style={styles.modalSubtitle}>Visualizacao completa do slot ativo do time principal.</Text>
                </View>
                <Pressable onPress={() => setSelectedGymPokemon(null)} style={styles.modalCloseBtn}>
                  <Text style={styles.modalCloseText}>Fechar</Text>
                </Pressable>
              </View>

              {detailLoading ? (
                <View style={styles.detailLoadingWrap}>
                  <ActivityIndicator color={COLORS.white} />
                  <Text style={styles.muted}>Carregando detalhes...</Text>
                </View>
              ) : selectedGymPokemon ? (
                <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 12 }}>
                  <View style={styles.detailHeader}>
                    <View style={styles.detailSpriteWrap}>
                      {selectedGymPokemonSprite ? (
                        <Image source={{ uri: selectedGymPokemonSprite }} style={styles.detailSprite} resizeMode="contain" />
                      ) : (
                        <Ionicons name="sparkles-outline" size={28} color={COLORS.white} />
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.detailName}>{selectedGymPokemonName}</Text>
                      <Text style={styles.rowMeta}>{selectedGymPokemonSpeciesName} • Nv {selectedGymPokemonLevel}</Text>
                      <Text style={styles.rowMeta}>
                        {String(selectedGymPokemon?.sourceData?.nature || selectedGymPokemon.entry.nature || "Sem natureza")} • Slot {selectedGymPokemon.entry.slotOrder || 1}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.titleMini}>HP e EXP</Text>
                    <Text style={styles.muted}>HP: {selectedGymPokemonHpCurrent}/{selectedGymPokemonHpTotal}</Text>
                    <Text style={styles.muted}>EXP: {selectedGymPokemonExpCurrent}/{selectedGymPokemonExpToNext}</Text>
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.titleMini}>Stats</Text>
                    <View style={styles.detailGrid}>
                      {["atk", "def", "spa", "spd", "spe"].map((statKey) => (
                        <View key={`stat-${statKey}`} style={styles.detailGridCell}>
                          <Text style={styles.detailGridLabel}>{statKey.toUpperCase()}</Text>
                          <Text style={styles.detailGridValue}>{numberValue(selectedGymPokemonStats[statKey], 0)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.titleMini}>EV</Text>
                    <View style={styles.detailGrid}>
                      {["hp", "atk", "def", "spa", "spd", "spe"].map((statKey) => (
                        <View key={`ev-${statKey}`} style={styles.detailGridCell}>
                          <Text style={styles.detailGridLabel}>{statKey.toUpperCase()}</Text>
                          <Text style={styles.detailGridValue}>{numberValue(selectedGymPokemonEvs[statKey], 0)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.titleMini}>Movimentos</Text>
                    {selectedGymPokemonMoves.length ? (
                      selectedGymPokemonMoves.map((moveId) => (
                        <Text key={`move-${moveId}`} style={styles.muted}>
                          • {formatMoveLabel(moveId)}
                        </Text>
                      ))
                    ) : (
                      <Text style={styles.muted}>Nenhum movimento registrado.</Text>
                    )}
                  </View>
                </ScrollView>
              ) : null}
            </LinearGradient>
          </View>
        </View>
      </Modal>
      <BattleScene
        visible={policeBattleVisible && policePlayerTeam.length > 0 && policeEnemyTeam.length > 0}
        mode="trainer"
        backgroundKind="city"
        playerTeam={policePlayerTeam}
        enemyTeam={policeEnemyTeam}
        initialPlayerIndex={0}
        initialEnemyIndex={0}
        canRun={false}
        canUseBag={false}
        typeMultiplier={getTypeMultiplier}
        onTryCapture={async () => ({ ok: false, message: "Captura indisponivel neste confronto." })}
        onFinish={async ({ result }) => {
          if (!policeCaseId) {
            setPoliceBattleVisible(false);
            return;
          }
          try {
            const outcome = await resolveThiefPoliceOutcome({
              caseId: policeCaseId,
              thiefWon: result === "victory",
            });
            if (result === "victory") {
              Alert.alert(
                "Roubo de GYM",
                outcome.message || `${policeNpcName || "O policial"} perdeu. O Pokemon foi para a sede dos ladroes.`
              );
            } else {
              Alert.alert(
                "Roubo de GYM",
                outcome.message || `${policeNpcName || "O policial"} venceu. O roubo foi bloqueado e o Pokemon foi apreendido.`
              );
            }
          } catch (e: any) {
            Alert.alert("Roubo de GYM", e?.message || "Falha ao concluir o desfecho da interceptacao policial.");
          } finally {
            setPoliceBattleVisible(false);
            setPoliceCaseId("");
            setPoliceNpcName("");
          }
        }}
        onClose={() => {
          const openCaseId = policeCaseId;
          setPoliceBattleVisible(false);
          if (openCaseId) {
            void resolveThiefPoliceOutcome({ caseId: openCaseId, thiefWon: false })
              .then((outcome) => {
                Alert.alert("Roubo de GYM", outcome.message || "Voce desistiu da batalha policial e o roubo foi bloqueado.");
              })
              .catch(() => {})
              .finally(() => {
                setPoliceCaseId("");
                setPoliceNpcName("");
              });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  content: { gap: 12, paddingBottom: 28 },
  header: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 10 },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.10)" },
  card: { borderRadius: 20, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(15,23,42,0.84)", gap: 10 },
  gymSlotPressable: { borderRadius: 18, overflow: "hidden" },
  gymSlotCard: { borderRadius: 18, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", flexDirection: "row", gap: 12 as any },
  gymSlotCardLocked: { opacity: 0.56 },
  gymSlotCardSelected: { transform: [{ scale: 0.99 }] },
  gymSlotImageWrap: { width: 74, position: "relative" },
  gymSlotImageFrame: { width: 74, height: 74, borderRadius: 18, padding: 2 },
  gymSlotImageInner: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  gymSlotSprite: { width: "100%", height: "100%" },
  gymSlotBadge: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  gymSlotBadgeText: { color: COLORS.white, fontWeight: "900", fontSize: 10, letterSpacing: 0.4 },
  gymSlotInfo: { flex: 1 },
  gymSlotTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 as any, marginBottom: 4 },
  gymSlotName: { color: COLORS.white, fontWeight: "900", fontSize: 14, flex: 1 },
  gymSlotLevel: { color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 12 },
  gymSlotMeta: { color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12, marginBottom: 10 },
  gymSlotBarBlock: { marginBottom: 10 },
  gymSlotBarRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  gymSlotBarLabel: { color: "rgba(255,255,255,0.70)", fontWeight: "900", fontSize: 11 },
  gymSlotBarValue: { color: COLORS.white, fontWeight: "900", fontSize: 11 },
  gymSlotBarTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  gymSlotBarFill: { height: "100%", borderRadius: 999 },
  gymSlotHpFill: { backgroundColor: "#b91c1c" },
  gymSlotExpFill: { backgroundColor: "#3b82f6" },
  title: { color: COLORS.white, fontSize: 24, fontWeight: "900" },
  titleSmall: { color: COLORS.white, fontSize: 17, fontWeight: "900" },
  titleMini: { color: COLORS.white, fontSize: 15, fontWeight: "900" },
  eyebrow: { color: "#7dd3fc", fontWeight: "900", textTransform: "uppercase", letterSpacing: 1 },
  muted: { color: "rgba(255,255,255,0.74)", fontWeight: "700", lineHeight: 18 },
  input: { borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(2,6,23,0.55)", color: COLORS.white, paddingHorizontal: 12, paddingVertical: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 as any },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.04)" },
  chipActive: { borderColor: "rgba(96,165,250,0.58)", backgroundColor: "rgba(59,130,246,0.22)" },
  chipText: { color: COLORS.white, fontWeight: "800", textTransform: "capitalize" },
  panel: { borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "rgba(125,211,252,0.16)", backgroundColor: "rgba(2,6,23,0.55)" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, padding: 12, backgroundColor: "rgba(2,6,23,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  rowActive: { borderColor: "rgba(56,189,248,0.5)", backgroundColor: "rgba(14,116,144,0.18)" },
  rowLocked: { opacity: 0.55, borderColor: "rgba(248,113,113,0.35)", backgroundColor: "rgba(127,29,29,0.18)" },
  rowTitle: { color: COLORS.white, fontWeight: "900" },
  rowMeta: { color: "rgba(255,255,255,0.70)", fontWeight: "700", marginTop: 3 },
  icon: { width: 56, height: 56, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)" },
  pill: { color: COLORS.white, fontWeight: "900" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(2,6,23,0.76)", justifyContent: "center", padding: 18 },
  modalWrap: { width: "100%", alignSelf: "center" },
  modalCard: { borderRadius: 24, padding: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", gap: 12 },
  modalGlow: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(56,189,248,0.08)" },
  modalTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalLeft: { flex: 1, gap: 4 },
  modalTitle: { color: COLORS.white, fontSize: 18, fontWeight: "900" },
  modalSubtitle: { color: "rgba(255,255,255,0.72)", fontWeight: "700", lineHeight: 18 },
  modalCloseBtn: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.08)" },
  modalCloseText: { color: COLORS.white, fontWeight: "900" },
  detailLoadingWrap: { paddingVertical: 24, alignItems: "center", justifyContent: "center", gap: 10 },
  detailHeader: { flexDirection: "row", gap: 12, alignItems: "center" },
  detailSpriteWrap: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  detailSprite: { width: "100%", height: "100%" },
  detailName: { color: COLORS.white, fontSize: 18, fontWeight: "900" },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 as any },
  detailGridCell: {
    minWidth: 72,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(2,6,23,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  detailGridLabel: { color: "rgba(255,255,255,0.66)", fontWeight: "900", fontSize: 11, marginBottom: 4 },
  detailGridValue: { color: COLORS.white, fontWeight: "900", fontSize: 14 },
  steps: { flexDirection: "row", gap: 8 },
  stepDot: { width: 12, height: 12, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.12)" },
  stepDotActive: { backgroundColor: "#38bdf8" },
  inlineActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  actions: { flexDirection: "row", gap: 10 },
  primary: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary },
  secondary: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.04)" },
  secondaryIcon: { flex: 1, flexDirection: "row", gap: 8, borderRadius: 16, paddingVertical: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.04)" },
  danger: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(239,68,68,0.22)", borderWidth: 1, borderColor: "rgba(239,68,68,0.4)" },
  buttonText: { color: COLORS.white, fontWeight: "900" },
  disabled: { opacity: 0.4 },
});
