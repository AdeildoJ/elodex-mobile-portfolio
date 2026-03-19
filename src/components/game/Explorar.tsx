import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Animated, Image, ImageBackground, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from "firebase/firestore";

import { COLORS } from "../../theme/colors";
import { db } from "../../services/firebase/firebaseConfig";
import { BIOMES, type BiomeDef } from "../../data/biomes";
import pokemonSpecies from "../../data/pokemon/pokemonSpecies.json";
import pokemonMoves from "../../data/pokemon/pokemonMoves.json";
import type { PlayerGymDoc } from "../../services/firebase/gym.service";
import { BattleScene } from "../battle/BattleScene";
import { resolveScenarioAssetOverrides } from "../battle/remoteScenarioAssets";
import type { BattleAssetSet, BattleMonster, BattleMove, BattleWeather } from "../battle/types";
import { buildBattleMove } from "../battle/moveCatalog";
import { biomeToBattleBackground } from "../../explore/BiomeManager";
import { evaluateUnlockRule } from "../../explore/biomeUnlock";
import { getBattleBackSprite, getPokemonSpriteUrl, getBattleFrontSprite, getSpeciesTypes, getTypeMultiplier } from "../../pokemon/PokemonSprites";

type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
type Stats = Record<StatKey, number>;
type TeamMon = {
  speciesId: number; name: string; level: number; hpCurrent: number; hpTotal: number; moves?: string[]; nature?: string;
  stats?: Partial<Record<Exclude<StatKey, "hp">, number>> | null; ivs?: Partial<Record<StatKey, number>> | null; evs?: Partial<Record<StatKey, number>> | null;
};

type Props = {
  uid?: string;
  characterId?: string;
  characterRegion?: string;
  team?: TeamMon[];
  gymMode?: boolean;
  gymData?: PlayerGymDoc | null;
  trainerLicenseBiomeIds?: string[];
  trainerShinyBonusPercent?: number;
  onPokemonCenterHeal?: () => Promise<void> | void;
  onBattleTeamSync?: (payload: { slotIndex: number; hpCurrent: number; hpTotal: number }[]) => Promise<void> | void;
  onWildDefeated?: (p: { speciesId: number; level: number; slotIndices: number[] }) => Promise<void> | void;
  onLeadHpChanged?: (p: { slotIndex: number; hpCurrent: number }) => Promise<void> | void;
  pokeballs?: { id: string; name: string; quantity: number }[];
  onTryCapture?: (p: {
    ballId: string;
    encounter: { speciesId: number; speciesName: string; level: number; hpCurrent: number; hpTotal: number; biomeId?: string; moves?: string[]; isShiny?: boolean };
  }) => Promise<{ ok: boolean; message: string }>;
  onExploreSteps?: (steps: number) => Promise<void> | void;
  onBiomeChanged?: (payload: { biomeId: string; biomeName: string }) => void;
  onNpcAction?: (payload: {
    role: "nurse" | "breeder" | "specialist" | "remember";
    npcName: string;
    specialistType?: string | null;
    biomeId: string;
  }) => Promise<void> | void;
};

type BiomeNpc = {
  id: string;
  role: "nurse" | "breeder" | "specialist" | "remember";
  name: string;
  imageUrl?: string;
  specialistType?: string | null;
};

type BiomeState = BiomeDef & {
  unlocked: boolean;
  unlockRules?: unknown;
  npcs?: BiomeNpc[];
  battleAssets?: BattleAssetSet;
  battleScenarios?: string[];
  requiresTicket?: boolean;
  ticketProductCode?: string | null;
  requiresTrainerLicense?: boolean;
  trainerLicenseProductCode?: string | null;
};
type SpawnCandidate = {
  speciesId: number;
  min: number;
  max: number;
  encounterRate: number | null;
  captureLimit: number | null;
  capturedCount: number;
  mode: "individual" | "group" | "fallback" | "released";
  specialAbility?: string;
  specialNature?: string;
  specialMoves?: string[];
  fixedLevel?: number;
  releasedDocId?: string;
};
type Encounter = {
  speciesId: number;
  speciesName: string;
  spriteUrl: string | null;
  isShiny?: boolean;
  level: number;
  biomeId: string;
  biomeName: string;
  gender: "M" | "F";
  abilityId: string;
  nature: string;
  moves: string[];
  hpCurrent: number;
  hpTotal: number;
  releasedDocId?: string;
  isReleased?: boolean;
  battleAssets?: BattleAssetSet;
};

type GymScenarioState = {
  imageUrl: string | null;
  battleAssets: BattleAssetSet | null;
  weather: BattleWeather;
};

const VERSION_ID = "elodex-base";
const NATURES = ["Hardy", "Lonely", "Brave", "Adamant", "Naughty", "Bold", "Docile", "Relaxed", "Impish", "Lax", "Timid", "Hasty", "Serious", "Jolly", "Naive", "Modest", "Mild", "Quiet", "Bashful", "Rash", "Calm", "Gentle", "Sassy", "Careful", "Quirky"];
const NATURE_FX: Record<string, { up?: Exclude<StatKey, "hp">; down?: Exclude<StatKey, "hp"> }> = {
  Hardy: {}, Lonely: { up: "atk", down: "def" }, Brave: { up: "atk", down: "spe" }, Adamant: { up: "atk", down: "spa" }, Naughty: { up: "atk", down: "spd" },
  Bold: { up: "def", down: "atk" }, Docile: {}, Relaxed: { up: "def", down: "spe" }, Impish: { up: "def", down: "spa" }, Lax: { up: "def", down: "spd" },
  Timid: { up: "spe", down: "atk" }, Hasty: { up: "spe", down: "def" }, Serious: {}, Jolly: { up: "spe", down: "spa" }, Naive: { up: "spe", down: "spd" },
  Modest: { up: "spa", down: "atk" }, Mild: { up: "spa", down: "def" }, Quiet: { up: "spa", down: "spe" }, Bashful: {}, Rash: { up: "spa", down: "spd" },
  Calm: { up: "spd", down: "atk" }, Gentle: { up: "spd", down: "def" }, Sassy: { up: "spd", down: "spe" }, Careful: { up: "spd", down: "spa" }, Quirky: {},
};

const BIOME_IMAGE_BY_ID: Record<string, any> = {
  "caverna-luminar": require("../../../assets/images/biomas/CavernaLuminar.png"),
  "caverna-luminar-subsolo": require("../../../assets/images/biomas/CavernaLuminarSubSolo.png"),
  "floresta-esmeralda": require("../../../assets/images/biomas/FlorestaEsmeralda.png"),
  "floresta-luminar": require("../../../assets/images/biomas/FlorestaLuminar.png"),
  "lago-estelar": require("../../../assets/images/biomas/LagoEstelar.png"),
  "planice-sylphia": require("../../../assets/images/biomas/PlaniceSylphia.png"),
  "porto-azuria": require("../../../assets/images/biomas/PortoAzuria.png"),
  "praia-coralina": require("../../../assets/images/biomas/PraiaCoralina.png"),
};

function normalizeWeather(raw: unknown): BattleWeather {
  const w = String(raw || "").trim().toLowerCase();
  if (w === "sun") return "sun";
  if (w === "rain") return "rain";
  if (w === "sandstorm") return "sandstorm";
  if (w === "hail") return "hail";
  if (w === "snow") return "snow";
  return "none";
}

function normalizeBattleAssets(raw: unknown): BattleAssetSet {
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const backgroundDay = String(root.backgroundDay || "").trim();
  const backgroundNight = String(root.backgroundNight || "").trim();
  const legacyRain = String(root.backgroundRain || "").trim();
  const legacySunny = String(root.backgroundSunny || "").trim();
  const legacySand = String(root.backgroundSandstorm || "").trim();
  const legacySnow = String(root.backgroundSnow || "").trim();
  return {
    skyDay: String(root.skyDay || "").trim() || null,
    skyNight: String(root.skyNight || "").trim() || null,
    sky: String(root.sky || "").trim() || null,
    backgroundDay: backgroundDay || null,
    backgroundNight: backgroundNight || null,
    background: String(root.background || "").trim() || backgroundDay || backgroundNight || null,
    groundDay: String(root.groundDay || "").trim() || null,
    groundNight: String(root.groundNight || "").trim() || null,
    ground: String(root.ground || "").trim() || null,
    overlayRain: String(root.overlayRain || "").trim() || null,
    overlaySnow: String(root.overlaySnow || "").trim() || null,
    overlaySandstorm: String(root.overlaySandstorm || "").trim() || null,
    overlaySunny: String(root.overlaySunny || "").trim() || null,
    backgroundRain: legacyRain || null,
    backgroundSunny: legacySunny || null,
    backgroundSandstorm: legacySand || null,
    backgroundSnow: legacySnow || null,
    platformPlayer: String(root.platformPlayer || "").trim() || null,
    platformEnemy: String(root.platformEnemy || "").trim() || null,
    platformPlayerNight: String(root.platformPlayerNight || "").trim() || null,
    platformEnemyNight: String(root.platformEnemyNight || "").trim() || null,
  };
}

function normalizeNpcList(raw: unknown): BiomeNpc[] {
  if (!Array.isArray(raw)) return [];
  const out: BiomeNpc[] = [];
  raw.forEach((row, idx) => {
    if (typeof row === "string") {
      const name = row.trim();
      if (!name) return;
      out.push({
        id: `legacy-${idx + 1}`,
        role: "remember",
        name,
        imageUrl: "",
        specialistType: null,
      });
      return;
    }
    if (!row || typeof row !== "object") return;
    const data = row as Record<string, unknown>;
    const roleRaw = String(data.role || "").trim().toLowerCase();
    let role: BiomeNpc["role"] = "remember";
    if (roleRaw === "nurse" || roleRaw === "enfermeiro") role = "nurse";
    else if (roleRaw === "breeder" || roleRaw === "criador") role = "breeder";
    else if (roleRaw === "specialist" || roleRaw === "especialista") role = "specialist";
    else if (roleRaw === "remember") role = "remember";
    const name = String(data.name || "").trim();
    if (!name) return;
    out.push({
      id: String(data.id || `${role}-${idx + 1}`),
      role,
      name,
      imageUrl: String(data.imageUrl || ""),
      specialistType: role === "specialist" ? String(data.specialistType || "").trim().toLowerCase() : null,
    });
  });
  return out;
}

function npcRoleLabel(role: BiomeNpc["role"]) {
  if (role === "nurse") return "Enfermeira";
  if (role === "breeder") return "Criador";
  if (role === "specialist") return "Especialista";
  return "Remember";
}

const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const asPosInt = (v: unknown) => Number.isFinite(Number(v)) && Number(v) > 0 ? Math.trunc(Number(v)) : null;
const randBetween = (a: number, b: number) => Math.min(a, b) + Math.floor(Math.random() * (Math.abs(a - b) + 1));

function encounterChanceForCandidate(c: SpawnCandidate) {
  if (c.captureLimit != null && c.captureLimit >= 0 && c.capturedCount >= c.captureLimit) return 0;
  if (c.mode === "released") return 2;
  if (c.mode === "individual") {
    const rate = n(c.encounterRate);
    if (rate <= 0) return 0;
    return Math.max(1, Math.min(100, rate));
  }
  if (c.mode === "group") return 38;
  return 28;
}

function buildGymCandidates(gymType: string, team: TeamMon[]): SpawnCandidate[] {
  const normalizedType = String(gymType || "").trim().toLowerCase();
  if (!normalizedType) return [];

  const realTeam = team.filter((mon) => n(mon.speciesId) > 0 && n(mon.level) > 0);
  const averageLevel = realTeam.length
    ? Math.max(3, Math.round(realTeam.reduce((sum, mon) => sum + n(mon.level), 0) / realTeam.length))
    : 12;
  const minLevel = Math.max(2, averageLevel - 4);
  const maxLevel = Math.max(minLevel + 2, averageLevel + 4);
  const rows = (Array.isArray(pokemonSpecies) ? (pokemonSpecies as any[]) : Object.values(pokemonSpecies as any))
    .filter((row: any) => {
      const flags = row?.flags || {};
      if (flags.legendary || flags.mythical) return false;
      const types = getSpeciesTypes(n(row?.id ?? row?.speciesId));
      return types.includes(normalizedType);
    })
    .slice(0, 180);

  return rows.map((row: any) => ({
    speciesId: Math.max(1, n(row?.id ?? row?.speciesId)),
    min: minLevel,
    max: maxLevel,
    encounterRate: null,
    captureLimit: null,
    capturedCount: 0,
    mode: "fallback" as const,
  }));
}

function pickGymBattleBackground(gymType: string) {
  const type = String(gymType || "").trim().toLowerCase();
  if (["water", "ice"].includes(type)) return "beach" as const;
  if (["rock", "ground", "steel"].includes(type)) return "cave" as const;
  if (["grass", "bug"].includes(type)) return "forest" as const;
  if (["electric", "normal"].includes(type)) return "city" as const;
  return "grasslands" as const;
}

const entry = (id: number) => (Object.values(pokemonSpecies as any) as any[]).find((p) => n(p?.id ?? p?.speciesId) === id) ?? null;
const baseStats = (id: number): Stats | null => {
  const e = entry(id);
  if (!e) return null;
  const s = e.baseStats ?? e.stats;
  return s ? { hp: n(s.hp), atk: n(s.atk ?? s.attack), def: n(s.def ?? s.defense), spa: n(s.spa ?? s.specialAttack), spd: n(s.spd ?? s.specialDefense), spe: n(s.spe ?? s.speed) } : null;
};
const speciesName = (id: number) => String(entry(id)?.name || `#${id}`);
const speciesSprite = (id: number) => String(getPokemonSpriteUrl(id) || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`);
const speciesAbilities = (id: number) => (entry(id)?.abilities ?? []).map((a: any) => String(a?.abilityId ?? a?.id ?? a?.name ?? "")).filter(Boolean);
const natureMul = (nature: string | undefined, stat: Exclude<StatKey, "hp">) => NATURE_FX[nature || "Docile"]?.up === stat ? 1.1 : NATURE_FX[nature || "Docile"]?.down === stat ? 0.9 : 1;
const calcStats = (level: number, base: Stats, nature?: string, ivs?: any, evs?: any): Stats => {
  const iv = (s: StatKey) => Math.max(0, n(ivs?.[s]));
  const ev = (s: StatKey) => Math.max(0, n(evs?.[s]));
  const hp = Math.floor(((2 * base.hp + iv("hp") + Math.floor(ev("hp") / 4)) * level) / 100) + level + 10;
  const o = (s: Exclude<StatKey, "hp">) => Math.floor((Math.floor(((2 * base[s] + iv(s) + Math.floor(ev(s) / 4)) * level) / 100) + 5) * natureMul(nature, s));
  return { hp, atk: o("atk"), def: o("def"), spa: o("spa"), spd: o("spd"), spe: o("spe") };
};
const movesAtLevel = (speciesId: number, level: number) => {
  const data: any = pokemonMoves;
  const byKey = data?.[String(speciesId)];
  const list = Array.isArray(byKey?.moves) ? byKey.moves : Array.isArray(byKey) ? byKey : [];
  const learned = list
    .map((m: any) => ({ id: String(m.moveId || m.id || m.name || m.moveName || ""), lv: n(m.level ?? m.levelLearnedAt) }))
    .filter((m: any) => m.id && m.lv > 0 && m.lv <= level)
    .sort((a: any, b: any) => a.lv - b.lv);
  const out: string[] = [];
  for (let i = learned.length - 1; i >= 0; i--) {
    if (!out.includes(learned[i].id)) out.unshift(learned[i].id);
    if (out.length >= 4) break;
  }
  return out.length ? out : ["tackle", "quick-attack"];
};

function toBattleMove(moveId: string): BattleMove {
  return buildBattleMove(moveId);
}

function toBattleMonsterFromTeam(mon: TeamMon, slotIndex: number): BattleMonster | null {
  if (n(mon.speciesId) <= 0 || n(mon.level) <= 0) return null;
  const b = baseStats(mon.speciesId);
  const real = b ? calcStats(Math.max(1, n(mon.level)), b, mon.nature, mon.ivs, mon.evs) : null;
  const hpTotal = Math.max(1, n(mon.hpTotal ?? real?.hp ?? 20));
  const hpCurrent = Math.max(0, Math.min(hpTotal, n(mon.hpCurrent ?? hpTotal)));
  const moveList = (Array.isArray(mon.moves) && mon.moves.length ? mon.moves : movesAtLevel(mon.speciesId, mon.level)).slice(0, 4);
  return {
    id: `player-${slotIndex}-${mon.speciesId}`,
    speciesId: mon.speciesId,
    name: String(mon.name || speciesName(mon.speciesId)),
    level: Math.max(1, n(mon.level)),
    hpCurrent,
    hpTotal,
    stats: {
      hp: hpTotal,
      atk: Math.max(1, n(mon.stats?.atk ?? real?.atk ?? 10)),
      def: Math.max(1, n(mon.stats?.def ?? real?.def ?? 10)),
      spa: Math.max(1, n(mon.stats?.spa ?? real?.spa ?? 10)),
      spd: Math.max(1, n(mon.stats?.spd ?? real?.spd ?? 10)),
      spe: Math.max(1, n(mon.stats?.spe ?? real?.spe ?? 10)),
    },
    types: getSpeciesTypes(mon.speciesId),
    sprite: { front: getBattleFrontSprite(mon.speciesId), back: getBattleBackSprite(mon.speciesId) },
    moves: moveList.map(toBattleMove),
    slotIndex,
    expCurrent: Math.max(0, n((mon as any)?.expCurrent ?? 0)),
    expToNext: Math.max(1, n((mon as any)?.expToNext ?? 100)),
    expTotal: Math.max(0, n((mon as any)?.expTotal ?? (mon as any)?.expCurrent ?? 0)),
    abilityId: (mon as any)?.abilityId ?? null,
    heldItemId: (mon as any)?.heldItemId ?? (mon as any)?.itemId ?? null,
  };
}

function toBattleMonsterFromEncounter(enc: Encounter): BattleMonster {
  const b = baseStats(enc.speciesId);
  const real = b ? calcStats(enc.level, b, enc.nature, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }) : null;
  const hpTotal = Math.max(10, n(enc.hpTotal || real?.hp || 20 + enc.level * 2));
  const hpCurrent = Math.max(1, Math.min(hpTotal, n(enc.hpCurrent || hpTotal)));
  return {
    id: `wild-${enc.speciesId}`,
    speciesId: enc.speciesId,
    name: enc.speciesName,
    level: enc.level,
    hpCurrent,
    hpTotal,
    stats: {
      hp: hpTotal,
      atk: Math.max(1, n(real?.atk ?? 10)),
      def: Math.max(1, n(real?.def ?? 10)),
      spa: Math.max(1, n(real?.spa ?? 10)),
      spd: Math.max(1, n(real?.spd ?? 10)),
      spe: Math.max(1, n(real?.spe ?? 10)),
    },
    types: getSpeciesTypes(enc.speciesId),
    sprite: { front: getBattleFrontSprite(enc.speciesId), back: getBattleBackSprite(enc.speciesId) },
    moves: (enc.moves?.length ? enc.moves : ["tackle"]).slice(0, 4).map(toBattleMove),
    abilityId: enc.abilityId ?? null,
    heldItemId: null,
  };
}

export function Explorar({
  uid,
  characterId,
  characterRegion,
  team = [],
  gymMode = false,
  gymData = null,
  onPokemonCenterHeal,
  onBattleTeamSync,
  onWildDefeated,
  onLeadHpChanged,
  pokeballs = [],
  onTryCapture,
  onExploreSteps,
  onBiomeChanged,
  onNpcAction,
  trainerLicenseBiomeIds = [],
  trainerShinyBonusPercent = 0,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [biomes, setBiomes] = useState<BiomeState[]>([]);
  const [selectedBiomeId, setSelectedBiomeId] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [visibleBiomeGyms, setVisibleBiomeGyms] = useState<PlayerGymDoc[]>([]);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [exploreFeedback, setExploreFeedback] = useState<string>("");

  const [battleVisible, setBattleVisible] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [healing, setHealing] = useState(false);
  const [gymScenario, setGymScenario] = useState<GymScenarioState>({ imageUrl: null, battleAssets: null, weather: "none" });
  const transition = useMemo(() => new Animated.Value(0), []);

  const teamWithSlot = useMemo(() => team.map((p, idx) => ({ ...p, slotIndex: idx + 1 })), [team]);
  const partySpeciesIds = useMemo(
    () => team.map((m) => Math.max(0, Number(m.speciesId || 0))).filter((id) => id > 0),
    [team]
  );
  const teamMoves = useMemo(
    () =>
      team
        .flatMap((m) => (Array.isArray(m.moves) ? m.moves : []))
        .map((mv) => String(mv || "").trim().toLowerCase())
        .filter(Boolean),
    [team]
  );
  const playerBattleTeam = useMemo(
    () => teamWithSlot.map((m) => toBattleMonsterFromTeam(m, m.slotIndex)).filter(Boolean) as BattleMonster[],
    [teamWithSlot]
  );
  const playerLeadIndex = useMemo(() => playerBattleTeam.findIndex((m) => m.hpCurrent > 0), [playerBattleTeam]);
  const enemyBattleTeam = useMemo(() => (encounter ? [toBattleMonsterFromEncounter(encounter)] : []), [encounter]);
  const selectedBiome = useMemo(() => biomes.find((b) => b.id === selectedBiomeId) ?? null, [biomes, selectedBiomeId]);
  const gymArea = useMemo<BiomeState | null>(() => {
    if (!gymMode || !gymData?.active) return null;
    const syntheticId = `gym-${String(gymData.id || gymData.ownerUid || "local").trim().toLowerCase()}`;
    return {
      ...(BIOMES[0] as BiomeDef),
      id: syntheticId,
      name: gymData.name || "GYM",
      description: `Modo ${String(gymData.gymType || "").toUpperCase()}`,
      minLevel: 2,
      maxLevel: 80,
      speciesPool: [],
      battleWeather: gymScenario.weather,
      battleAssets: gymScenario.battleAssets || undefined,
      battleScenarios: gymData.scenarioThemeId ? [gymData.scenarioThemeId] : [],
      unlockRules: undefined,
      npcs: [],
      requiresTicket: false,
      ticketProductCode: null,
      unlocked: true,
    };
  }, [gymMode, gymData, gymScenario]);
  const selectedArea = gymMode ? gymArea : selectedBiome;
  const hasInjuredTeam = useMemo(
    () => team.some((m) => n(m.speciesId) > 0 && n(m.hpCurrent) < Math.max(1, n(m.hpTotal))),
    [team]
  );

  const onPressNpc = async (npc: BiomeNpc) => {
    if (!selectedArea || !selectedArea.unlocked) return;
    await onNpcAction?.({
      role: npc.role,
      npcName: npc.name,
      specialistType: npc.specialistType ?? null,
      biomeId: selectedArea.id,
    });
  };

  useEffect(() => {
    if (!selectedBiome || gymMode) return;
    onBiomeChanged?.({
      biomeId: String(selectedBiome.id || "").trim().toLowerCase(),
      biomeName: String(selectedBiome.name || selectedBiome.id || "").trim(),
    });
  }, [gymMode, onBiomeChanged, selectedBiome]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rk = String(characterRegion || "").trim().toLowerCase();
        const remoteBiomes = new Map<
          string,
          {
            id: string;
            name?: string;
            description?: string;
            unlockRules?: unknown;
            battleWeather?: BattleWeather;
            npcs?: BiomeNpc[];
            battleAssets?: BattleAssetSet;
            battleScenarios?: string[];
            requiresTicket?: boolean;
            ticketProductCode?: string | null;
            requiresTrainerLicense?: boolean;
            trainerLicenseProductCode?: string | null;
          }
        >();
        const unlock = new Map<string, boolean>();
        let kmWalked = 0;
        let completedMissionIds: string[] = [];
        let accessIds: string[] = [];

        if (uid && characterId) {
          try {
            const [unlockSnap, charSnap, biomesSnap, missionsSnap, accessSnap] = await Promise.all([
              getDocs(collection(db, "players", uid, "characters", characterId, "explore_biomes")),
              getDoc(doc(db, "players", uid, "characters", characterId)),
              getDocs(collection(db, "biomes")),
              getDocs(collection(db, "players", uid, "characters", characterId, "missions_progress")),
              getDocs(collection(db, "players", uid, "characters", characterId, "biome_access")),
            ]);

            unlockSnap.forEach((d) => unlock.set(d.id, !!d.data()?.unlocked));
            if (charSnap.exists()) {
              const data = charSnap.data() as Record<string, unknown>;
              kmWalked = Math.max(
                0,
                Number(data.kmWalked ?? data.totalKm ?? data.distanceKm ?? 0) || 0
              );
            }
            biomesSnap.forEach((d) => {
              const data = d.data() as Record<string, unknown>;
              const id = String(data.id || d.id).trim().toLowerCase();
              if (!id) return;
              remoteBiomes.set(id, {
                id,
                name: typeof data.name === "string" ? data.name : undefined,
                description: typeof data.description === "string" ? data.description : undefined,
                unlockRules: data.unlockRules ?? null,
                battleWeather: normalizeWeather(data.battleWeather ?? data.weather),
                npcs: normalizeNpcList(data.npcs),
                battleAssets: normalizeBattleAssets(data.battleAssets),
                battleScenarios: Array.isArray(data.battleScenarios) ? data.battleScenarios : [],
                requiresTicket: Boolean(data.requiresTicket),
                ticketProductCode: typeof data.ticketProductCode === "string" ? data.ticketProductCode : null,
                requiresTrainerLicense: Boolean(data.requiresTrainerLicense),
                trainerLicenseProductCode:
                  typeof data.trainerLicenseProductCode === "string" ? data.trainerLicenseProductCode : null,
              });
            });
            completedMissionIds = missionsSnap.docs
              .filter((d) => Boolean(d.data()?.completed))
              .map((d) => String(d.id).trim().toLowerCase())
              .filter(Boolean);
            accessIds = accessSnap.docs
              .filter((d) => {
                const row = d.data() as Record<string, unknown>;
                const expiresAtMsRaw = Number(row?.expiresAtMs || 0);
                if (Number.isFinite(expiresAtMsRaw) && expiresAtMsRaw > 0) {
                  return expiresAtMsRaw > Date.now();
                }
                const expiresAt = row?.expiresAt as any;
                if (!expiresAt?.toMillis) return true;
                return expiresAt.toMillis() > Date.now();
              })
              .map((d) => String(d.id).trim().toLowerCase())
              .filter(Boolean);
            accessIds = Array.from(
              new Set([...accessIds, ...trainerLicenseBiomeIds.map((value) => String(value).trim().toLowerCase())])
            );
          } catch {
            // ignore
          }
        }

        const avail = BIOMES
          .filter((b) => !b.regionKeys?.length || !rk || b.regionKeys.includes(rk))
          .map((base) => {
            const remote = remoteBiomes.get(base.id);
            const unlockRules = remote?.unlockRules ?? null;
            const unlockedByRule = unlockRules
              ? evaluateUnlockRule(unlockRules, {
                teamMoves,
                partySpeciesIds,
                kmWalked,
                completedMissionIds,
                accessIds,
                biomeId: base.id,
              })
              : false;
            const unlocked = unlock.has(base.id)
              ? !!unlock.get(base.id)
              : unlockedByRule || !!base.unlockedByDefault;
            const requiresTicket = !!remote?.requiresTicket;
            const requiresTrainerLicense = !!remote?.requiresTrainerLicense;
            const ticketUnlocked = !requiresTicket || accessIds.includes(base.id);
            const licenseUnlocked = !requiresTrainerLicense || accessIds.includes(base.id);
            return {
              ...base,
              name: remote?.name || base.name,
              description: remote?.description || base.description,
              battleWeather: remote?.battleWeather || base.battleWeather || "none",
              battleAssets: remote?.battleAssets || undefined,
              battleScenarios: remote?.battleScenarios || [],
              unlockRules: unlockRules || undefined,
              npcs: remote?.npcs ?? [],
              requiresTicket,
              ticketProductCode: remote?.ticketProductCode || null,
              requiresTrainerLicense,
              trainerLicenseProductCode: remote?.trainerLicenseProductCode || null,
              unlocked: unlocked && ticketUnlocked && licenseUnlocked,
            };
          });

        if (!alive) return;
        setBiomes(avail);
        setSelectedBiomeId((prev) => {
          if (prev && avail.find((b) => b.id === prev)?.unlocked) return prev;
          return avail.find((b) => b.unlocked)?.id ?? avail[0]?.id ?? null;
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid, characterId, characterRegion, teamMoves, partySpeciesIds, refreshNonce]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshNonce((n) => n + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!gymMode || !gymData?.scenarioThemeId) {
      setGymScenario({ imageUrl: null, battleAssets: null, weather: "none" });
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const [scenarioSnap, remoteAssets] = await Promise.all([
          getDoc(doc(db, "scenarios", String(gymData.scenarioThemeId).trim().toLowerCase())),
          resolveScenarioAssetOverrides(String(gymData.scenarioThemeId)),
        ]);
        if (cancelled) return;
        const data = scenarioSnap.exists() ? (scenarioSnap.data() as Record<string, unknown>) : {};
        const climateWeather =
          String(data.specialType || "").trim().toLowerCase() === "climate"
            ? normalizeWeather(data.climateType || data.weather)
            : "none";
        setGymScenario({
          imageUrl: String(data.processedImageUrl || data.imageUrl || "").trim() || null,
          battleAssets: remoteAssets ? ({ ...remoteAssets } as BattleAssetSet) : null,
          weather: climateWeather,
        });
      } catch {
        if (!cancelled) {
          setGymScenario({ imageUrl: null, battleAssets: null, weather: "none" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gymMode, gymData?.scenarioThemeId]);

  useEffect(() => {
    if (gymMode || !selectedBiomeId) {
      setVisibleBiomeGyms([]);
      return;
    }
    let cancelled = false;
    getDocs(query(collection(db, "gyms"), where("biomeId", "==", selectedBiomeId)))
      .then((snap) => {
        if (cancelled) return;
        setVisibleBiomeGyms(
          snap.docs
            .map((row) => ({ id: row.id, ...(row.data() as Omit<PlayerGymDoc, "id">) }))
            .filter((row) => String(row.status || "").toLowerCase() !== "removed")
        );
      })
      .catch(() => {
        if (!cancelled) setVisibleBiomeGyms([]);
      });
    return () => {
      cancelled = true;
    };
  }, [gymMode, refreshNonce, selectedBiomeId]);

  const loadCandidates = async (biome: BiomeState): Promise<SpawnCandidate[]> => {
    if (gymMode && gymData?.gymType) {
      return buildGymCandidates(gymData.gymType, team);
    }
    const out = new Map<number, SpawnCandidate>();
    const docId = `${VERSION_ID}_${biome.id}`;
    try {
      const [indSnap, grpSnap] = await Promise.all([
        getDocs(collection(db, "biomeEncounterConfig", docId, "individual")),
        getDocs(collection(db, "biomeEncounterConfig", docId, "groups")),
      ]);
      grpSnap.forEach((d) => {
        const data = d.data() as any;
        const ids = Array.isArray(data?.speciesIds) ? data.speciesIds : [];
        const gMin = asPosInt(data?.config?.minLevel) ?? biome.minLevel;
        const gMax = asPosInt(data?.config?.maxLevel) ?? biome.maxLevel;
        ids.forEach((raw: any) => {
          const sid = asPosInt(raw);
          if (sid && !out.has(sid)) {
            out.set(sid, {
              speciesId: sid,
              min: Math.min(gMin, gMax),
              max: Math.max(gMin, gMax),
              encounterRate: null,
              captureLimit: null,
              capturedCount: 0,
              mode: "group",
            });
          }
        });
      });
      indSnap.forEach((d) => {
        const data = d.data() as any;
        const sid = asPosInt(data?.speciesId ?? d.id);
        if (!sid) return;
        const min = asPosInt(data?.minLevel) ?? biome.minLevel;
        const max = asPosInt(data?.maxLevel) ?? biome.maxLevel;
        const rate = Number.isFinite(Number(data?.encounterRate)) ? Math.max(0, Math.min(100, Number(data.encounterRate))) : null;
        const capRaw = data?.captureLimit;
        const captureLimit = capRaw == null ? null : Math.max(0, Math.trunc(Number(capRaw) || 0));
        const capturedCount = Math.max(0, Math.trunc(Number(data?.capturedCount || 0)));
        out.set(sid, {
          speciesId: sid,
          min: Math.min(min, max),
          max: Math.max(min, max),
          encounterRate: rate,
          captureLimit,
          capturedCount,
          mode: "individual",
          specialAbility: String(data?.specialAbility ?? "").trim(),
          specialNature: String(data?.specialNature ?? "").trim(),
          specialMoves: Array.isArray(data?.specialMoves) ? data.specialMoves.map((m: any) => String(m)).filter(Boolean).slice(0, 4) : [],
        });
      });
    } catch {
      // ignore
    }
    if (uid) {
      try {
        const releasedSnap = await getDocs(
          query(
            collection(db, "releasedPokemonPool"),
            where("biomeId", "==", biome.id),
            limit(20)
          )
        );
        releasedSnap.forEach((d) => {
          const data = d.data() as any;
          if (String(data?.status || "active") !== "active") return;
          const sid = asPosInt(data?.speciesId);
          if (!sid) return;
          const cooldown = Number(data?.releaseCooldownUntilMs || 0);
          if (cooldown > Date.now() && String(data?.sourceUid || "") === String(uid || "")) return;
          const expires = Number(data?.expiresAtMs || 0);
          if (expires > 0 && expires < Date.now()) return;
          out.set(sid * 100000 + Math.floor(Math.random() * 99999), {
            speciesId: sid,
            min: Math.max(1, asPosInt(data?.level) ?? biome.minLevel),
            max: Math.max(1, asPosInt(data?.level) ?? biome.maxLevel),
            encounterRate: 2,
            captureLimit: null,
            capturedCount: 0,
            mode: "released",
            specialMoves: Array.isArray(data?.moves) ? data.moves.map((m: any) => String(m)).filter(Boolean).slice(0, 4) : [],
            fixedLevel: Math.max(1, asPosInt(data?.level) ?? biome.minLevel),
            releasedDocId: d.id,
          });
        });
      } catch {
        // ignore released pool failures
      }
    }
    return out.size
      ? Array.from(out.values())
      : biome.speciesPool.map((sid) => ({
        speciesId: sid,
        min: biome.minLevel,
        max: biome.maxLevel,
        encounterRate: null,
        captureLimit: null,
        capturedCount: 0,
        mode: "fallback",
      }));
  };

  const rollEncounter = async () => {
    if (transitioning || battleVisible) return;
    if (!selectedArea || !selectedArea.unlocked) return;
    setExploreFeedback("");
    const cands = await loadCandidates(selectedArea);
    if (!cands.length) {
      setEncounter(null);
      setExploreFeedback(gymMode ? "Nenhum Pokemon compativel com o tipo do GYM foi encontrado." : "0 Pokemon na area.");
      return;
    }
    const extinctRisk =
      cands.length > 0 &&
      cands.every(
        (c) =>
          (c.captureLimit != null && c.captureLimit >= 0 && c.capturedCount >= c.captureLimit) ||
          encounterChanceForCandidate(c) <= 0
      );
    if (extinctRisk) {
      setEncounter(null);
      setExploreFeedback("Bioma com risco de extincao: nenhum Pokemon encontrado.");
      return;
    }
    const weights = cands.map((c) => Math.max(1, encounterChanceForCandidate(c)));
    const total = weights.reduce((a, b) => a + b, 0);
    let idx = 0;
    if (total > 0) {
      let r = Math.random() * total;
      for (let i = 0; i < cands.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          idx = i;
          break;
        }
      }
    } else idx = Math.floor(Math.random() * cands.length);
    const c = cands[idx];
    const encounterChance = encounterChanceForCandidate(c);
    if (Math.random() * 100 > encounterChance) {
      setEncounter(null);
      setExploreFeedback("Nenhum Pokemon encontrado.");
      try {
        await onExploreSteps?.(96);
      } catch {
        // ignore
      }
      return;
    }
    try {
      await onExploreSteps?.(128);
    } catch {
      // ignore steps update failures
    }
    const level = c.mode === "released" && Number(c.fixedLevel || 0) > 0 ? Number(c.fixedLevel) : randBetween(c.min, c.max);
    const abilities = speciesAbilities(c.speciesId);
    const ability = c.mode === "individual" && c.specialAbility ? c.specialAbility : (abilities[Math.floor(Math.random() * Math.max(1, abilities.length))] ?? "unknown-ability");
    const nature = c.mode === "individual" && c.specialNature ? c.specialNature : (NATURES[Math.floor(Math.random() * NATURES.length)] ?? "Docile");
    const moves = c.mode === "individual" && c.specialMoves?.length ? c.specialMoves : movesAtLevel(c.speciesId, level);
    const b = baseStats(c.speciesId);
    const real = b ? calcStats(level, b, nature, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }) : null;
    const hpTotal = Math.max(10, n(real?.hp || 20 + level * 2));
    const hpCurrent = hpTotal;
    const shinyChancePercent = Math.max(0, 0.1 + Number(trainerShinyBonusPercent || 0));
    const isShiny = Math.random() * 100 < shinyChancePercent;
    let finalAssets = selectedArea?.battleAssets || {};
    const scenarios = selectedArea?.battleScenarios || [];
    if (scenarios.length > 0) {
      const rndScen = scenarios[Math.floor(Math.random() * scenarios.length)];
      const sAssets = await resolveScenarioAssetOverrides(String(rndScen));
      if (sAssets) finalAssets = { ...finalAssets, ...sAssets };
    }

    setEncounter({
      speciesId: c.speciesId,
      speciesName: speciesName(c.speciesId),
      spriteUrl: speciesSprite(c.speciesId),
      isShiny,
      level,
      biomeId: selectedArea.id,
      biomeName: selectedArea.name,
      gender: Math.random() < 0.5 ? "M" : "F",
      abilityId: ability,
      nature,
      moves,
      hpCurrent,
      hpTotal,
      releasedDocId: c.releasedDocId,
      isReleased: c.mode === "released",
      battleAssets: finalAssets,
    });
    setExploreFeedback(
      c.mode === "released"
        ? "Pokemon abandonado detectado. Ele pode fugir com facilidade."
        : isShiny
          ? "Encontro brilhante detectado."
          : ""
    );
  };

  const startBattleScene = () => {
    if (!encounter) return;
    if (playerLeadIndex < 0) {
      Alert.alert("Batalha", "Voce precisa de um Pokemon vivo no time.");
      return;
    }
    setTransitioning(true);
    setDetailsOpen(false);
    Animated.sequence([
      Animated.timing(transition, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(130),
      Animated.timing(transition, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setTransitioning(false);
      setBattleVisible(true);
    });
  };

  if (loading) return <View style={styles.wrap}><ActivityIndicator color={COLORS.white} /></View>;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{gymMode ? "Modo GYM" : "Explorar"}</Text>
      <View style={styles.refreshRow}>
        <Pressable style={styles.refreshBtn} onPress={() => setRefreshNonce((n) => n + 1)}>
          <Text style={styles.refreshBtnText}>{gymMode ? "Atualizar ambiente do GYM" : "Atualizar Bioma/NPC"}</Text>
        </Pressable>
      </View>
      {!gymMode ? (
        <ScrollView horizontal contentContainerStyle={styles.row}>
          {biomes.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => !battleVisible && !transitioning && setSelectedBiomeId(b.id)}
              style={[styles.chip, b.id === selectedBiomeId && styles.chipActive, !b.unlocked && styles.chipLocked]}
            >
              <Text style={styles.chipText}>{b.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.centerCard}>
          <Text style={styles.centerTitle}>{gymData?.name || "GYM"}</Text>
          <Text style={styles.centerMeta}>Ambiente ativo do tipo {String(gymData?.gymType || "").toUpperCase()}</Text>
        </View>
      )}

      {selectedArea ? (
        <ImageBackground
          source={
            gymMode && gymScenario.imageUrl
              ? { uri: gymScenario.imageUrl }
              : BIOME_IMAGE_BY_ID[selectedArea.id] || BIOME_IMAGE_BY_ID["floresta-esmeralda"]
          }
          style={styles.biomeImage}
          imageStyle={styles.biomeImageInner}
        >
          <View style={styles.biomeOverlay} />
          <View style={styles.biomeLabelWrap}><Text style={styles.biomeLabel}>{selectedArea.name}</Text></View>
        </ImageBackground>
      ) : null}

      {!gymMode && selectedArea && visibleBiomeGyms.length > 0 ? (
        <View style={styles.npcSection}>
          <Text style={styles.npcSectionTitle}>GYMs visiveis neste bioma</Text>
          <ScrollView horizontal contentContainerStyle={styles.npcRow} showsHorizontalScrollIndicator={false}>
            {visibleBiomeGyms.map((gym) => (
              <Pressable
                key={gym.id}
                style={styles.npcCard}
                onPress={() =>
                  router.push({
                    pathname: "/gym",
                    params: {
                      characterId: characterId || "",
                      biomeId: selectedArea.id,
                      targetGymId: gym.id,
                    },
                  })
                }
              >
                {gym.primaryBadgeImageUrl ? <Image source={{ uri: gym.primaryBadgeImageUrl }} style={styles.npcAvatar} /> : null}
                <Text style={styles.npcName} numberOfLines={1}>{gym.name || gym.ownerCharacterName || "GYM"}</Text>
                <Text style={styles.npcRole} numberOfLines={2}>
                  {String(gym.gymType || "").toUpperCase()} • {gym.primaryBadgeName || "Insignia"}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <Pressable style={styles.cta} disabled={!selectedArea || !selectedArea.unlocked || battleVisible || transitioning} onPress={rollEncounter}>
        <Text style={styles.ctaText}>{gymMode ? "Explorar GYM" : "Explorar bioma"}</Text>
      </Pressable>
      {!!exploreFeedback ? <Text style={styles.exploreFeedback}>{exploreFeedback}</Text> : null}

      {selectedArea?.npcs?.length ? (
        <View style={styles.npcSection}>
          <Text style={styles.npcSectionTitle}>{gymMode ? "NPCs do GYM" : "NPCs do Bioma"}</Text>
          <ScrollView horizontal contentContainerStyle={styles.npcRow} showsHorizontalScrollIndicator={false}>
            {selectedArea.npcs.map((npc) => (
              <Pressable
                key={npc.id}
                style={styles.npcCard}
                disabled={battleVisible || transitioning || healing}
                onPress={() => onPressNpc(npc)}
              >
                {npc.imageUrl ? (
                  <Image source={{ uri: npc.imageUrl }} style={styles.npcAvatar} />
                ) : (
                  <View style={styles.npcAvatarFallback}>
                    <Text style={styles.npcAvatarFallbackText}>{npc.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.npcName} numberOfLines={1}>{npc.name}</Text>
                <Text style={styles.npcRole} numberOfLines={1}>
                  {npcRoleLabel(npc.role)}
                  {npc.role === "specialist" && npc.specialistType ? ` • ${npc.specialistType}` : ""}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.centerCard}>
          <Text style={styles.centerTitle}>{gymMode ? "Modo GYM" : "NPCs"}</Text>
          <Text style={styles.centerMeta}>
            {gymMode
              ? "Somente Pokemon compativeis com o tipo principal do GYM podem aparecer aqui."
              : "Este bioma ainda nao possui NPCs configurados no admin."}
          </Text>
        </View>
      )}

      {encounter ? (
        <Pressable onPress={() => setDetailsOpen(true)} style={styles.card} disabled={battleVisible || transitioning}>
          <LinearGradient colors={["rgba(16,185,129,0.20)", "rgba(255,255,255,0.05)"]} style={styles.card}>
            <Text style={styles.name}>{encounter.speciesName}</Text>
            <Text style={styles.meta}>Lv {encounter.level} • {encounter.biomeName}</Text>
            {encounter.spriteUrl ? <Image source={{ uri: encounter.spriteUrl }} style={styles.sprite} resizeMode="contain" /> : null}
          </LinearGradient>
        </Pressable>
      ) : null}

      <Modal visible={detailsOpen && !!encounter} transparent animationType="fade" onRequestClose={() => setDetailsOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.title}>Pokemon Selvagem</Text>
            {encounter?.spriteUrl ? <Image source={{ uri: encounter.spriteUrl }} style={styles.modalSprite} resizeMode="contain" /> : null}
            <Text style={styles.meta}>Nome: {encounter?.speciesName}</Text>
            <Text style={styles.meta}>Nv: {encounter?.level}</Text>
            <Text style={styles.meta}>Genero: {encounter?.gender === "M" ? "Macho" : "Femea"}</Text>
            <Text style={styles.meta}>Habilidade: {encounter?.abilityId}</Text>
            <Text style={styles.meta}>Natureza: {encounter?.nature}</Text>
            <View style={styles.actions}>
              <Pressable style={styles.btnPrimary} onPress={startBattleScene}><Text style={styles.btnText}>Batalhar</Text></Pressable>
              <Pressable style={styles.btn} onPress={() => setDetailsOpen(false)}><Text style={styles.btnText}>Fechar</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Animated.View pointerEvents="none" style={[styles.transition, { opacity: transition }]} />

      <BattleScene
        visible={battleVisible && !!encounter && playerLeadIndex >= 0}
        mode="wild"
        backgroundKind={gymMode ? pickGymBattleBackground(String(gymData?.gymType || "")) : biomeToBattleBackground(encounter?.biomeId)}
        battleAssets={encounter?.battleAssets || null}
        initialFieldState={{
          weather: gymMode ? gymScenario.weather : normalizeWeather(selectedBiome?.battleWeather || "none"),
          weatherTurns: gymMode && gymScenario.weather !== "none" ? 999 : 5,
        }}
        playerTeam={playerBattleTeam}
        enemyTeam={enemyBattleTeam}
        initialPlayerIndex={Math.max(0, playerLeadIndex)}
        initialEnemyIndex={0}
        balls={pokeballs}
        canRun
        canUseBag
        typeMultiplier={getTypeMultiplier}
        onTryCapture={async (ballId, enemy) => {
          if (!onTryCapture || !encounter) return { ok: false, message: "Captura indisponivel." };
          if (encounter.isReleased) {
            const fleeRoll = Math.random();
            if (fleeRoll < 0.58) {
              setBattleVisible(false);
              setEncounter(null);
              return { ok: false, message: "Pokemon abandonado fugiu rapidamente!" };
            }
            if (Math.random() < 0.72) {
              return { ok: false, message: "Ele esta assustado e recusou a captura." };
            }
          }
          const out = await onTryCapture({
            ballId,
            encounter: {
              speciesId: enemy.speciesId,
              speciesName: enemy.name,
              level: enemy.level,
              hpCurrent: Math.max(1, enemy.hpCurrent),
              hpTotal: Math.max(1, enemy.hpTotal),
              biomeId: encounter.biomeId,
              moves: encounter.moves,
              isShiny: encounter.isShiny,
            },
          });
          if (out.ok) {
            if (encounter?.releasedDocId) {
              setDoc(
                doc(db, "releasedPokemonPool", encounter.releasedDocId),
                {
                  status: "captured",
                  capturedAtMs: Date.now(),
                },
                { merge: true }
              ).catch(() => undefined);
            }
            setEncounter(null);
          }
          return out;
        }}
        onPlayerHpSync={onLeadHpChanged}
        onFinish={async ({ result, playerTeam, enemyTeam, participants }) => {
          const syncPayload = playerTeam
            .filter((m) => m.slotIndex != null)
            .map((m) => ({
              slotIndex: Number(m.slotIndex),
              hpCurrent: Math.max(0, Number(m.hpCurrent || 0)),
              hpTotal: Math.max(1, Number(m.hpTotal || 1)),
            }));
          if (syncPayload.length) {
            await onBattleTeamSync?.(syncPayload);
          }

          const enemy = enemyTeam[0];
          if (result === "victory" && encounter && enemy && enemy.hpCurrent <= 0) {
            await onWildDefeated?.({
              speciesId: encounter.speciesId,
              level: encounter.level,
              slotIndices: participants.length ? participants : [Math.max(1, playerLeadIndex + 1)],
            });
            setEncounter(null);
          }
          if (result === "ran" || result === "defeat") {
            setEncounter(null);
          }
        }}
        onClose={() => {
          setBattleVisible(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", padding: 12, gap: 10 },
  title: { color: COLORS.white, fontWeight: "900", fontSize: 16 },
  refreshRow: { alignItems: "flex-start" },
  refreshBtn: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  refreshBtnText: { color: COLORS.white, fontWeight: "800", fontSize: 11 },
  row: { gap: 8, paddingRight: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: "rgba(59,130,246,0.24)", borderColor: "rgba(59,130,246,0.70)" },
  chipLocked: { opacity: 0.5 },
  chipText: { color: COLORS.white, fontWeight: "800", fontSize: 12 },
  biomeImage: { height: 132, borderRadius: 12, overflow: "hidden" },
  biomeImageInner: { borderRadius: 12 },
  biomeOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.30)" },
  biomeLabelWrap: { position: "absolute", left: 10, right: 10, bottom: 8 },
  biomeLabel: { color: COLORS.white, fontWeight: "900", fontSize: 14 },
  cta: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(59,130,246,0.55)", backgroundColor: "rgba(59,130,246,0.16)", alignItems: "center", paddingVertical: 10 },
  ctaText: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  exploreFeedback: { color: "rgba(255,255,255,0.82)", fontWeight: "800", fontSize: 12, textAlign: "center" },
  centerCard: {
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    gap: 6,
  },
  centerTitle: { color: COLORS.white, fontWeight: "900", fontSize: 14 },
  centerMeta: { color: "rgba(255,255,255,0.78)", fontWeight: "700", fontSize: 12 },
  npcSection: {
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    gap: 8,
  },
  npcSectionTitle: { color: COLORS.white, fontWeight: "900", fontSize: 14 },
  npcRow: { gap: 8, paddingRight: 8 },
  npcCard: {
    width: 120,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.8)",
    alignItems: "center",
    gap: 4,
  },
  npcAvatar: { width: 64, height: 64, borderRadius: 10 },
  npcAvatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  npcAvatarFallbackText: { color: COLORS.white, fontWeight: "900", fontSize: 20 },
  npcName: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  npcRole: { color: "rgba(255,255,255,0.72)", fontWeight: "700", fontSize: 10, textTransform: "capitalize" },
  centerBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.70)",
    backgroundColor: "rgba(16,185,129,0.22)",
  },
  centerBtnDisabled: { opacity: 0.5 },
  centerBtnText: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  card: { borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  name: { color: COLORS.white, fontWeight: "900", fontSize: 15 },
  meta: { color: "rgba(255,255,255,0.82)", fontWeight: "700", fontSize: 12 },
  sprite: { width: 90, height: 90, alignSelf: "center", marginTop: 8 },
  modalSprite: { width: 110, height: 110, alignSelf: "center", borderRadius: 12, marginBottom: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { width: "100%", borderRadius: 16, padding: 12, backgroundColor: "rgba(15,23,42,0.98)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", gap: 8 },
  actions: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(255,255,255,0.08)" },
  btnPrimary: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(16,185,129,0.7)", backgroundColor: "rgba(16,185,129,0.22)" },
  btnText: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  transition: { ...StyleSheet.absoluteFillObject, backgroundColor: "#fff" },
});
