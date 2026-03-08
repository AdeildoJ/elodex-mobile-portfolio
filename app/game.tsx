// app/game.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Monitor } from "lucide-react-native";
import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  writeBatch,
  serverTimestamp,
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

import { db } from "../src/services/firebase/firebaseConfig";
import { registerBiomeCapture } from "../src/services/firebase/biome-capture.service";
import { COLORS } from "../src/theme/colors";

// ✅ UI componentizada (Game)
import { GameMenu } from "../src/components/game/Menu";
import { Mochila } from "../src/components/game/Mochila";
import { Explorar } from "../src/components/game/Explorar";
import { Batalhas } from "../src/components/game/Batalhas";
import { Eventos } from "../src/components/game/Eventos";
import { Loja } from "../src/components/game/Loja";
import { LearnMoveModal } from "../src/components/game/LearnMoveModal";
import { EggsPanel } from "../src/components/game/EggsPanel";
import { Box } from "../src/components/box/box";
import type {
  ActionResult,
  BagTabKey,
  GameActionKey,
  InventoryEntry,
  ItemEffectType,
  TeamPokemonUI,
  WildEncounter,
} from "../src/components/game/types";

// ✅ Catálogos fixos SEMPRE em JSON local
import pokemonSpecies from "../src/data/pokemon/pokemonSpecies.json";
import pokemonForms from "../src/data/pokemon/pokemonForms.json";
import pokemonMovesCatalog from "../src/data/pokemon/moves.json";
import {
  applyLearnMoves,
  getDefaultMovesForLevel,
  getMachineMovesForSpecies,
  getEggMovesForSpecies,
  getTutorMovesForSpecies,
  listLevelUpMovesInRange,
  resolvePendingDecision,
} from "../src/components/game/logic/move-learning.service";
import { applyEggSteps, buildEggDocFromParents } from "../src/components/game/logic/egg.service";
import { evaluateUnlockRule } from "../src/explore/biomeUnlock";
import { applyFriendshipEvent, FRIENDSHIP_DEFAULT } from "../src/components/game/logic/friendship.service";
import { resolveEvolutionTarget } from "../src/components/game/logic/evolution.service";

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

  pokeCoins?: number;
  pvpWins?: number;
  pvpLosses?: number;

  createdAt?: any;
  updatedAt?: any;
};

type PlayerDoc = {
  playerType?: "VIP" | "FREE";
};

type TeamPokemonDoc = {
  slotIndex: number;
  speciesId: number;
  speciesName: string;

  nickname?: string;
  level: number;
  nature?: string;
  gender?: "M" | "F" | "U" | "—";
  abilityId?: string;

  exp?: { current: number; toNext: number };
  hp?: { current: number; total: number };

  ivs?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  evs?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };

  moves?: string[];
  moveHistory?: string[];
  relearnableMoves?: string[];
  pendingLearnMove?: string | null;
  learnsetConstraints?: {
    maxGeneration?: number | null;
    blockedSources?: string[];
  } | null;
  isStarter?: boolean;

  // ✅ controla edição única de nickname
  nicknameEdited?: boolean;

  // ✅ stats persistidos (atk/def/spa/spd/spe). HP fica em hp.total
  stats?: { atk: number; def: number; spa: number; spd: number; spe: number };
  friendship?: number;
  traumaLevel?: number;
  isAbandoned?: boolean;
  originalTrainerUid?: string | null;
  rescuedByUid?: string | null;
  traumaRecovered?: boolean;
  bondBuff?: boolean;
  abandonedAt?: any;
  releasedBiomeId?: string | null;
  releaseCooldownUntilMs?: number | null;

  createdAt?: any;
  updatedAt?: any;
};

type BoxPokemonDoc = Omit<TeamPokemonDoc, "slotIndex"> & { slotIndex?: number };

type InventoryDoc = {
  id: string;
  kind: "ITEM" | "POKEBALL";
  name: string;
  description: string;
  quantity: number;
  effectType?: ItemEffectType;
  healAmount?: number;
  revivePercent?: number;
  levelGain?: number;
  moveId?: string;
  consumable?: boolean;
  captureBonus?: number;
  isMasterBall?: boolean;
  updatedAt?: any;
};

type EggDoc = {
  id: string;
  speciesId: number;
  speciesName: string;
  stepsRequired: number;
  stepsProgress: number;
  inheritedEggMoves: string[];
  status: "incubating" | "ready" | "hatched";
  source?: "daycare" | "manual";
  hatchMode?: "steps" | "time";
  readyAtMs?: number | null;
  requiresIncubator?: boolean;
  incubatorAssignedAt?: any;
  createdAt?: any;
  updatedAt?: any;
};

type DaycareStateDoc = {
  active: boolean;
  parentSlotA: number | null;
  parentSlotB: number | null;
  stepsSinceLastEgg: number;
  eggStepThreshold: number;
  eggsGenerated: number;
  daycareTier?: "FREE" | "VIP";
  eggHatchDays?: number;
  lastEggAt?: any;
  updatedAt?: any;
};

const BAG_LIMIT_BY_PLAYER: Record<"FREE" | "VIP", number> = {
  FREE: 20,
  VIP: 50,
};
const CAPTURE_CONFIG_VERSION_ID = "elodex-base";
const MOVE_TUTOR_COST_COINS = 1200;
const MOVE_TUTOR_ITEM_ID = "heart-scale";
const EGG_INCUBATOR_ITEM_ID = "egg-incubator";
const DAYCARE_PROFILE_BY_TIER: Record<"FREE" | "VIP", { eggHatchDays: number; eggStepThreshold: number }> = {
  FREE: { eggHatchDays: 3, eggStepThreshold: 1024 },
  VIP: { eggHatchDays: 1, eggStepThreshold: 768 },
};

const DEFAULT_ITEMS: InventoryDoc[] = [
  {
    id: "potion",
    kind: "ITEM",
    name: "Potion",
    description: "Recupera 20 HP de um Pokemon que nao esteja nocauteado.",
    quantity: 3,
    effectType: "HEAL",
    healAmount: 20,
  },
  {
    id: "super-potion",
    kind: "ITEM",
    name: "Super Potion",
    description: "Recupera 60 HP de um Pokemon que nao esteja nocauteado.",
    quantity: 2,
    effectType: "HEAL",
    healAmount: 60,
  },
  {
    id: "revive",
    kind: "ITEM",
    name: "Revive",
    description: "Revive um Pokemon nocauteado com metade do HP total.",
    quantity: 1,
    effectType: "REVIVE",
    revivePercent: 50,
  },
  {
    id: "rare-candy",
    kind: "ITEM",
    name: "Rare Candy",
    description: "Aumenta 1 nivel do Pokemon alvo e recalcula seus atributos.",
    quantity: 1,
    effectType: "LEVEL_UP",
    levelGain: 1,
  },
];

const DEFAULT_POKEBALLS: InventoryDoc[] = [
  {
    id: "poke-ball",
    kind: "POKEBALL",
    name: "Poke Ball",
    description: "Pokebola padrao para capturas comuns.",
    quantity: 10,
    captureBonus: 1,
  },
  {
    id: "great-ball",
    kind: "POKEBALL",
    name: "Great Ball",
    description: "Maior taxa de captura do que a Poke Ball.",
    quantity: 5,
    captureBonus: 1.5,
  },
  {
    id: "ultra-ball",
    kind: "POKEBALL",
    name: "Ultra Ball",
    description: "Alta taxa de captura para Pokemon mais resistentes.",
    quantity: 2,
    captureBonus: 2,
  },
  {
    id: "master-ball",
    kind: "POKEBALL",
    name: "Master Ball",
    description: "Captura garantida em qualquer encontro.",
    quantity: 1,
    captureBonus: 255,
    isMasterBall: true,
  },
];


// ---------------------------
// ✅ Sprite resolver (JSON local)
// ---------------------------
function resolveSpriteFromSpecies(speciesId: number): string | null {
  try {
    const list = Array.isArray(pokemonSpecies)
      ? (pokemonSpecies as any[])
      : Object.values(pokemonSpecies as any);

    const found =
      list.find((p) => Number(p?.id) === Number(speciesId)) ||
      list.find((p) => Number(p?.speciesId) === Number(speciesId));

    if (found) {
      const url =
        found.sprite ||
        found.image ||
        found.img ||
        found.artwork ||
        found.sprites?.default ||
        found.sprites?.home ||
        found.sprites?.official ||
        found.sprites?.officialArtwork ||
        found.sprites?.front_default ||
        null;

      // se vier nested object, tenta pegar "default"
      if (typeof url === "object" && url?.default) return String(url.default);

      if (typeof url === "string" && url.length > 0) return url;
    }
  } catch {
    // ignore
  }

  return null;
}

function resolveSpriteFromForms(speciesId: number): string | null {
  try {
    const formsDict = pokemonForms as any;
    const entries: any[] = Array.isArray(formsDict) ? formsDict : Object.values(formsDict);

    const sid = String(speciesId);

    const found =
      entries.find((f) => String(f?.baseSpeciesId) === sid && f?.sprites?.default) ||
      entries.find((f) => String(f?.baseSpeciesId) === sid && f?.sprites?.home) ||
      entries.find((f) => String(f?.baseSpeciesId) === sid && f?.sprites?.official) ||
      entries.find((f) => String(f?.baseSpeciesId) === sid && f?.sprites) ||
      null;

    const url =
      found?.sprites?.default ||
      found?.sprites?.home ||
      found?.sprites?.official ||
      found?.sprites?.front_default ||
      null;

    if (typeof url === "object" && url?.default) return String(url.default);
    if (typeof url === "string" && url.length > 0) return url;
  } catch {
    // ignore
  }

  return null;
}

function resolveSpriteFallback(speciesId: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${speciesId}.png`;
}

function getPokemonSpriteUrl(speciesId: number): string | null {
  if (!speciesId || speciesId <= 0) return null;

  const fromSpecies = resolveSpriteFromSpecies(speciesId);
  if (fromSpecies) return fromSpecies;

  const fromForms = resolveSpriteFromForms(speciesId);
  if (fromForms) return fromForms;

  return resolveSpriteFallback(speciesId);
}

/* ===================== STATUS REAL (oficial) ===================== */
type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

const NATURE_EFFECTS: Record<string, { up?: StatKey; down?: StatKey }> = {
  Hardy: {},
  Lonely: { up: "atk", down: "def" },
  Brave: { up: "atk", down: "spe" },
  Adamant: { up: "atk", down: "spa" },
  Naughty: { up: "atk", down: "spd" },

  Bold: { up: "def", down: "atk" },
  Docile: {},
  Relaxed: { up: "def", down: "spe" },
  Impish: { up: "def", down: "spa" },
  Lax: { up: "def", down: "spd" },

  Timid: { up: "spe", down: "atk" },
  Hasty: { up: "spe", down: "def" },
  Serious: {},
  Jolly: { up: "spe", down: "spa" },
  Naive: { up: "spe", down: "spd" },

  Modest: { up: "spa", down: "atk" },
  Mild: { up: "spa", down: "def" },
  Quiet: { up: "spa", down: "spe" },
  Bashful: {},
  Rash: { up: "spa", down: "spd" },

  Calm: { up: "spd", down: "atk" },
  Gentle: { up: "spd", down: "def" },
  Sassy: { up: "spd", down: "spe" },
  Careful: { up: "spd", down: "spa" },
  Quirky: {},
};

function natureMultiplier(natureName: string | undefined, stat: StatKey) {
  const n = natureName || "Docile";
  const fx = NATURE_EFFECTS[n] || {};
  if (fx.up === stat) return 1.1;
  if (fx.down === stat) return 0.9;
  return 1.0;
}

function resolveBaseStats(speciesId: number): Record<StatKey, number> | null {
  const list = Array.isArray(pokemonSpecies)
    ? (pokemonSpecies as any[])
    : Object.values(pokemonSpecies as any);

  const found =
    list.find((p) => Number(p?.id) === Number(speciesId)) ||
    list.find((p) => Number(p?.speciesId) === Number(speciesId));

  if (!found) return null;

  if (found.baseStats) {
    return {
      hp: Number(found.baseStats.hp ?? 0),
      atk: Number(found.baseStats.atk ?? 0),
      def: Number(found.baseStats.def ?? 0),
      spa: Number(found.baseStats.spa ?? 0),
      spd: Number(found.baseStats.spd ?? 0),
      spe: Number(found.baseStats.spe ?? 0),
    };
  }

  if (found.stats) {
    const s = found.stats;
    return {
      hp: Number(s.hp ?? 0),
      atk: Number(s.atk ?? s.attack ?? 0),
      def: Number(s.def ?? s.defense ?? 0),
      spa: Number(s.spa ?? s.specialAttack ?? 0),
      spd: Number(s.spd ?? s.specialDefense ?? 0),
      spe: Number(s.spe ?? s.speed ?? 0),
    };
  }

  return null;
}

function normalizeEVs(evs?: Partial<Record<StatKey, number>>) {
  return {
    hp: Math.max(0, Math.floor(Number(evs?.hp ?? 0))),
    atk: Math.max(0, Math.floor(Number(evs?.atk ?? 0))),
    def: Math.max(0, Math.floor(Number(evs?.def ?? 0))),
    spa: Math.max(0, Math.floor(Number(evs?.spa ?? 0))),
    spd: Math.max(0, Math.floor(Number(evs?.spd ?? 0))),
    spe: Math.max(0, Math.floor(Number(evs?.spe ?? 0))),
  };
}

function totalEVs(evs: Record<StatKey, number>) {
  return evs.hp + evs.atk + evs.def + evs.spa + evs.spd + evs.spe;
}

function resolveEvYieldForSpecies(speciesId: number): Partial<Record<StatKey, number>> {
  const base = resolveBaseStats(speciesId);
  if (!base) return { hp: 1 };
  const order: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];
  let best: StatKey = "hp";
  let bestVal = -1;
  for (const s of order) {
    const v = Math.max(0, Number(base[s] ?? 0));
    if (v > bestVal) {
      bestVal = v;
      best = s;
    }
  }
  return { [best]: 1 };
}

const evYieldCache = new Map<number, Partial<Record<StatKey, number>>>();

function statKeyFromPokeApi(name: string): StatKey | null {
  const n = String(name || "").toLowerCase();
  if (n === "hp") return "hp";
  if (n === "attack") return "atk";
  if (n === "defense") return "def";
  if (n === "special-attack") return "spa";
  if (n === "special-defense") return "spd";
  if (n === "speed") return "spe";
  return null;
}

async function resolveEvYieldOfficialOrFallback(speciesId: number): Promise<Partial<Record<StatKey, number>>> {
  const sid = Math.max(1, Math.trunc(Number(speciesId || 1)));
  if (evYieldCache.has(sid)) return evYieldCache.get(sid)!;

  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${sid}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`pokeapi ${res.status}`);
    const data: any = await res.json();
    const out: Partial<Record<StatKey, number>> = {};
    if (Array.isArray(data?.stats)) {
      for (const s of data.stats) {
        const key = statKeyFromPokeApi(String(s?.stat?.name || ""));
        const effort = Math.max(0, Math.floor(Number(s?.effort ?? 0)));
        if (key && effort > 0) out[key] = effort;
      }
    }
    const finalMap = Object.keys(out).length ? out : resolveEvYieldForSpecies(sid);
    evYieldCache.set(sid, finalMap);
    return finalMap;
  } catch {
    const fallback = resolveEvYieldForSpecies(sid);
    evYieldCache.set(sid, fallback);
    return fallback;
  }
}

function addEVYieldWithCaps(
  current: Partial<Record<StatKey, number>> | undefined,
  yieldMap: Partial<Record<StatKey, number>>
) {
  const out = normalizeEVs(current);
  for (const stat of ["hp", "atk", "def", "spa", "spd", "spe"] as StatKey[]) {
    const gainRaw = Math.max(0, Math.floor(Number(yieldMap[stat] ?? 0)));
    if (!gainRaw) continue;
    const remainingTotal = Math.max(0, 510 - totalEVs(out));
    if (!remainingTotal) break;
    const remainingStat = Math.max(0, 252 - out[stat]);
    if (!remainingStat) continue;
    const applied = Math.min(gainRaw, remainingTotal, remainingStat);
    out[stat] += applied;
  }
  return out;
}

function calcRealStats(args: {
  level: number;
  nature?: string;
  base: Record<StatKey, number>;
  ivs?: Partial<Record<StatKey, number>>;
  evs?: Partial<Record<StatKey, number>>;
}) {
  const level = Math.max(1, Number(args.level || 1));
  const ivs = args.ivs || {};
  const evs = args.evs || {};

  function iv(stat: StatKey) {
    return Math.max(0, Number(ivs[stat] ?? 0));
  }
  function ev(stat: StatKey) {
    return Math.max(0, Number(evs[stat] ?? 0));
  }

  const base = args.base;

  const hp =
    Math.floor(((2 * base.hp + iv("hp") + Math.floor(ev("hp") / 4)) * level) / 100) +
    level +
    10;

  const other = (stat: Exclude<StatKey, "hp">) => {
    const raw =
      Math.floor(((2 * base[stat] + iv(stat) + Math.floor(ev(stat) / 4)) * level) / 100) +
      5;
    return Math.floor(raw * natureMultiplier(args.nature, stat));
  };

  return {
    hp,
    atk: other("atk"),
    def: other("def"),
    spa: other("spa"),
    spd: other("spd"),
    spe: other("spe"),
  };
}

/* ===================== MOVES (máx 4) ===================== */
function resolveMovesForSpeciesAtLevel(speciesId: number, level: number): string[] {
  const learned = (getDefaultMovesForLevel(speciesId, level) || [])
    .map((m) => String(m || "").trim().toLowerCase())
    .filter(Boolean);
  return ensureMinMoveSet(speciesId, level, learned, 1);
}

function ensureMinMoveSet(speciesId: number, level: number, moves: string[], minCount: number): string[] {
  const out: string[] = [];
  const push = (mv: string) => {
    const moveId = String(mv || "").trim().toLowerCase();
    if (!moveId) return;
    if (out.includes(moveId)) return;
    if (out.length >= 4) return;
    out.push(moveId);
  };

  (moves || []).forEach(push);
  (getDefaultMovesForLevel(speciesId, Math.max(1, Number(level || 1))) || []).forEach(push);
  (getDefaultMovesForLevel(speciesId, 100) || []).forEach(push);
  ["tackle", "quick-attack", "pound", "scratch", "gust"].forEach(push);

  const target = Math.max(1, Math.min(4, Math.trunc(Number(minCount || 1))));
  while (out.length < target) push("tackle");
  return out.slice(0, 4);
}

// ---------------------------
// ✅ Species helpers (JSON local)
// ---------------------------
function getSpeciesEntry(speciesId: number): any | null {
  try {
    const list = Array.isArray(pokemonSpecies)
      ? (pokemonSpecies as any[])
      : Object.values(pokemonSpecies as any);
    return (
      list.find((p) => Number(p?.id) === Number(speciesId)) ||
      list.find((p) => Number(p?.speciesId) === Number(speciesId)) ||
      null
    );
  } catch {
    return null;
  }
}

function getSpeciesName(speciesId: number): string {
  const e = getSpeciesEntry(speciesId);
  return String(e?.name || e?.speciesName || e?.species || "").trim() || `#${speciesId}`;
}

function getSpeciesAbilities(speciesId: number): string[] {
  const e = getSpeciesEntry(speciesId);
  const abilitiesRaw = e?.abilities;
  // formatos aceitos: ["rough-skin", ...] OU [{abilityId:"...", slot:1}, ...]
  if (Array.isArray(abilitiesRaw)) {
    const ids = abilitiesRaw
      .map((a: any) => a?.abilityId ?? a?.id ?? a?.name ?? a)
      .filter(Boolean)
      .map((x: any) => String(x));
    // remove duplicados mantendo ordem
    return Array.from(new Set(ids));
  }
  return [];
}

function getMoveType(moveId: string): string | null {
  const key = String(moveId || "").trim().toLowerCase();
  if (!key) return null;
  const row = (pokemonMovesCatalog as Record<string, { type?: string }>)[key];
  const tp = String(row?.type || "").trim().toLowerCase();
  return tp || null;
}

function getSpeciesEggGroups(speciesId: number): string[] {
  const e = getSpeciesEntry(speciesId);
  const groupsRaw = Array.isArray(e?.eggGroups) ? e.eggGroups : [];
  return groupsRaw
    .map((g: any) => String(g || "").trim().toLowerCase())
    .filter(Boolean);
}

function isDittoSpecies(speciesId: number): boolean {
  return Math.max(1, Number(speciesId || 1)) === 132;
}

function normalizeMonGender(value: unknown): "M" | "F" | "U" {
  const g = String(value || "").toUpperCase();
  if (g === "M") return "M";
  if (g === "F") return "F";
  return "U";
}

function resolveBreedingChildSpeciesId(a: TeamPokemonDoc, b: TeamPokemonDoc): number | null {
  const aSpeciesId = Math.max(1, Number(a.speciesId || 1));
  const bSpeciesId = Math.max(1, Number(b.speciesId || 1));
  const aDitto = isDittoSpecies(aSpeciesId);
  const bDitto = isDittoSpecies(bSpeciesId);
  if (aDitto && bDitto) return null;
  if (aDitto && !bDitto) return bSpeciesId;
  if (!aDitto && bDitto) return aSpeciesId;

  const aGender = normalizeMonGender(a.gender);
  const bGender = normalizeMonGender(b.gender);
  if (aGender === "U" || bGender === "U") return null;
  if (aGender === bGender) return null;

  if (aGender === "F") return aSpeciesId;
  return bSpeciesId;
}

function areBreedingCompatible(a: TeamPokemonDoc, b: TeamPokemonDoc): boolean {
  const aSpeciesId = Math.max(1, Number(a.speciesId || 1));
  const bSpeciesId = Math.max(1, Number(b.speciesId || 1));
  const child = resolveBreedingChildSpeciesId(a, b);
  if (!child) return false;

  const aGroups = getSpeciesEggGroups(aSpeciesId);
  const bGroups = getSpeciesEggGroups(bSpeciesId);
  if (!aGroups.length || !bGroups.length) return false;
  if (aGroups.includes("undiscovered") || bGroups.includes("undiscovered")) return false;

  if (isDittoSpecies(aSpeciesId) || isDittoSpecies(bSpeciesId)) return true;
  return aGroups.some((g) => bGroups.includes(g));
}

function computeDaycareEggChance(a: TeamPokemonDoc, b: TeamPokemonDoc): number {
  const aSpecies = Math.max(1, Number(a.speciesId || 1));
  const bSpecies = Math.max(1, Number(b.speciesId || 1));
  const sameSpecies = aSpecies === bSpecies;
  const hasDitto = isDittoSpecies(aSpecies) || isDittoSpecies(bSpecies);
  if (sameSpecies && !hasDitto) return 0.35;
  if (hasDitto) return 0.25;
  return 0.2;
}

function getSpeciesHatchSteps(speciesId: number): number {
  const e = getSpeciesEntry(speciesId);
  const raw =
    e?.incubation?.stepsToHatch ??
    e?.incubation?.steps ??
    e?.hatchSteps ??
    e?.eggCycles ??
    null;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  return 5120;
}

function resolveDaycareTier(playerTier: "FREE" | "VIP", rawDaycareTier?: unknown): "FREE" | "VIP" {
  if (rawDaycareTier === "FREE") return "FREE";
  if (rawDaycareTier === "VIP" && playerTier === "VIP") return "VIP";
  return playerTier === "VIP" ? "VIP" : "FREE";
}

function getDaycareProfile(playerTier: "FREE" | "VIP", rawDaycareTier?: unknown) {
  const tier = resolveDaycareTier(playerTier, rawDaycareTier);
  return { tier, ...DAYCARE_PROFILE_BY_TIER[tier] };
}

function slugifyText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getAbilitySlotIndex(speciesId: number, abilityId: string): number {
  const e = getSpeciesEntry(speciesId);
  const abilitiesRaw = e?.abilities;
  if (!Array.isArray(abilitiesRaw)) return -1;
  for (let i = 0; i < abilitiesRaw.length; i++) {
    const a = abilitiesRaw[i];
    const id = String(a?.abilityId ?? a?.id ?? a?.name ?? a);
    if (id === abilityId) return i;
  }
  return -1;
}

function pickAbilityForEvolution(oldSpeciesId: number, oldAbilityId: string | undefined, newSpeciesId: number): string | undefined {
  const newAbilities = getSpeciesAbilities(newSpeciesId);
  if (newAbilities.length === 0) return oldAbilityId;

  if (!oldAbilityId) {
    // fallback: primeira habilidade
    return newAbilities[0];
  }

  // Se a mesma habilidade existir no novo species, mantém
  if (newAbilities.includes(oldAbilityId)) return oldAbilityId;

  // Tenta manter o “slot” (comportamento próximo do oficial)
  const slotIndex = getAbilitySlotIndex(oldSpeciesId, oldAbilityId);
  if (slotIndex >= 0 && slotIndex < newAbilities.length) {
    return newAbilities[slotIndex];
  }

  // fallback: primeira
  return newAbilities[0];
}

// ---------------------------
// ✅ Evolução (fallback seguro até você fornecer regra completa)
// ---------------------------
function getEvolutionTargetFallback(speciesId: number, level: number): number | null {
  return resolveEvolutionTarget({
    speciesId,
    level,
  });
}

function toInventoryEntry(doc: InventoryDoc): InventoryEntry {
  return {
    id: doc.id,
    kind: doc.kind,
    name: doc.name,
    description: doc.description,
    quantity: Number(doc.quantity || 0),
    effectType: doc.effectType,
    healAmount: doc.healAmount,
    revivePercent: doc.revivePercent,
    levelGain: doc.levelGain,
    moveId: doc.moveId,
    consumable: doc.consumable,
    captureBonus: doc.captureBonus,
    isMasterBall: doc.isMasterBall,
  };
}

function sumInventoryQuantity(list: InventoryEntry[]) {
  return list.reduce((acc, item) => acc + Math.max(0, Number(item.quantity || 0)), 0);
}

function expToNextForLevel(level: number) {
  const lv = Math.max(1, Math.min(100, Number(level || 1)));
  return 20 + Math.floor(lv * 5);
}

function collectLevelUpMovesWhileProgressing(args: {
  startSpeciesId: number;
  startLevel: number;
  targetLevel: number;
}) {
  let speciesId = Math.max(1, Math.trunc(Number(args.startSpeciesId || 1)));
  const fromLevel = Math.max(1, Math.trunc(Number(args.startLevel || 1)));
  const toLevel = Math.max(fromLevel, Math.trunc(Number(args.targetLevel || fromLevel)));
  const moveCandidates: string[] = [];

  for (let level = fromLevel + 1; level <= toLevel; level++) {
    moveCandidates.push(...listLevelUpMovesInRange(speciesId, level - 1, level));
    const evoTarget = getEvolutionTargetFallback(speciesId, level);
    if (evoTarget) speciesId = evoTarget;
  }

  return { finalSpeciesId: speciesId, moveCandidates };
}

function randomNatureName(): string {
  const keys = Object.keys(NATURE_EFFECTS);
  if (keys.length === 0) return "Docile";
  return keys[Math.floor(Math.random() * keys.length)] || "Docile";
}

function randomGenderSimple(): "M" | "F" {
  return Math.random() < 0.5 ? "M" : "F";
}

function pickRandomWildSpeciesId(): number {
  const list = Array.isArray(pokemonSpecies)
    ? (pokemonSpecies as any[])
    : Object.values(pokemonSpecies as any);

  const pool = list.filter((p) => {
    const isLegendary = !!p?.flags?.legendary;
    const isMythical = !!p?.flags?.mythical;
    const id = Number(p?.id ?? p?.speciesId ?? 0);
    return !isLegendary && !isMythical && id > 0;
  });

  if (pool.length === 0) return 1;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return Number(chosen?.id ?? chosen?.speciesId ?? 1);
}

function computeCaptureChance(args: {
  encounter: WildEncounter;
  captureBonus: number;
  isMasterBall?: boolean;
}) {
  if (args.isMasterBall) return 1;

  const hpRatio =
    args.encounter.hpTotal > 0
      ? Math.max(0, Math.min(1, args.encounter.hpCurrent / args.encounter.hpTotal))
      : 1;

  const hpFactor = (1 - hpRatio) * 0.45;
  const ballFactor = (Math.max(1, Number(args.captureBonus || 1)) - 1) * 0.13;
  const base = 0.2;

  return Math.max(0.05, Math.min(0.95, base + hpFactor + ballFactor));
}

export default function GameScreen() {
  const router = useRouter();
  const { characterId } = useLocalSearchParams<{ characterId?: string }>();

  const uid = getAuth().currentUser?.uid || "";

  const [loading, setLoading] = useState(true);
  const [character, setCharacter] = useState<CharacterDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ✅ VIP/FREE via players/{uid}.playerType
  const [playerType, setPlayerType] = useState<"VIP" | "FREE">("FREE");

  // ✅ Mochila na tela principal (não modal)
  const [bagTab, setBagTab] = useState<BagTabKey>("TEAM");

  // ✅ Time (UI)
  const [team, setTeam] = useState<TeamPokemonUI[]>([]);
  const [box, setBox] = useState<TeamPokemonUI[]>([]);
  const [boxVisible, setBoxVisible] = useState(false);
  // ✅ Docs reais do time (para modal)
  const [teamDocsBySlot, setTeamDocsBySlot] = useState<Record<string, TeamPokemonDoc>>({});
  const [bagItems, setBagItems] = useState<InventoryEntry[]>([]);
  const [bagPokeballs, setBagPokeballs] = useState<InventoryEntry[]>([]);
  const [eggs, setEggs] = useState<EggDoc[]>([]);
  const [daycare, setDaycare] = useState<DaycareStateDoc | null>(null);
  const [daycareUnlocked, setDaycareUnlocked] = useState(true);
  const [daycareUnlockHint, setDaycareUnlockHint] = useState<string | null>(null);
  const [wildEncounter, setWildEncounter] = useState<WildEncounter | null>(null);
  const [biomeNpcAccess, setBiomeNpcAccess] = useState<{
    canBreeding: boolean;
    canRelearn: boolean;
    canTutor: boolean;
    tutorType: string | null;
    npcName: string;
    biomeId: string;
  } | null>(null);
  const spawnConfigCacheRef = useRef<
    Record<number, { min: number; max: number; encounterRate: number | null; configured: boolean }>
  >({});
  const versionConfigBySpeciesRef = useRef<Record<number, any> | null>(null);

  // Move-learning flow (4 moves limit)
  const [learnMoveVisible, setLearnMoveVisible] = useState(false);
  const [learnMoveSlotIndex, setLearnMoveSlotIndex] = useState<number | null>(null);

  // ✅ Ação atual do menu inferior
  const [activeAction, setActiveAction] = useState<GameActionKey>("BAG");

  function normalizeActionKey(key: string): GameActionKey {
    const raw = String(key || "").toUpperCase();
    if (raw === "MOCHILA") return "BAG";
    if (raw === "EXPLORAR") return "EXPLORE";
    if (raw === "BATALHAS") return "BATTLES";
    if (raw === "EVENTOS") return "EVENTS";
    if (raw === "LOJA") return "SHOP";
    if (raw === "BAG" || raw === "EXPLORE" || raw === "BATTLES" || raw === "SHOP" || raw === "EVENTS") {
      return raw as GameActionKey;
    }
    return "BAG";
  }

  const handleMenuPress = (key: GameActionKey) => {
    setActiveAction(normalizeActionKey(key));
  };
  const safeCharacterId = useMemo(() => {
    if (!characterId) return "";
    return Array.isArray(characterId) ? characterId[0] : characterId;
  }, [characterId]);

  const classLabel = useMemo(() => {
    if (!character?.classType) return "—";
    return character.classType === "TRAINER" ? "Trainer" : "Thief";
  }, [character]);

  const pokeCoinsText = useMemo(() => {
    if (!character) return "—";
    const v = character.pokeCoins;
    if (typeof v !== "number") return "—";
    return String(v);
  }, [character]);

  const pvpWinRateText = useMemo(() => {
    if (!character) return "—";
    const w = character.pvpWins;
    const l = character.pvpLosses;
    if (typeof w !== "number" || typeof l !== "number") return "—";
    const total = w + l;
    if (total <= 0) return "—";
    const pct = Math.round((w / total) * 100);
    return `${pct}%`;
  }, [character]);

  const itemCapacityLimit = useMemo(() => BAG_LIMIT_BY_PLAYER[playerType], [playerType]);
  const pokeballCapacityLimit = useMemo(() => BAG_LIMIT_BY_PLAYER[playerType], [playerType]);
  const itemCapacityUsed = useMemo(() => sumInventoryQuantity(bagItems), [bagItems]);
  const pokeballCapacityUsed = useMemo(() => sumInventoryQuantity(bagPokeballs), [bagPokeballs]);
  const incubatorCount = useMemo(
    () => Math.max(0, Number(bagItems.find((x) => x.id === EGG_INCUBATOR_ITEM_ID)?.quantity || 0)),
    [bagItems]
  );
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
  const normalizedAction = useMemo(() => normalizeActionKey(String(activeAction)), [activeAction]);
  const learnMoveDoc = useMemo(() => {
    if (!learnMoveSlotIndex) return null;
    return teamDocsBySlot[String(learnMoveSlotIndex)] ?? null;
  }, [learnMoveSlotIndex, teamDocsBySlot]);

  function onBack() {
    router.back();
  }

  useEffect(() => {
    if (learnMoveSlotIndex) return;
    for (let slot = 1; slot <= 6; slot++) {
      const doc = teamDocsBySlot[String(slot)];
      const pendingMove = String(doc?.pendingLearnMove || "").trim().toLowerCase();
      if (!doc || !pendingMove) continue;
      if (!Array.isArray(doc.moves) || doc.moves.length < 4) continue;
      setLearnMoveSlotIndex(slot);
      setLearnMoveVisible(true);
      return;
    }
  }, [learnMoveSlotIndex, teamDocsBySlot]);

  function comingSoon(action: GameActionKey) {
    const map: Record<string, string> = {
      BAG: "Mochila Pokémon",
      EXPLORE: "Explorar",
      BATTLES: "Batalhas",
      EVENTS: "Eventos",
      SHOP: "Loja",
      LOJA: "Loja",
    };

    Alert.alert("Em desenvolvimento", `${map[String(action)] ?? "Recurso"} ainda está em desenvolvimento.`);
  }

  // ✅ Corrige VIP/FREE via players/{uid}.playerType
  async function loadPlayerType(): Promise<"VIP" | "FREE"> {
    if (!uid) return "FREE";

    const playerRef = doc(db, "players", uid);
    const snap = await getDoc(playerRef);

    if (snap.exists()) {
      const data = snap.data() as PlayerDoc;
      if (data?.playerType === "VIP") {
        setPlayerType("VIP");
        return "VIP";
      }
      setPlayerType("FREE");
      return "FREE";
    } else {
      setPlayerType("FREE");
      return "FREE";
    }
  }

  // ✅ Cria sub-collections em characters/{characterId}: time/box/itens/pokeballs
  async function ensureCharacterSubcollections() {
    if (!uid || !safeCharacterId) return;

    const cols = ["time", "box", "itens", "pokeballs", "eggs", "daycare"] as const;

    await Promise.all(
      cols.map(async (col) => {
        const metaRef = doc(db, "players", uid, "characters", safeCharacterId, col, "_meta");
        const snap = await getDoc(metaRef);

        if (!snap.exists()) {
          await setDoc(metaRef, {
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      })
    );
  }

  async function loadTeamFromFirestore(char: CharacterDoc) {
    if (!uid || !safeCharacterId) return;
    const versionMap = await ensureVersionConfigMap();

    const timeCol = collection(db, "players", uid, "characters", safeCharacterId, "time");
    const snap = await getDocs(timeCol);

    const docs: TeamPokemonDoc[] = [];
    snap.forEach((d) => {
      if (d.id === "_meta") return;
      docs.push(d.data() as TeamPokemonDoc);
    });

    // ✅ Se não tiver Pokémon real, cria starter (contas antigas)
    if (docs.length === 0) {
      const starterRef = doc(db, "players", uid, "characters", safeCharacterId, "time", "slot_1");
      const starterMoves = ensureMinMoveSet(
        Number(char.starterPokemon.speciesId),
        5,
        resolveMovesForSpeciesAtLevel(Number(char.starterPokemon.speciesId), 5),
        2
      );

      await setDoc(starterRef, {
        slotIndex: 1,
        speciesId: Number(char.starterPokemon.speciesId),
        speciesName: char.starterPokemon.speciesName,
        nickname: char.starterPokemon.nickname ?? char.starterPokemon.speciesName,
        level: 5,
        nature: char.starterPokemon.nature || "Docile",
        gender: (char.starterPokemon.gender as any) || "U",
        abilityId: char.starterPokemon.abilityId || "",

        exp: { current: 0, toNext: 20 },
        hp: { current: 18, total: 22 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        moves: starterMoves,
        moveHistory: starterMoves,
        relearnableMoves: [],
        pendingLearnMove: null,
        friendship: FRIENDSHIP_DEFAULT,
        traumaLevel: 0,
        isAbandoned: false,
        traumaRecovered: false,
        bondBuff: false,
        learnsetConstraints:
          normalizeLearnsetConstraints(versionMap[Number(char.starterPokemon.speciesId)]) ?? null,
        isStarter: true,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return loadTeamFromFirestore(char);
    }

    const bySlot = new Map<number, TeamPokemonDoc>();
    docs.forEach((p) => bySlot.set(Number(p.slotIndex), p));

    // guarda docs para modal
    const docMap: Record<string, TeamPokemonDoc> = {};
    docs.forEach((p) => {
      docMap[String(p.slotIndex)] = p;
    });
    setTeamDocsBySlot(docMap);

    const ui: TeamPokemonUI[] = Array.from({ length: 6 }).map((_, idx) => {
      const slot = idx + 1;
      const found = bySlot.get(slot);

      if (!found) {
        return {
          id: `team-empty-${slot}`,
          speciesId: 0,
          name: "Slot vazio",
          level: 0,
          nature: "—",
          gender: "—",
          hpCurrent: 0,
          hpTotal: 0,
          expCurrent: 0,
          expToNext: 0,
          isStarter: false,
          spriteUrl: null,
        };
      }

      const sprite = getPokemonSpriteUrl(Number(found.speciesId));
      const g: "M" | "F" | "—" =
        found.gender === "M" ? "M" : found.gender === "F" ? "F" : "—";

      return {
        id: `slot-${slot}`,
        speciesId: Number(found.speciesId),
        name: found.speciesName,
        nickname: found.nickname,
        level: Number(found.level),
        nature: found.nature,
        gender: g,
        hpCurrent: Number(found.hp?.current ?? 0),
        hpTotal: Number(found.hp?.total ?? 0),
        expCurrent: Number(found.exp?.current ?? 0),
        expToNext: Number(found.exp?.toNext ?? 0),
        expTotal: Number((found as any)?.exp?.expTotal ?? (found as any)?.expTotal ?? 0),
        abilityId: found.abilityId ?? null,
        moves: Array.isArray(found.moves) ? found.moves.slice(0, 4) : [],
        moveHistory: Array.isArray(found.moveHistory) ? found.moveHistory : [],
        relearnableMoves: Array.isArray(found.relearnableMoves) ? found.relearnableMoves : [],
        pendingLearnMove: found.pendingLearnMove ?? null,
        learnsetConstraints:
          found.learnsetConstraints ??
          normalizeLearnsetConstraints(versionMap[Number(found.speciesId)]) ??
          null,
        stats: found.stats ?? null,
        ivs: found.ivs ?? null,
        evs: found.evs ?? null,
        nicknameEdited: !!found.nicknameEdited,
        friendship: Number(found.friendship || FRIENDSHIP_DEFAULT),
        traumaLevel: Math.max(0, Number(found.traumaLevel || 0)),
        isAbandoned: !!found.isAbandoned,
        traumaRecovered: !!found.traumaRecovered,
        bondBuff: !!found.bondBuff,
        canEvolve:
          !!resolveEvolutionTarget({
            speciesId: Number(found.speciesId),
            level: Number(found.level),
            friendship: Number(found.friendship || FRIENDSHIP_DEFAULT),
            knownMoves: Array.isArray(found.moves) ? found.moves : [],
          }),
        isStarter: !!found.isStarter,
        spriteUrl: sprite,
      };
    });

    setTeam(ui);
  }

  function toBoxUI(docId: string, mon: BoxPokemonDoc): TeamPokemonUI {
    const sprite = getPokemonSpriteUrl(Number(mon.speciesId));
    const g = mon.gender === "M" ? "M" : mon.gender === "F" ? "F" : undefined;

    return {
      id: String(docId || `box-${Date.now()}`),
      speciesId: Number(mon.speciesId || 0),
      name: String(mon.speciesName || getSpeciesName(Number(mon.speciesId || 0))),
      nickname: mon.nickname,
      level: Math.max(1, Number(mon.level || 1)),
      nature: mon.nature,
      gender: g,
      hpCurrent: Math.max(0, Number(mon.hp?.current ?? 0)),
      hpTotal: Math.max(1, Number(mon.hp?.total ?? 1)),
      expCurrent: Math.max(0, Number(mon.exp?.current ?? 0)),
      expToNext: Math.max(1, Number(mon.exp?.toNext ?? 1)),
      expTotal: Number((mon as any)?.exp?.expTotal ?? (mon as any)?.expTotal ?? 0),
      abilityId: mon.abilityId ?? null,
      moves: Array.isArray(mon.moves) ? mon.moves.slice(0, 4) : [],
      moveHistory: Array.isArray(mon.moveHistory) ? mon.moveHistory : [],
      relearnableMoves: Array.isArray(mon.relearnableMoves) ? mon.relearnableMoves : [],
      pendingLearnMove: mon.pendingLearnMove ?? null,
      learnsetConstraints: mon.learnsetConstraints ?? null,
      stats: mon.stats ?? null,
      ivs: mon.ivs ?? null,
      evs: mon.evs ?? null,
      nicknameEdited: !!mon.nicknameEdited,
      friendship: Number(mon.friendship || FRIENDSHIP_DEFAULT),
      traumaLevel: Math.max(0, Number(mon.traumaLevel || 0)),
      isAbandoned: !!mon.isAbandoned,
      traumaRecovered: !!mon.traumaRecovered,
      bondBuff: !!mon.bondBuff,
      canEvolve:
        !!resolveEvolutionTarget({
          speciesId: Number(mon.speciesId || 0),
          level: Number(mon.level || 1),
          friendship: Number(mon.friendship || FRIENDSHIP_DEFAULT),
          knownMoves: Array.isArray(mon.moves) ? mon.moves : [],
        }),
      isStarter: !!mon.isStarter,
      spriteUrl: sprite,
    };
  }

  async function loadBoxFromFirestore() {
    if (!uid || !safeCharacterId) return;
    const boxCol = collection(db, "players", uid, "characters", safeCharacterId, "box");
    const snap = await getDocs(boxCol);
    const rows: TeamPokemonUI[] = [];

    snap.forEach((d) => {
      if (d.id === "_meta") return;
      const mon = d.data() as BoxPokemonDoc;
      if (Number(mon?.speciesId || 0) <= 0) return;
      rows.push(toBoxUI(d.id, mon));
    });

    rows.sort((a, b) => {
      const la = Number(a.level || 0);
      const lb = Number(b.level || 0);
      if (lb !== la) return lb - la;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    setBox(rows);
  }

  async function reloadTeamAndBox(char: CharacterDoc | null | undefined) {
    if (!char) return;
    await Promise.all([loadTeamFromFirestore(char), loadBoxFromFirestore()]);
  }

  // =====================
  // ✅ NICKNAME: editar apenas 1 vez
  // =====================
  async function renamePokemonOnce(slotIndex: number, newNickname: string) {
    if (!uid || !safeCharacterId) return;
    const slot = Math.max(1, Math.min(6, Number(slotIndex)));
    const ref = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slot}`);

    const next = String(newNickname || "").trim();
    if (!next) {
      Alert.alert("Nome inválido", "Digite um nome válido.");
      return;
    }

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Pokémon não encontrado.");

        const data = snap.data() as TeamPokemonDoc;
        if (data.nicknameEdited) {
          throw new Error("Você já editou o nome desse Pokémon uma vez. Não é possível editar novamente.");
        }

        tx.update(ref, {
          nickname: next,
          nicknameEdited: true,
          updatedAt: serverTimestamp(),
        });
      });

      // refresh
      if (character) await reloadTeamAndBox(character);
    } catch (e: any) {
      Alert.alert("Não foi possível editar", e?.message || "Erro ao atualizar nome.");
    }
  }

  // =====================
  // ✅ EVOLUÇÃO (comportamento estilo jogos)
  // - muda sprite (speciesId)
  // - muda speciesName
  // - nickname só muda se NÃO foi editado
  // - stats/hp recalculados
  // - habilidade tenta manter slot; troca se necessário
  // =====================
  async function evolvePokemonFromTeam(slotIndex: number) {
    if (!uid || !safeCharacterId) return;
    const slot = Math.max(1, Math.min(6, Number(slotIndex)));
    const ref = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slot}`);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Pokémon não encontrado.");

        const data = snap.data() as TeamPokemonDoc;
        const currentSpeciesId = Number(data.speciesId);
        const level = Number(data.level || 1);

        const toSpeciesId = resolveEvolutionTarget({
          speciesId: currentSpeciesId,
          level,
          friendship: Number(data.friendship || FRIENDSHIP_DEFAULT),
          knownMoves: Array.isArray(data.moves) ? data.moves : [],
        });
        if (!toSpeciesId) throw new Error("Este Pokémon ainda não pode evoluir.");

        const oldSpeciesName = String(data.speciesName || getSpeciesName(currentSpeciesId));
        const newSpeciesName = getSpeciesName(toSpeciesId);

        // nickname (só muda se nunca foi editado e está "padrão")
        const nicknameEdited = !!data.nicknameEdited;
        const currentNickname = String(data.nickname || "").trim();
        const shouldAutoRename =
          !nicknameEdited && (!currentNickname || currentNickname === oldSpeciesName);
        const nextNickname = shouldAutoRename ? newSpeciesName : currentNickname;

        // ability: tenta manter como nos jogos (mesma habilidade se existir / mesmo slot)
        const nextAbilityId = pickAbilityForEvolution(currentSpeciesId, data.abilityId, toSpeciesId);

        // stats/hp: recalcula com base stats do species novo
        const base = resolveBaseStats(toSpeciesId);
        const ivs = data.ivs ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
        const evs = data.evs ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

        const real = base
          ? calcRealStats({ level, nature: data.nature, base, ivs, evs })
          : null;

        const oldHpTotal = Number(data.hp?.total ?? 0);
        const oldHpCurrent = Number(data.hp?.current ?? 0);
        const newHpTotal = Number(real?.hp ?? oldHpTotal);
        const hpDelta = newHpTotal - oldHpTotal;
        const newHpCurrent = Math.max(1, Math.min(newHpTotal, oldHpCurrent + hpDelta));

        tx.update(ref, {
          speciesId: toSpeciesId,
          speciesName: newSpeciesName,
          nickname: nextNickname,
          // mantém flag de edição (se nunca editou, continua false)
          nicknameEdited: nicknameEdited,
          abilityId: nextAbilityId ?? data.abilityId ?? "",
          ...(real
            ? {
              stats: {
                atk: real.atk,
                def: real.def,
                spa: real.spa,
                spd: real.spd,
                spe: real.spe,
              },
              hp: { current: newHpCurrent, total: newHpTotal },
            }
            : {}),
          updatedAt: serverTimestamp(),
        });
      });

      if (character) await reloadTeamAndBox(character);
    } catch (e: any) {
      Alert.alert("Evolução", e?.message || "Não foi possível evoluir.");
    }
  }

  async function seedInventoryIfEmpty(colName: "itens" | "pokeballs", defaults: InventoryDoc[]) {
    if (!uid || !safeCharacterId) return;

    const colRef = collection(db, "players", uid, "characters", safeCharacterId, colName);
    const snap = await getDocs(colRef);
    const hasDocs = snap.docs.some((d) => d.id !== "_meta");
    if (hasDocs) return;

    for (const item of defaults) {
      await setDoc(doc(db, "players", uid, "characters", safeCharacterId, colName, item.id), {
        ...item,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  async function loadBagFromFirestore(tierOverride?: "FREE" | "VIP") {
    if (!uid || !safeCharacterId) return;

    await seedInventoryIfEmpty("itens", DEFAULT_ITEMS);
    await seedInventoryIfEmpty("pokeballs", DEFAULT_POKEBALLS);

    const [itemsSnap, ballsSnap] = await Promise.all([
      getDocs(collection(db, "players", uid, "characters", safeCharacterId, "itens")),
      getDocs(collection(db, "players", uid, "characters", safeCharacterId, "pokeballs")),
    ]);

    const nextItems: InventoryEntry[] = [];
    itemsSnap.forEach((d) => {
      if (d.id === "_meta") return;
      const data = d.data() as InventoryDoc;
      if (Number(data.quantity || 0) <= 0) return;
      nextItems.push(
        toInventoryEntry({
          ...data,
          id: data.id || d.id,
          kind: "ITEM",
        })
      );
    });

    const nextBalls: InventoryEntry[] = [];
    ballsSnap.forEach((d) => {
      if (d.id === "_meta") return;
      const data = d.data() as InventoryDoc;
      if (Number(data.quantity || 0) <= 0) return;
      nextBalls.push(
        toInventoryEntry({
          ...data,
          id: data.id || d.id,
          kind: "POKEBALL",
        })
      );
    });

    setBagItems(nextItems.sort((a, b) => a.name.localeCompare(b.name)));
    setBagPokeballs(nextBalls.sort((a, b) => a.name.localeCompare(b.name)));

    const itemMetaRef = doc(db, "players", uid, "characters", safeCharacterId, "itens", "_meta");
    const ballMetaRef = doc(db, "players", uid, "characters", safeCharacterId, "pokeballs", "_meta");

    const tier = tierOverride ?? playerType;

    await Promise.all([
      setDoc(
        itemMetaRef,
        {
          limit: BAG_LIMIT_BY_PLAYER[tier],
          totalQuantity: sumInventoryQuantity(nextItems),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
      setDoc(
        ballMetaRef,
        {
          limit: BAG_LIMIT_BY_PLAYER[tier],
          totalQuantity: sumInventoryQuantity(nextBalls),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
    ]);
  }

  async function loadEggsFromFirestore() {
    if (!uid || !safeCharacterId) return;
    const eggsCol = collection(db, "players", uid, "characters", safeCharacterId, "eggs");
    const snap = await getDocs(eggsCol);
    const next: EggDoc[] = [];
    const nowMs = Date.now();
    const readyByTimeRefs: any[] = [];
    snap.forEach((d) => {
      if (d.id === "_meta") return;
      const data = d.data() as Partial<EggDoc>;
      const speciesId = Math.max(1, Number(data.speciesId || 1));
      const stepsRequiredRaw = Number(data.stepsRequired || 0);
      const stepsRequired = Number.isFinite(stepsRequiredRaw) && stepsRequiredRaw > 0
        ? Math.max(1, Math.trunc(stepsRequiredRaw))
        : getSpeciesHatchSteps(speciesId);
      const hatchMode = data.hatchMode === "time" ? "time" : "steps";
      const readyAtMsRaw = Number(data.readyAtMs || 0);
      const readyAtMs = Number.isFinite(readyAtMsRaw) && readyAtMsRaw > 0 ? readyAtMsRaw : null;
      const progress = Math.max(0, Number(data.stepsProgress || 0));
      const readyBySteps = progress >= stepsRequired;
      const readyByTime = hatchMode === "time" && readyAtMs != null && nowMs >= readyAtMs;
      const computedStatus =
        data.status === "hatched"
          ? "hatched"
          : readyBySteps || readyByTime
            ? "ready"
            : "incubating";

      if (computedStatus === "ready" && data.status !== "ready" && data.status !== "hatched") {
        readyByTimeRefs.push(d.ref);
      }
      next.push({
        id: d.id,
        speciesId,
        speciesName: String(data.speciesName || getSpeciesName(speciesId)),
        stepsRequired,
        stepsProgress: progress,
        inheritedEggMoves: Array.isArray(data.inheritedEggMoves) ? data.inheritedEggMoves : [],
        status: computedStatus,
        source: data.source === "daycare" ? "daycare" : "manual",
        hatchMode,
        readyAtMs,
        requiresIncubator: !!data.requiresIncubator,
        incubatorAssignedAt: data.incubatorAssignedAt,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
    });
    if (readyByTimeRefs.length) {
      const batch = writeBatch(db);
      readyByTimeRefs.forEach((ref) => {
        batch.set(ref, { status: "ready", updatedAt: serverTimestamp() }, { merge: true });
      });
      await batch.commit();
    }
    next.sort((a, b) => String(a.status).localeCompare(String(b.status)));
    setEggs(next);
  }

  async function loadDaycareState(tierOverride?: "FREE" | "VIP") {
    if (!uid || !safeCharacterId) return;
    const activeTier = tierOverride ?? playerType;
    const ref = doc(db, "players", uid, "characters", safeCharacterId, "daycare", "state");
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const profile = getDaycareProfile(activeTier);
      const base: DaycareStateDoc = {
        active: false,
        parentSlotA: null,
        parentSlotB: null,
        stepsSinceLastEgg: 0,
        eggStepThreshold: profile.eggStepThreshold,
        eggsGenerated: 0,
        daycareTier: profile.tier,
        eggHatchDays: profile.eggHatchDays,
      };
      await setDoc(
        ref,
        {
          ...base,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setDaycare(base);
      return;
    }
    const data = snap.data() as Partial<DaycareStateDoc>;
    const profile = getDaycareProfile(activeTier, data.daycareTier);
    setDaycare({
      active: !!data.active,
      parentSlotA:
        Number.isFinite(Number(data.parentSlotA)) && Number(data.parentSlotA) > 0
          ? Math.max(1, Math.min(6, Number(data.parentSlotA)))
          : null,
      parentSlotB:
        Number.isFinite(Number(data.parentSlotB)) && Number(data.parentSlotB) > 0
          ? Math.max(1, Math.min(6, Number(data.parentSlotB)))
          : null,
      stepsSinceLastEgg: Math.max(0, Math.trunc(Number(data.stepsSinceLastEgg || 0))),
      eggStepThreshold: Math.max(
        128,
        profile.eggStepThreshold,
        Math.trunc(Number(data.eggStepThreshold || profile.eggStepThreshold))
      ),
      eggsGenerated: Math.max(0, Math.trunc(Number(data.eggsGenerated || 0))),
      daycareTier: profile.tier,
      eggHatchDays: Math.max(profile.eggHatchDays, Number(data.eggHatchDays || profile.eggHatchDays)),
      lastEggAt: data.lastEggAt,
      updatedAt: data.updatedAt,
    });
  }

  async function progressEggsBySteps(stepDelta: number) {
    if (!uid || !safeCharacterId) return;
    const delta = Math.max(0, Math.trunc(Number(stepDelta || 0)));
    if (!delta) return;

    const eggsCol = collection(db, "players", uid, "characters", safeCharacterId, "eggs");
    const snap = await getDocs(eggsCol);
    if (snap.empty) return;

    const batch = writeBatch(db);
    let changed = false;
    snap.forEach((d) => {
      if (d.id === "_meta") return;
      const row = d.data() as any;
      const currentStatus = String(row?.status || "incubating");
      if (currentStatus === "hatched") return;
      const hatchMode = String(row?.hatchMode || "steps") === "time" ? "time" : "steps";
      if (hatchMode === "time") return;
      const requiresIncubator = !!row?.requiresIncubator;
      const hasIncubatorAssigned = !!row?.incubatorAssignedAt;
      if (requiresIncubator && !hasIncubatorAssigned) return;
      const speciesId = Math.max(1, Number(row?.speciesId || 1));
      const stepsRequiredRaw = Number(row?.stepsRequired || 0);
      const stepsRequired = Number.isFinite(stepsRequiredRaw) && stepsRequiredRaw > 0
        ? Math.max(1, Math.trunc(stepsRequiredRaw))
        : getSpeciesHatchSteps(speciesId);
      const next = applyEggSteps(
        {
          id: d.id,
          speciesId,
          speciesName: String(row?.speciesName || getSpeciesName(speciesId)),
          stepsRequired,
          stepsProgress: Math.max(0, Number(row?.stepsProgress || 0)),
          inheritedEggMoves: Array.isArray(row?.inheritedEggMoves) ? row.inheritedEggMoves : [],
          status: currentStatus === "ready" ? "ready" : "incubating",
        },
        delta
      );
      batch.set(
        d.ref,
        {
          stepsRequired: next.stepsRequired,
          stepsProgress: next.stepsProgress,
          status: next.status,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      changed = true;
    });

    if (!changed) return;
    await batch.commit();
    await loadEggsFromFirestore();
  }

  async function loadDaycareUnlockStatus() {
    if (!uid || !safeCharacterId) {
      setDaycareUnlocked(false);
      setDaycareUnlockHint("Desbloqueie um bioma com Daycare.");
      return;
    }

    try {
      const [charSnap, biomesSnap, unlockSnap, missionsSnap, accessSnap] = await Promise.all([
        getDoc(doc(db, "players", uid, "characters", safeCharacterId)),
        getDocs(collection(db, "biomes")),
        getDocs(collection(db, "players", uid, "characters", safeCharacterId, "explore_biomes")),
        getDocs(collection(db, "players", uid, "characters", safeCharacterId, "missions_progress")),
        getDocs(collection(db, "players", uid, "characters", safeCharacterId, "biome_access")),
      ]);

      const kmWalked = charSnap.exists()
        ? Math.max(
          0,
          Number(
            (charSnap.data() as Record<string, unknown>).kmWalked ??
            (charSnap.data() as Record<string, unknown>).totalKm ??
            (charSnap.data() as Record<string, unknown>).distanceKm ??
            0
          ) || 0
        )
        : 0;

      const unlockedByDoc = new Map<string, boolean>();
      unlockSnap.forEach((d) => {
        unlockedByDoc.set(String(d.id).trim().toLowerCase(), !!d.data()?.unlocked);
      });

      const completedMissionIds = missionsSnap.docs
        .filter((d) => Boolean(d.data()?.completed))
        .map((d) => String(d.id).trim().toLowerCase())
        .filter(Boolean);

      const accessIds = accessSnap.docs
        .filter((d) => {
          const row = d.data() as Record<string, unknown>;
          const expiresAtMsRaw = Number(row?.expiresAtMs || 0);
          if (Number.isFinite(expiresAtMsRaw) && expiresAtMsRaw > 0) return expiresAtMsRaw > Date.now();
          const expiresAt = row?.expiresAt as any;
          if (!expiresAt?.toMillis) return true;
          return expiresAt.toMillis() > Date.now();
        })
        .map((d) => String(d.id).trim().toLowerCase())
        .filter(Boolean);

      const daycareBiomes: Array<{
        id: string;
        name: string;
        unlockRules: unknown;
        unlockedByDefault: boolean;
      }> = [];
      biomesSnap.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        if (!data?.hasDaycare) return;
        const id = String(data.id || d.id).trim().toLowerCase();
        if (!id) return;
        daycareBiomes.push({
          id,
          name: String(data.name || id),
          unlockRules: data.unlockRules ?? null,
          unlockedByDefault: !!data.unlockedByDefault,
        });
      });

      if (!daycareBiomes.length) {
        // Legacy fallback: se nao houver bioma configurado com daycare, nao bloquear a feature.
        setDaycareUnlocked(true);
        setDaycareUnlockHint(null);
        return;
      }

      for (const biome of daycareBiomes) {
        const explicitlyUnlocked = unlockedByDoc.get(biome.id) === true;
        const unlockedByRule = biome.unlockRules
          ? evaluateUnlockRule(biome.unlockRules, {
            teamMoves,
            partySpeciesIds,
            kmWalked,
            completedMissionIds,
            accessIds,
            biomeId: biome.id,
          })
          : biome.unlockedByDefault;
        if (explicitlyUnlocked || unlockedByRule) {
          setDaycareUnlocked(true);
          setDaycareUnlockHint(`Disponivel no bioma: ${biome.name}`);
          return;
        }
      }

      setDaycareUnlocked(false);
      setDaycareUnlockHint("Desbloqueie um bioma com Daycare para habilitar.");
    } catch {
      // fallback seguro: nao bloqueia em caso de erro de leitura.
      setDaycareUnlocked(true);
      setDaycareUnlockHint(null);
    }
  }

  async function hatchEgg(eggId: string) {
    if (!uid || !safeCharacterId) return;
    const versionMap = await ensureVersionConfigMap();
    const targetEggId = String(eggId || "").trim();
    if (!targetEggId) return;
    const eggRef = doc(db, "players", uid, "characters", safeCharacterId, "eggs", targetEggId);

    await runTransaction(db, async (tx) => {
      const eggSnap = await tx.get(eggRef);
      if (!eggSnap.exists()) throw new Error("Ovo nao encontrado.");
      const egg = eggSnap.data() as any;
      const stepsRequired = Math.max(1, Number(egg?.stepsRequired || 1));
      const stepsProgress = Math.max(0, Number(egg?.stepsProgress || 0));
      const hatchMode = String(egg?.hatchMode || "steps") === "time" ? "time" : "steps";
      const readyAtMs = Number.isFinite(Number(egg?.readyAtMs)) ? Number(egg?.readyAtMs) : 0;
      const status = String(egg?.status || "");
      const readyBySteps = stepsProgress >= stepsRequired;
      const readyByTime = hatchMode === "time" && readyAtMs > 0 && Date.now() >= readyAtMs;
      const ready = status === "ready" || readyBySteps || readyByTime;
      if (!ready) throw new Error("Ovo ainda nao esta pronto para chocar.");

      const speciesId = Math.max(1, Number(egg?.speciesId || 1));
      const speciesName = String(egg?.speciesName || getSpeciesName(speciesId));
      const learnsetConstraints = normalizeLearnsetConstraints(versionMap[speciesId]) ?? null;
      const inheritedEggMovesRaw = Array.isArray(egg?.inheritedEggMoves) ? egg.inheritedEggMoves : [];
      const inheritedEggMoves = inheritedEggMovesRaw
        .map((m: any) => String(m || "").trim().toLowerCase())
        .filter(Boolean)
        .filter((m: string) => getEggMovesForSpecies(speciesId).includes(m));

      let chosenSlot: number | null = null;
      for (let slot = 1; slot <= 6; slot++) {
        const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slot}`);
        const slotSnap = await tx.get(slotRef);
        if (!slotSnap.exists()) {
          chosenSlot = slot;
          break;
        }
        const slotData = slotSnap.data() as TeamPokemonDoc;
        if (!Number.isFinite(Number(slotData?.speciesId)) || Number(slotData.speciesId) <= 0) {
          chosenSlot = slot;
          break;
        }
      }

      const nature = randomNatureName();
      const gender = randomGenderSimple();
      const abilities = getSpeciesAbilities(speciesId);
      const abilityId = abilities[0] ?? "";
      const level = 1;
      const ivs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      const base = resolveBaseStats(speciesId);
      const real = base ? calcRealStats({ level, nature, base, ivs, evs }) : null;
      const defaultMoves = resolveMovesForSpeciesAtLevel(speciesId, level);
      const moveApply = applyLearnMoves(
        { currentMoves: defaultMoves, moveHistory: defaultMoves, relearnableMoves: [], pendingLearnMove: null },
        inheritedEggMoves
      );
      const hatchMoves = ensureMinMoveSet(speciesId, level, moveApply.moves, 1);
      const hatchMoveHistory = Array.from(new Set([...(moveApply.moveHistory || []), ...hatchMoves])).slice(0, 12);

      const newbornData = {
        speciesId,
        speciesName,
        nickname: speciesName,
        level,
        nature,
        gender,
        abilityId,
        hp: {
          current: Math.max(1, Number(real?.hp ?? 10)),
          total: Math.max(1, Number(real?.hp ?? 10)),
        },
        exp: { current: 0, toNext: expToNextForLevel(level) },
        ivs,
        evs,
        stats: real
          ? {
            atk: real.atk,
            def: real.def,
            spa: real.spa,
            spd: real.spd,
            spe: real.spe,
          }
          : undefined,
        moves: hatchMoves,
        moveHistory: hatchMoveHistory,
        relearnableMoves: moveApply.relearnableMoves,
        pendingLearnMove: moveApply.pendingLearnMove,
        friendship: applyFriendshipEvent(FRIENDSHIP_DEFAULT, "hatch"),
        traumaLevel: 0,
        isAbandoned: false,
        traumaRecovered: false,
        bondBuff: false,
        learnsetConstraints,
        isStarter: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (chosenSlot) {
        const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${chosenSlot}`);
        tx.set(slotRef, { ...newbornData, slotIndex: chosenSlot }, { merge: true });
      } else {
        const boxRef = doc(collection(db, "players", uid, "characters", safeCharacterId, "box"));
        tx.set(boxRef, newbornData);
      }

      tx.delete(eggRef);
    });

    if (character) await reloadTeamAndBox(character);
    await loadEggsFromFirestore();
  }

  function createEggInTransaction(
    tx: any,
    monA: TeamPokemonDoc,
    monB: TeamPokemonDoc,
    options?: {
      source?: "daycare" | "manual";
      hatchMode?: "steps" | "time";
      readyAtMs?: number | null;
      requiresIncubator?: boolean;
    }
  ) {
    if (!areBreedingCompatible(monA, monB)) {
      throw new Error("Esses Pokemon nao sao compativeis para breeding.");
    }
    const childSpeciesId = resolveBreedingChildSpeciesId(monA, monB);
    if (!childSpeciesId) throw new Error("Nao foi possivel determinar a especie do ovo.");
    const childSpeciesName = getSpeciesName(childSpeciesId);
    const stepsRequired = getSpeciesHatchSteps(childSpeciesId);

    const egg = buildEggDocFromParents({
      childSpeciesId,
      childSpeciesName,
      stepsRequired,
      parents: [
        { speciesId: Math.max(1, Number(monA.speciesId || 1)), moves: Array.isArray(monA.moves) ? monA.moves : [] },
        { speciesId: Math.max(1, Number(monB.speciesId || 1)), moves: Array.isArray(monB.moves) ? monB.moves : [] },
      ],
    });

    const eggRef = doc(collection(db, "players", uid, "characters", safeCharacterId, "eggs"));
    const source = options?.source === "daycare" ? "daycare" : "manual";
    const hatchMode = options?.hatchMode === "time" ? "time" : "steps";
    const readyAtMs = hatchMode === "time" ? Math.max(0, Number(options?.readyAtMs || 0)) : 0;
    const requiresIncubator = hatchMode === "steps" ? !!options?.requiresIncubator : false;
    tx.set(eggRef, {
      speciesId: egg.speciesId,
      speciesName: egg.speciesName,
      stepsRequired: egg.stepsRequired,
      stepsProgress: egg.stepsProgress,
      inheritedEggMoves: egg.inheritedEggMoves,
      parentSpeciesIds: egg.parentSpeciesIds ?? [],
      status: hatchMode === "time" && readyAtMs > 0 && Date.now() >= readyAtMs ? "ready" : egg.status,
      source,
      hatchMode,
      readyAtMs: hatchMode === "time" ? readyAtMs : null,
      requiresIncubator,
      incubatorAssignedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function createEggFromTeamSlots(slotA: number, slotB: number): Promise<ActionResult> {
    if (!biomeNpcAccess?.canBreeding) {
      return { ok: false, message: "Breeding disponivel apenas via NPC Criador no bioma." };
    }
    if (!uid || !safeCharacterId) return { ok: false, message: "Sessao invalida." };
    const firstSlot = Math.max(1, Math.min(6, Number(slotA || 1)));
    const secondSlot = Math.max(1, Math.min(6, Number(slotB || 1)));
    if (firstSlot === secondSlot) {
      return { ok: false, message: "Selecione dois slots diferentes para breeding." };
    }

    try {
      await runTransaction(db, async (tx) => {
        const firstRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${firstSlot}`);
        const secondRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${secondSlot}`);
        const [firstSnap, secondSnap] = await Promise.all([tx.get(firstRef), tx.get(secondRef)]);

        if (!firstSnap.exists() || !secondSnap.exists()) {
          throw new Error("Pokemon dos slots selecionados nao encontrados.");
        }

        const monA = firstSnap.data() as TeamPokemonDoc;
        const monB = secondSnap.data() as TeamPokemonDoc;
        if (!Number.isFinite(Number(monA.speciesId)) || Number(monA.speciesId) <= 0) {
          throw new Error("Slot A nao possui Pokemon valido.");
        }
        if (!Number.isFinite(Number(monB.speciesId)) || Number(monB.speciesId) <= 0) {
          throw new Error("Slot B nao possui Pokemon valido.");
        }
        createEggInTransaction(tx, monA, monB, {
          source: "manual",
          hatchMode: "steps",
          requiresIncubator: true,
        });
      });

      await loadEggsFromFirestore();
      return { ok: true, message: "Ovo criado com sucesso." };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Falha ao criar ovo." };
    }
  }

  async function assignIncubatorToEgg(eggId: string): Promise<ActionResult> {
    if (!uid || !safeCharacterId) return { ok: false, message: "Sessao invalida." };
    const targetEggId = String(eggId || "").trim();
    if (!targetEggId) return { ok: false, message: "Ovo invalido." };

    try {
      await runTransaction(db, async (tx) => {
        const eggRef = doc(db, "players", uid, "characters", safeCharacterId, "eggs", targetEggId);
        const itemRef = doc(db, "players", uid, "characters", safeCharacterId, "itens", EGG_INCUBATOR_ITEM_ID);
        const itemMetaRef = doc(db, "players", uid, "characters", safeCharacterId, "itens", "_meta");
        const [eggSnap, itemSnap, metaSnap] = await Promise.all([
          tx.get(eggRef),
          tx.get(itemRef),
          tx.get(itemMetaRef),
        ]);

        if (!eggSnap.exists()) throw new Error("Ovo nao encontrado.");
        const egg = eggSnap.data() as any;
        const status = String(egg?.status || "incubating");
        const hatchMode = String(egg?.hatchMode || "steps") === "time" ? "time" : "steps";
        if (status === "ready" || status === "hatched") throw new Error("Esse ovo ja esta pronto.");
        if (hatchMode === "time") throw new Error("Ovos do daycare por tempo nao precisam de chocadeira.");
        if (!egg?.requiresIncubator) throw new Error("Esse ovo nao exige chocadeira.");
        if (egg?.incubatorAssignedAt) throw new Error("Esse ovo ja possui chocadeira ativa.");

        if (!itemSnap.exists()) throw new Error("Voce nao possui chocadeira.");
        const qty = Math.max(0, Number(itemSnap.data()?.quantity || 0));
        if (qty <= 0) throw new Error("Voce nao possui chocadeira.");

        const nextQty = qty - 1;
        if (nextQty <= 0) tx.delete(itemRef);
        else tx.update(itemRef, { quantity: nextQty, updatedAt: serverTimestamp() });

        const total = Math.max(0, Number(metaSnap.data()?.totalQuantity || 0));
        tx.set(
          itemMetaRef,
          { totalQuantity: Math.max(0, total - 1), updatedAt: serverTimestamp() },
          { merge: true }
        );

        tx.set(
          eggRef,
          { incubatorAssignedAt: serverTimestamp(), updatedAt: serverTimestamp() },
          { merge: true }
        );
      });

      await Promise.all([loadBagFromFirestore(), loadEggsFromFirestore()]);
      return { ok: true, message: "Chocadeira aplicada ao ovo." };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Falha ao aplicar chocadeira." };
    }
  }

  async function setDaycareParents(slotA: number, slotB: number): Promise<ActionResult> {
    if (!biomeNpcAccess?.canBreeding) {
      return { ok: false, message: "Daycare disponivel apenas via NPC Criador no bioma." };
    }
    if (!uid || !safeCharacterId) return { ok: false, message: "Sessao invalida." };
    if (!daycareUnlocked) return { ok: false, message: "Daycare bloqueado para sua conta." };
    const firstSlot = Math.max(1, Math.min(6, Number(slotA || 1)));
    const secondSlot = Math.max(1, Math.min(6, Number(slotB || 1)));
    if (firstSlot === secondSlot) {
      return { ok: false, message: "Selecione dois slots diferentes para o daycare." };
    }

    try {
      await runTransaction(db, async (tx) => {
        const firstRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${firstSlot}`);
        const secondRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${secondSlot}`);
        const daycareRef = doc(db, "players", uid, "characters", safeCharacterId, "daycare", "state");
        const [firstSnap, secondSnap] = await Promise.all([tx.get(firstRef), tx.get(secondRef)]);
        if (!firstSnap.exists() || !secondSnap.exists()) {
          throw new Error("Pokemon dos slots selecionados nao encontrados.");
        }
        const monA = firstSnap.data() as TeamPokemonDoc;
        const monB = secondSnap.data() as TeamPokemonDoc;
        if (!areBreedingCompatible(monA, monB)) {
          throw new Error("Esses Pokemon nao sao compativeis para breeding.");
        }
        const profile = getDaycareProfile(playerType, daycare?.daycareTier);

        tx.set(
          daycareRef,
          {
            active: true,
            parentSlotA: firstSlot,
            parentSlotB: secondSlot,
            stepsSinceLastEgg: 0,
            eggStepThreshold: Math.max(
              128,
              profile.eggStepThreshold,
              Number(daycare?.eggStepThreshold || profile.eggStepThreshold)
            ),
            daycareTier: profile.tier,
            eggHatchDays: profile.eggHatchDays,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await loadDaycareState();
      return { ok: true, message: "Pais definidos no daycare." };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Falha ao definir pais no daycare." };
    }
  }

  async function toggleDaycareActive(active: boolean): Promise<ActionResult> {
    if (!biomeNpcAccess?.canBreeding) {
      return { ok: false, message: "Daycare disponivel apenas via NPC Criador no bioma." };
    }
    if (!uid || !safeCharacterId) return { ok: false, message: "Sessao invalida." };
    if (!daycareUnlocked) return { ok: false, message: "Daycare bloqueado para sua conta." };
    try {
      const ref = doc(db, "players", uid, "characters", safeCharacterId, "daycare", "state");
      await setDoc(ref, { active: !!active, updatedAt: serverTimestamp() }, { merge: true });
      await loadDaycareState();
      return { ok: true, message: active ? "Daycare ativado." : "Daycare pausado." };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Falha ao atualizar daycare." };
    }
  }

  async function clearDaycareParents(): Promise<ActionResult> {
    if (!biomeNpcAccess?.canBreeding) {
      return { ok: false, message: "Daycare disponivel apenas via NPC Criador no bioma." };
    }
    if (!uid || !safeCharacterId) return { ok: false, message: "Sessao invalida." };
    if (!daycareUnlocked) return { ok: false, message: "Daycare bloqueado para sua conta." };
    try {
      const ref = doc(db, "players", uid, "characters", safeCharacterId, "daycare", "state");
      await setDoc(
        ref,
        {
          active: false,
          parentSlotA: null,
          parentSlotB: null,
          stepsSinceLastEgg: 0,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await loadDaycareState();
      return { ok: true, message: "Daycare limpo." };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Falha ao limpar daycare." };
    }
  }

  async function progressDaycareBySteps(stepDelta: number) {
    if (!uid || !safeCharacterId) return;
    if (!daycareUnlocked) return;
    const delta = Math.max(0, Math.trunc(Number(stepDelta || 0)));
    if (!delta) return;

    await runTransaction(db, async (tx) => {
      const daycareRef = doc(db, "players", uid, "characters", safeCharacterId, "daycare", "state");
      const daycareSnap = await tx.get(daycareRef);
      if (!daycareSnap.exists()) return;
      const data = daycareSnap.data() as Partial<DaycareStateDoc>;
      const active = !!data.active;
      const slotA =
        Number.isFinite(Number(data.parentSlotA)) && Number(data.parentSlotA) > 0
          ? Math.max(1, Math.min(6, Number(data.parentSlotA)))
          : null;
      const slotB =
        Number.isFinite(Number(data.parentSlotB)) && Number(data.parentSlotB) > 0
          ? Math.max(1, Math.min(6, Number(data.parentSlotB)))
          : null;
      if (!active || !slotA || !slotB || slotA === slotB) return;

      const firstRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slotA}`);
      const secondRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slotB}`);
      const [firstSnap, secondSnap] = await Promise.all([tx.get(firstRef), tx.get(secondRef)]);
      if (!firstSnap.exists() || !secondSnap.exists()) {
        tx.set(
          daycareRef,
          { active: false, parentSlotA: null, parentSlotB: null, updatedAt: serverTimestamp() },
          { merge: true }
        );
        return;
      }
      const monA = firstSnap.data() as TeamPokemonDoc;
      const monB = secondSnap.data() as TeamPokemonDoc;
      if (!areBreedingCompatible(monA, monB)) {
        tx.set(
          daycareRef,
          { active: false, updatedAt: serverTimestamp() },
          { merge: true }
        );
        return;
      }
      const profile = getDaycareProfile(playerType, data.daycareTier);

      const threshold = Math.max(
        128,
        profile.eggStepThreshold,
        Math.trunc(Number(data.eggStepThreshold || profile.eggStepThreshold))
      );
      const prevSteps = Math.max(0, Math.trunc(Number(data.stepsSinceLastEgg || 0)));
      const nextSteps = prevSteps + delta;
      const eggsGenerated = Math.max(0, Math.trunc(Number(data.eggsGenerated || 0)));

      if (nextSteps < threshold) {
        tx.set(
          daycareRef,
          { stepsSinceLastEgg: nextSteps, updatedAt: serverTimestamp() },
          { merge: true }
        );
        return;
      }

      const chance = computeDaycareEggChance(monA, monB);
      const success = Math.random() < chance;
      if (!success) {
        tx.set(
          daycareRef,
          { stepsSinceLastEgg: nextSteps - threshold, updatedAt: serverTimestamp() },
          { merge: true }
        );
        return;
      }

      const hatchDays = Math.max(profile.eggHatchDays, Number(data.eggHatchDays || profile.eggHatchDays));
      createEggInTransaction(tx, monA, monB, {
        source: "daycare",
        hatchMode: "time",
        readyAtMs: Date.now() + hatchDays * 24 * 60 * 60 * 1000,
      });
      tx.set(
        daycareRef,
        {
          stepsSinceLastEgg: Math.max(0, nextSteps - threshold),
          eggsGenerated: eggsGenerated + 1,
          lastEggAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    await Promise.all([loadDaycareState(), loadEggsFromFirestore()]);
  }

  async function useItemFromBag(itemId: string, slotIndex: number): Promise<ActionResult> {
    if (!uid || !safeCharacterId) return { ok: false, message: "Sessao invalida." };

    const item = bagItems.find((x) => x.id === itemId);
    if (!item || item.quantity <= 0) return { ok: false, message: "Item indisponivel." };

    const slot = Math.max(1, Math.min(6, Number(slotIndex)));
    const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slot}`);

    try {
      await runTransaction(db, async (tx) => {
        const itemRef = doc(db, "players", uid, "characters", safeCharacterId, "itens", itemId);
        const itemMetaRef = doc(db, "players", uid, "characters", safeCharacterId, "itens", "_meta");

        const [itemSnap, monSnap, itemMetaSnap] = await Promise.all([
          tx.get(itemRef),
          tx.get(slotRef),
          tx.get(itemMetaRef),
        ]);

        if (!itemSnap.exists()) throw new Error("Item nao encontrado no inventario.");
        if (!monSnap.exists()) throw new Error("Pokemon alvo nao encontrado.");

        const itemData = itemSnap.data() as InventoryDoc;
        const mon = monSnap.data() as TeamPokemonDoc;
        const qty = Number(itemData.quantity || 0);
        if (qty <= 0) throw new Error("Quantidade insuficiente.");

        const hpCurrent = Number(mon.hp?.current ?? 0);
        const hpTotal = Number(mon.hp?.total ?? 0);

        if (itemData.effectType === "HEAL") {
          if (hpCurrent <= 0) throw new Error("Pokemon nocauteado. Use um Revive.");
          if (hpCurrent >= hpTotal) throw new Error("Esse Pokemon ja esta com HP completo.");
          const heal = Math.max(1, Number(itemData.healAmount || 0));
          const nextHp = Math.min(hpTotal, hpCurrent + heal);
          tx.update(slotRef, {
            hp: { current: nextHp, total: hpTotal },
            updatedAt: serverTimestamp(),
          });
        } else if (itemData.effectType === "REVIVE") {
          if (hpCurrent > 0) throw new Error("Revive so pode ser usado em Pokemon nocauteado.");
          const revivePct = Math.max(1, Number(itemData.revivePercent || 50));
          const revivedHp = Math.max(1, Math.floor((hpTotal * revivePct) / 100));
          tx.update(slotRef, {
            hp: { current: revivedHp, total: hpTotal },
            updatedAt: serverTimestamp(),
          });
        } else if (itemData.effectType === "LEVEL_UP") {
          const currentLevel = Math.max(1, Number(mon.level || 1));
          if (currentLevel >= 100) throw new Error("Esse Pokemon ja esta no nivel maximo.");

          const nextLevel = Math.min(100, currentLevel + Math.max(1, Number(itemData.levelGain || 1)));
          let nextSpeciesId = Number(mon.speciesId);
          let nextSpeciesName = String(mon.speciesName || getSpeciesName(nextSpeciesId));
          let nextAbilityId = mon.abilityId ?? "";

          for (let level = currentLevel + 1; level <= nextLevel; level++) {
            const evoTarget = resolveEvolutionTarget({
              speciesId: nextSpeciesId,
              level,
              friendship: Number(mon.friendship || FRIENDSHIP_DEFAULT),
              knownMoves: Array.isArray(mon.moves) ? mon.moves : [],
            });
            if (!evoTarget) continue;
            const prevSpeciesId = nextSpeciesId;
            nextSpeciesId = evoTarget;
            nextSpeciesName = getSpeciesName(nextSpeciesId);
            nextAbilityId =
              pickAbilityForEvolution(prevSpeciesId, nextAbilityId || mon.abilityId, nextSpeciesId) ??
              nextAbilityId;
          }

          const moveProgress = collectLevelUpMovesWhileProgressing({
            startSpeciesId: Number(mon.speciesId),
            startLevel: currentLevel,
            targetLevel: nextLevel,
          });
          const moveApply = applyLearnMoves(
            {
              currentMoves: Array.isArray(mon.moves) ? mon.moves : [],
              moveHistory: mon.moveHistory ?? [],
              relearnableMoves: mon.relearnableMoves ?? [],
              pendingLearnMove: mon.pendingLearnMove ?? null,
            },
            moveProgress.moveCandidates
          );

          const base = resolveBaseStats(nextSpeciesId);
          const ivs = mon.ivs ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
          const evs = mon.evs ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
          const real = base
            ? calcRealStats({
              level: nextLevel,
              nature: mon.nature ?? "Docile",
              base,
              ivs,
              evs,
            })
            : null;

          const oldHpTotal = Number(mon.hp?.total ?? 0);
          const oldHpCurrent = Number(mon.hp?.current ?? 0);
          const newHpTotal = Number(real?.hp ?? oldHpTotal);
          const hpDelta = newHpTotal - oldHpTotal;
          const newHpCurrent = Math.max(1, Math.min(newHpTotal, oldHpCurrent + hpDelta));

          const currentNickname = String(mon.nickname || "").trim();
          const nicknameEdited = !!mon.nicknameEdited;
          const shouldRename =
            !nicknameEdited && (!currentNickname || currentNickname === String(mon.speciesName || ""));

          tx.update(slotRef, {
            level: nextLevel,
            speciesId: nextSpeciesId,
            speciesName: nextSpeciesName,
            nickname: shouldRename ? nextSpeciesName : currentNickname,
            abilityId: nextAbilityId,
            moves: moveApply.moves,
            moveHistory: moveApply.moveHistory,
            relearnableMoves: moveApply.relearnableMoves,
            pendingLearnMove: moveApply.pendingLearnMove,
            exp: { current: 0, toNext: expToNextForLevel(nextLevel) },
            ...(real
              ? {
                stats: {
                  atk: real.atk,
                  def: real.def,
                  spa: real.spa,
                  spd: real.spd,
                  spe: real.spe,
                },
                hp: { current: newHpCurrent, total: newHpTotal },
              }
              : {}),
            updatedAt: serverTimestamp(),
          });
        } else if (itemData.effectType === "TEACH_MOVE") {
          const moveId = String(itemData.moveId || "").trim().toLowerCase();
          if (!moveId) throw new Error("Esse TM nao possui move configurado.");

          const speciesId = Math.max(1, Number(mon.speciesId || 1));
          const compatibleMoves = getMachineMovesForSpecies(speciesId);
          if (!compatibleMoves.includes(moveId)) {
            throw new Error(`${mon.speciesName} nao e compativel com esse TM.`);
          }

          const moveApply = applyLearnMoves(
            {
              currentMoves: Array.isArray(mon.moves) ? mon.moves : [],
              moveHistory: mon.moveHistory ?? [],
              relearnableMoves: mon.relearnableMoves ?? [],
              pendingLearnMove: mon.pendingLearnMove ?? null,
            },
            [moveId]
          );

          tx.update(slotRef, {
            moves: moveApply.moves,
            moveHistory: moveApply.moveHistory,
            relearnableMoves: moveApply.relearnableMoves,
            pendingLearnMove: moveApply.pendingLearnMove,
            updatedAt: serverTimestamp(),
          });
        } else {
          throw new Error("Efeito desse item ainda nao foi implementado.");
        }

        const shouldConsume = itemData.effectType !== "TEACH_MOVE" || itemData.consumable !== false;
        if (shouldConsume) {
          const nextQty = qty - 1;
          if (nextQty <= 0) {
            tx.delete(itemRef);
          } else {
            tx.update(itemRef, { quantity: nextQty, updatedAt: serverTimestamp() });
          }
        }

        const total = Number(itemMetaSnap.data()?.totalQuantity ?? 0);
        const totalDelta = shouldConsume ? 1 : 0;
        tx.set(
          itemMetaRef,
          {
            totalQuantity: Math.max(0, total - totalDelta),
            limit: BAG_LIMIT_BY_PLAYER[playerType],
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });

      if (character) await reloadTeamAndBox(character);
      await loadBagFromFirestore();
      return { ok: true, message: `${item.name} usado com sucesso.` };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Falha ao usar item." };
    }
  }

  async function relearnMoveFromTutor(slotIndex: number, moveId: string): Promise<ActionResult> {
    if (!biomeNpcAccess?.canRelearn) {
      return { ok: false, message: "Reaprender disponivel apenas via NPC Remember no bioma." };
    }
    if (!uid || !safeCharacterId) return { ok: false, message: "Sessao invalida." };
    const slot = Math.max(1, Math.min(6, Number(slotIndex || 1)));
    const normalizedMoveId = String(moveId || "").trim().toLowerCase();
    if (!normalizedMoveId) return { ok: false, message: "Golpe invalido." };
    const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slot}`);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(slotRef);
        if (!snap.exists()) throw new Error("Pokemon alvo nao encontrado.");
        const mon = snap.data() as TeamPokemonDoc;

        const relearnable = Array.isArray(mon.relearnableMoves) ? mon.relearnableMoves : [];
        const learnedHistory = Array.isArray(mon.moveHistory) ? mon.moveHistory : [];
        if (!relearnable.includes(normalizedMoveId) && !learnedHistory.includes(normalizedMoveId)) {
          throw new Error("Esse golpe nao esta disponivel para reaprendizado.");
        }

        const moveApply = applyLearnMoves(
          {
            currentMoves: Array.isArray(mon.moves) ? mon.moves : [],
            moveHistory: learnedHistory,
            relearnableMoves: relearnable,
            pendingLearnMove: mon.pendingLearnMove ?? null,
          },
          [normalizedMoveId]
        );

        tx.update(slotRef, {
          moves: moveApply.moves,
          moveHistory: moveApply.moveHistory,
          relearnableMoves: moveApply.relearnableMoves,
          pendingLearnMove: moveApply.pendingLearnMove,
          updatedAt: serverTimestamp(),
        });
      });

      if (character) await reloadTeamAndBox(character);
      return { ok: true, message: "Golpe reaprendido com sucesso." };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Falha ao reaprender golpe." };
    }
  }

  async function teachMoveByTutor(
    slotIndex: number,
    moveId: string,
    payment: "coins" | "heart-scale"
  ): Promise<ActionResult> {
    if (!biomeNpcAccess?.canTutor) {
      return { ok: false, message: "Move Tutor disponivel apenas via NPC Especialista no bioma." };
    }
    if (!uid || !safeCharacterId) return { ok: false, message: "Sessao invalida." };
    const slot = Math.max(1, Math.min(6, Number(slotIndex || 1)));
    const normalizedMoveId = String(moveId || "").trim().toLowerCase();
    if (!normalizedMoveId) return { ok: false, message: "Golpe invalido." };
    if (biomeNpcAccess?.tutorType) {
      const moveType = getMoveType(normalizedMoveId);
      if (!moveType || moveType !== String(biomeNpcAccess.tutorType).toLowerCase()) {
        return {
          ok: false,
          message: `Este especialista ensina apenas golpes do tipo ${biomeNpcAccess.tutorType}.`,
        };
      }
    }
    const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slot}`);

    try {
      await runTransaction(db, async (tx) => {
        const monSnap = await tx.get(slotRef);
        if (!monSnap.exists()) throw new Error("Pokemon alvo nao encontrado.");
        const mon = monSnap.data() as TeamPokemonDoc;
        const speciesId = Math.max(1, Number(mon.speciesId || 1));
        const tutorMoves = getTutorMovesForSpecies(speciesId);
        if (!tutorMoves.includes(normalizedMoveId)) {
          throw new Error(`${mon.speciesName} nao e compativel com esse tutor move.`);
        }

        if (payment === "coins") {
          const charRef = doc(db, "players", uid, "characters", safeCharacterId);
          const charSnap = await tx.get(charRef);
          const coins = Math.max(0, Number(charSnap.data()?.pokeCoins ?? 0));
          if (coins < MOVE_TUTOR_COST_COINS) {
            throw new Error(`Moedas insuficientes. Necessario: ${MOVE_TUTOR_COST_COINS}.`);
          }
          tx.set(
            charRef,
            {
              pokeCoins: coins - MOVE_TUTOR_COST_COINS,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          const itemRef = doc(
            db,
            "players",
            uid,
            "characters",
            safeCharacterId,
            "itens",
            MOVE_TUTOR_ITEM_ID
          );
          const itemMetaRef = doc(db, "players", uid, "characters", safeCharacterId, "itens", "_meta");
          const [itemSnap, metaSnap] = await Promise.all([tx.get(itemRef), tx.get(itemMetaRef)]);
          if (!itemSnap.exists()) throw new Error("Heart Scale indisponivel.");
          const qty = Math.max(0, Number(itemSnap.data()?.quantity ?? 0));
          if (qty <= 0) throw new Error("Heart Scale indisponivel.");
          if (qty <= 1) tx.delete(itemRef);
          else tx.update(itemRef, { quantity: qty - 1, updatedAt: serverTimestamp() });

          const total = Math.max(0, Number(metaSnap.data()?.totalQuantity ?? 0));
          tx.set(
            itemMetaRef,
            {
              totalQuantity: Math.max(0, total - 1),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        const moveApply = applyLearnMoves(
          {
            currentMoves: Array.isArray(mon.moves) ? mon.moves : [],
            moveHistory: mon.moveHistory ?? [],
            relearnableMoves: mon.relearnableMoves ?? [],
            pendingLearnMove: mon.pendingLearnMove ?? null,
          },
          [normalizedMoveId]
        );

        tx.update(slotRef, {
          moves: moveApply.moves,
          moveHistory: moveApply.moveHistory,
          relearnableMoves: moveApply.relearnableMoves,
          pendingLearnMove: moveApply.pendingLearnMove,
          updatedAt: serverTimestamp(),
        });
      });

      if (character) await reloadTeamAndBox(character);
      await loadBagFromFirestore();
      if (payment === "coins") {
        setCharacter((prev) =>
          prev ? { ...prev, pokeCoins: Math.max(0, Number(prev.pokeCoins || 0) - MOVE_TUTOR_COST_COINS) } : prev
        );
      }
      return {
        ok: true,
        message:
          payment === "coins"
            ? `Golpe ensinado via tutor por ${MOVE_TUTOR_COST_COINS} moedas.`
            : "Golpe ensinado via tutor usando Heart Scale.",
      };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Falha no Move Tutor." };
    }
  }

  async function ensureVersionConfigMap(): Promise<Record<number, any>> {
    if (versionConfigBySpeciesRef.current) return versionConfigBySpeciesRef.current;

    const map: Record<number, any> = {};
    try {
      const snap = await getDocs(
        query(collection(db, "pokedexConfig"), where("versionId", "==", CAPTURE_CONFIG_VERSION_ID))
      );
      snap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const rawSpeciesId =
          data?.speciesId ??
          (() => {
            const docId = String(docSnap.id || "");
            const maybeNum = Number(docId.split("_").pop() ?? "");
            return Number.isFinite(maybeNum) ? maybeNum : null;
          })();
        const speciesId = Number(rawSpeciesId);
        if (!Number.isFinite(speciesId) || speciesId <= 0) return;
        map[Math.trunc(speciesId)] = data;
      });
    } catch {
      // fallback com busca direta por docId/speciesId
    }

    versionConfigBySpeciesRef.current = map;
    return map;
  }

  function normalizeLearnsetConstraints(raw: any): { maxGeneration?: number | null; blockedSources?: string[] } | null {
    const src = raw?.learnsetConstraints ?? raw ?? null;
    if (!src || typeof src !== "object") return null;
    const maxGenerationRaw = Number(src.maxGeneration);
    const maxGeneration =
      Number.isFinite(maxGenerationRaw) && maxGenerationRaw > 0 ? Math.trunc(maxGenerationRaw) : null;
    const blockedSources = Array.isArray(src.blockedSources)
      ? src.blockedSources
        .map((v: any) => String(v || "").trim().toLowerCase())
        .filter(Boolean)
      : [];
    if (!maxGeneration && blockedSources.length === 0) return null;
    return {
      maxGeneration: maxGeneration ?? undefined,
      blockedSources,
    };
  }

  async function resolveConfiguredSpawn(speciesId: number): Promise<{
    min: number;
    max: number;
    encounterRate: number | null;
    configured: boolean;
  }> {
    const cached = spawnConfigCacheRef.current[speciesId];
    if (cached) return cached;

    try {
      const ref = doc(db, "pokedexConfig", `${CAPTURE_CONFIG_VERSION_ID}_${speciesId}`);
      const snap = await getDoc(ref);

      let data: {
        minLevel?: unknown;
        maxLevel?: unknown;
        groupConfig?: { minLevel?: unknown; maxLevel?: unknown } | null;
      } | null = null;

      if (snap.exists()) {
        data = snap.data() as {
          minLevel?: unknown;
          maxLevel?: unknown;
          encounterRate?: unknown;
          groupConfig?: { minLevel?: unknown; maxLevel?: unknown } | null;
        };
      } else {
        const versionMap = await ensureVersionConfigMap();
        if (versionMap[speciesId]) {
          data = versionMap[speciesId] as {
            minLevel?: unknown;
            maxLevel?: unknown;
            encounterRate?: unknown;
            groupConfig?: { minLevel?: unknown; maxLevel?: unknown } | null;
          };
        } else {
          const qByNumber = query(
            collection(db, "pokedexConfig"),
            where("versionId", "==", CAPTURE_CONFIG_VERSION_ID),
            where("speciesId", "==", speciesId),
            limit(1)
          );
          const byNumber = await getDocs(qByNumber);
          if (!byNumber.empty) {
            data = byNumber.docs[0].data() as {
              minLevel?: unknown;
              maxLevel?: unknown;
              encounterRate?: unknown;
              groupConfig?: { minLevel?: unknown; maxLevel?: unknown } | null;
            };
          } else {
            const qByString = query(
              collection(db, "pokedexConfig"),
              where("versionId", "==", CAPTURE_CONFIG_VERSION_ID),
              where("speciesId", "==", String(speciesId)),
              limit(1)
            );
            const byString = await getDocs(qByString);
            if (!byString.empty) {
              data = byString.docs[0].data() as {
                minLevel?: unknown;
                maxLevel?: unknown;
                encounterRate?: unknown;
                groupConfig?: { minLevel?: unknown; maxLevel?: unknown } | null;
              };
            }
          }
        }
      }

      if (!data) {
        const out = { min: 2, max: 10, encounterRate: null, configured: false };
        spawnConfigCacheRef.current[speciesId] = out;
        return out;
      }

      const rootMin =
        typeof data.minLevel === "number"
          ? data.minLevel
          : data.minLevel != null
            ? Number(data.minLevel)
            : null;
      const rootMax =
        typeof data.maxLevel === "number"
          ? data.maxLevel
          : data.maxLevel != null
            ? Number(data.maxLevel)
            : null;

      const groupMin =
        typeof data.groupConfig?.minLevel === "number"
          ? data.groupConfig.minLevel
          : data.groupConfig?.minLevel != null
            ? Number(data.groupConfig.minLevel)
            : null;
      const groupMax =
        typeof data.groupConfig?.maxLevel === "number"
          ? data.groupConfig.maxLevel
          : data.groupConfig?.maxLevel != null
            ? Number(data.groupConfig.maxLevel)
            : null;

      const minCandidate =
        (rootMin != null && Number.isFinite(rootMin) ? rootMin : null) ??
        (groupMin != null && Number.isFinite(groupMin) ? groupMin : null) ??
        2;
      const maxCandidate =
        (rootMax != null && Number.isFinite(rootMax) ? rootMax : null) ??
        (groupMax != null && Number.isFinite(groupMax) ? groupMax : null) ??
        10;
      const rateRaw =
        typeof (data as any).encounterRate === "number"
          ? (data as any).encounterRate
          : (data as any).encounterRate != null
            ? Number((data as any).encounterRate)
            : null;
      const encounterRate =
        rateRaw != null && Number.isFinite(rateRaw) ? Math.max(0, Math.min(100, Number(rateRaw))) : null;

      const out = {
        min: Math.max(1, Math.trunc(Math.min(minCandidate, maxCandidate))),
        max: Math.max(1, Math.trunc(Math.max(minCandidate, maxCandidate))),
        encounterRate,
        configured: true,
      };
      spawnConfigCacheRef.current[speciesId] = out;
      return out;
    } catch {
      const out = { min: 2, max: 10, encounterRate: null, configured: false };
      spawnConfigCacheRef.current[speciesId] = out;
      return out;
    }
  }

  async function generateWildEncounter() {
    const fallbackSpecies = pickRandomWildSpeciesId();
    const basePool = Array.isArray(pokemonSpecies)
      ? (pokemonSpecies as any[])
      : Object.values(pokemonSpecies as any);
    const speciesPool = basePool
      .map((p) => Number(p?.id ?? p?.speciesId ?? 0))
      .filter((id) => Number.isFinite(id) && id > 0)
      .map((id) => Math.trunc(id));

    const configs = await Promise.all(
      speciesPool.map(async (sid) => ({ speciesId: sid, cfg: await resolveConfiguredSpawn(sid) }))
    );
    const configuredCandidates = configs.filter((x) => x.cfg.configured && (x.cfg.encounterRate ?? 0) > 0);
    const pool = configuredCandidates.length > 0 ? configuredCandidates : configs;

    let speciesId = fallbackSpecies;
    if (pool.length > 0) {
      const weights = pool.map((x) =>
        configuredCandidates.length > 0 ? Number(x.cfg.encounterRate ?? 0) : 1
      );
      const totalWeight = weights.reduce((acc, w) => acc + Math.max(0, w), 0);
      if (totalWeight > 0) {
        let roll = Math.random() * totalWeight;
        for (let i = 0; i < pool.length; i++) {
          roll -= Math.max(0, weights[i]);
          if (roll <= 0) {
            speciesId = pool[i].speciesId;
            break;
          }
        }
      } else {
        speciesId = pool[Math.floor(Math.random() * pool.length)]?.speciesId ?? fallbackSpecies;
      }
    }

    const speciesName = getSpeciesName(speciesId);
    const range = await resolveConfiguredSpawn(speciesId);
    const level = range.min + Math.floor(Math.random() * (range.max - range.min + 1));

    const base = resolveBaseStats(speciesId);
    const ivs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    const real = base
      ? calcRealStats({ level, nature: randomNatureName(), base, ivs, evs })
      : { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 };

    const hpTotal = Math.max(10, Number(real.hp || 20));
    const hpCurrent = Math.max(1, Math.floor(hpTotal * (0.35 + Math.random() * 0.6)));

    setWildEncounter({
      speciesId,
      speciesName,
      level,
      hpCurrent,
      hpTotal,
      spriteUrl: getPokemonSpriteUrl(speciesId),
    });
  }

  function runFromEncounter() {
    setWildEncounter(null);
  }

  async function throwPokeballWithEncounter(
    ballId: string,
    encounterData: WildEncounter & { biomeId?: string }
  ): Promise<ActionResult> {
    if (!uid || !safeCharacterId) return { ok: false, message: "Sessao invalida." };
    const versionMap = await ensureVersionConfigMap();
    const capturedConstraints =
      normalizeLearnsetConstraints(versionMap[Number(encounterData.speciesId)]) ?? null;

    const ball = bagPokeballs.find((x) => x.id === ballId);
    if (!ball || ball.quantity <= 0) return { ok: false, message: "Pokebola indisponivel." };

    const chance = computeCaptureChance({
      encounter: encounterData,
      captureBonus: Number(ball.captureBonus || 1),
      isMasterBall: !!ball.isMasterBall,
    });
    const success = Math.random() < chance;

    try {
      await runTransaction(db, async (tx) => {
        const ballRef = doc(db, "players", uid, "characters", safeCharacterId, "pokeballs", ballId);
        const ballMetaRef = doc(db, "players", uid, "characters", safeCharacterId, "pokeballs", "_meta");

        const [ballSnap, metaSnap] = await Promise.all([tx.get(ballRef), tx.get(ballMetaRef)]);
        if (!ballSnap.exists()) throw new Error("Pokebola nao encontrada.");

        const ballData = ballSnap.data() as InventoryDoc;
        const qty = Number(ballData.quantity || 0);
        if (qty <= 0) throw new Error("Quantidade insuficiente.");

        let chosenSlot: number | null = null;
        if (success) {
          for (let slot = 1; slot <= 6; slot++) {
            const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slot}`);
            const slotSnap = await tx.get(slotRef);
            if (!slotSnap.exists()) {
              chosenSlot = slot;
              break;
            }
            const slotData = slotSnap.data() as TeamPokemonDoc;
            if (!Number.isFinite(Number(slotData?.speciesId)) || Number(slotData.speciesId) <= 0) {
              chosenSlot = slot;
              break;
            }
          }
        }

        tx.update(ballRef, {
          quantity: qty - 1,
          updatedAt: serverTimestamp(),
        });

        const total = Number(metaSnap.data()?.totalQuantity ?? 0);
        tx.set(
          ballMetaRef,
          {
            totalQuantity: Math.max(0, total - 1),
            limit: BAG_LIMIT_BY_PLAYER[playerType],
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        if (success) {
          const nature = randomNatureName();
          const gender = randomGenderSimple();
          const abilities = getSpeciesAbilities(encounterData.speciesId);
          const abilityId = abilities[0] ?? "";

          const base = resolveBaseStats(encounterData.speciesId);
          const ivs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
          const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
          const real = base
            ? calcRealStats({ level: encounterData.level, nature, base, ivs, evs })
            : null;

          const initialMoves = Array.isArray(encounterData.moves) && encounterData.moves.length > 0
            ? encounterData.moves
            : resolveMovesForSpeciesAtLevel(encounterData.speciesId, encounterData.level);
          const capturedData = {
            speciesId: encounterData.speciesId,
            speciesName: encounterData.speciesName,
            capturedSpeciesId: encounterData.speciesId,
            capturedSpeciesName: encounterData.speciesName,
            captureSource: "wild",
            nickname: encounterData.speciesName,
            level: encounterData.level,
            nature,
            gender,
            abilityId,
            hp: {
              current: Math.max(1, Number(real?.hp ?? encounterData.hpCurrent)),
              total: Math.max(1, Number(real?.hp ?? encounterData.hpTotal)),
            },
            exp: { current: 0, toNext: expToNextForLevel(encounterData.level) },
            ivs,
            evs,
            stats: real
              ? {
                atk: real.atk,
                def: real.def,
                spa: real.spa,
                spd: real.spd,
                spe: real.spe,
              }
              : undefined,
            moves: initialMoves,
            moveHistory: initialMoves,
            relearnableMoves: [],
            pendingLearnMove: null,
            friendship: applyFriendshipEvent(FRIENDSHIP_DEFAULT, "capture"),
            traumaLevel: 0,
            isAbandoned: false,
            traumaRecovered: false,
            bondBuff: false,
            learnsetConstraints: capturedConstraints,
            isStarter: false,
            capturedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          if (chosenSlot) {
            const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${chosenSlot}`);
            tx.set(slotRef, { ...capturedData, slotIndex: chosenSlot }, { merge: true });
          } else {
            const boxRef = doc(collection(db, "players", uid, "characters", safeCharacterId, "box"));
            tx.set(boxRef, capturedData);
          }
        }
      });

      await loadBagFromFirestore();

      if (success) {
        if (encounterData.biomeId) {
          try {
            await registerBiomeCapture({
              biomeId: String(encounterData.biomeId),
              speciesId: Number(encounterData.speciesId),
            });
          } catch {
            // ignore capture counter sync failures
          }
        }
        if (character) await reloadTeamAndBox(character);
        const capturedName = encounterData.speciesName;
        setWildEncounter(null);
        return { ok: true, message: `${capturedName} foi capturado com ${ball.name}.` };
      }

      return { ok: false, message: `${encounterData.speciesName} escapou da ${ball.name}.` };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Falha ao arremessar pokebola." };
    }
  }

  async function throwPokeball(ballId: string): Promise<ActionResult> {
    if (!wildEncounter) return { ok: false, message: "Nao ha encontro ativo para captura." };
    return throwPokeballWithEncounter(ballId, wildEncounter);
  }

  async function tryCaptureFromExplore(payload: {
    ballId: string;
    encounter: { speciesId: number; speciesName: string; level: number; hpCurrent: number; hpTotal: number; biomeId?: string; moves?: string[] };
  }): Promise<ActionResult> {
    return throwPokeballWithEncounter(payload.ballId, {
      speciesId: Number(payload.encounter.speciesId),
      speciesName: String(payload.encounter.speciesName),
      level: Math.max(1, Number(payload.encounter.level || 1)),
      hpCurrent: Math.max(1, Number(payload.encounter.hpCurrent || 1)),
      hpTotal: Math.max(1, Number(payload.encounter.hpTotal || 1)),
      biomeId: payload.encounter.biomeId ? String(payload.encounter.biomeId) : undefined,
      spriteUrl: getPokemonSpriteUrl(Number(payload.encounter.speciesId)),
      moves: payload.encounter.moves,
    });
  }

  async function grantExploreExpToLead(payload: { speciesId: number; level: number; slotIndices: number[] }) {
    if (!uid || !safeCharacterId) return;

    const uniqueSlots = Array.from(
      new Set((Array.isArray(payload.slotIndices) ? payload.slotIndices : []).map((s) => Math.max(1, Math.min(6, Number(s || 0)))))
    ).filter((s) => Number.isFinite(s));
    if (!uniqueSlots.length) return;

    const baseGain = Math.max(1, 12 + Math.floor(Number(payload.level || 1) * 3));
    const gain = Math.max(1, Math.floor(baseGain / uniqueSlots.length));
    const evYield = await resolveEvYieldOfficialOrFallback(Number(payload.speciesId || 0));

    await runTransaction(db, async (tx) => {
      const slots = uniqueSlots.map((slotIndex) => ({
        slotIndex,
        slotRef: doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slotIndex}`),
      }));
      const snaps = await Promise.all(slots.map((s) => tx.get(s.slotRef)));

      for (let i = 0; i < slots.length; i++) {
        const { slotRef } = slots[i];
        const monSnap = snaps[i];
        if (!monSnap.exists()) continue;

        const mon = monSnap.data() as TeamPokemonDoc;

        let nextLevel = Math.max(1, Number(mon.level || 1));
        let expCurrent = Math.max(0, Number(mon.exp?.current ?? 0)) + gain;
        let expToNext = Math.max(1, Number(mon.exp?.toNext ?? expToNextForLevel(nextLevel)));
        let nextSpeciesId = Number(mon.speciesId);
        let nextSpeciesName = String(mon.speciesName || getSpeciesName(nextSpeciesId));
        let nextAbilityId = mon.abilityId ?? "";
        const moveCandidates: string[] = [];

        while (expCurrent >= expToNext && nextLevel < 100) {
          expCurrent -= expToNext;
          nextLevel += 1;
          expToNext = expToNextForLevel(nextLevel);
          moveCandidates.push(...listLevelUpMovesInRange(nextSpeciesId, nextLevel - 1, nextLevel));

          const evoTarget = resolveEvolutionTarget({
            speciesId: nextSpeciesId,
            level: nextLevel,
            friendship: Number(mon.friendship || FRIENDSHIP_DEFAULT),
            knownMoves: Array.isArray(mon.moves) ? mon.moves : [],
          });
          if (evoTarget) {
            const oldSpecies = nextSpeciesId;
            nextSpeciesId = evoTarget;
            nextSpeciesName = getSpeciesName(nextSpeciesId);
            nextAbilityId = pickAbilityForEvolution(oldSpecies, nextAbilityId, nextSpeciesId) ?? nextAbilityId;
          }
        }

        const moveApply = applyLearnMoves(
          {
            currentMoves: Array.isArray(mon.moves) ? mon.moves : [],
            moveHistory: mon.moveHistory ?? [],
            relearnableMoves: mon.relearnableMoves ?? [],
            pendingLearnMove: mon.pendingLearnMove ?? null,
          },
          moveCandidates
        );

        const base = resolveBaseStats(nextSpeciesId);
        const ivs = mon.ivs ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
        const evs = addEVYieldWithCaps(
          mon.evs ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
          evYield
        );
        const real = base
          ? calcRealStats({
            level: nextLevel,
            nature: mon.nature ?? "Docile",
            base,
            ivs,
            evs,
          })
          : null;

        const oldHpTotal = Number(mon.hp?.total ?? 1);
        const oldHpCurrent = Number(mon.hp?.current ?? 1);
        const newHpTotal = Math.max(1, Number(real?.hp ?? oldHpTotal));
        const hpDelta = newHpTotal - oldHpTotal;
        const newHpCurrent =
          oldHpCurrent <= 0
            ? 0
            : Math.max(1, Math.min(newHpTotal, oldHpCurrent + hpDelta));

        const currentNickname = String(mon.nickname || "").trim();
        const nicknameEdited = !!mon.nicknameEdited;
        const shouldRename =
          !nicknameEdited && (!currentNickname || currentNickname === String(mon.speciesName || ""));

        tx.update(slotRef, {
          level: nextLevel,
          speciesId: nextSpeciesId,
          speciesName: nextSpeciesName,
          nickname: shouldRename ? nextSpeciesName : currentNickname,
          abilityId: nextAbilityId,
          moves: moveApply.moves,
          moveHistory: moveApply.moveHistory,
          relearnableMoves: moveApply.relearnableMoves,
          pendingLearnMove: moveApply.pendingLearnMove,
          exp: { current: expCurrent, toNext: expToNext },
          friendship: applyFriendshipEvent(Number(mon.friendship || FRIENDSHIP_DEFAULT), "battleWin"),
          evs,
          ...(real
            ? {
              stats: {
                atk: real.atk,
                def: real.def,
                spa: real.spa,
                spd: real.spd,
                spe: real.spe,
              },
              hp: { current: newHpCurrent, total: newHpTotal },
            }
            : {}),
          updatedAt: serverTimestamp(),
        });
      }
    });

    if (character) await reloadTeamAndBox(character);
  }

  async function confirmLearnMove(slotIndex: number, forgetMoveIndex: number) {
    if (!uid || !safeCharacterId) return;
    const slot = Math.max(1, Math.min(6, Number(slotIndex || 1)));
    const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slot}`);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(slotRef);
      if (!snap.exists()) return;
      const mon = snap.data() as TeamPokemonDoc;
      const resolved = resolvePendingDecision({
        currentMoves: Array.isArray(mon.moves) ? mon.moves : [],
        moveHistory: mon.moveHistory ?? [],
        relearnableMoves: mon.relearnableMoves ?? [],
        pendingLearnMove: mon.pendingLearnMove ?? null,
        forgetMoveIndex,
      });

      tx.update(slotRef, {
        moves: resolved.moves,
        moveHistory: resolved.moveHistory,
        relearnableMoves: resolved.relearnableMoves,
        pendingLearnMove: resolved.pendingLearnMove,
        updatedAt: serverTimestamp(),
      });
    });

    if (character) await reloadTeamAndBox(character);
  }

  async function cancelLearnMove(slotIndex: number) {
    if (!uid || !safeCharacterId) return;
    const slot = Math.max(1, Math.min(6, Number(slotIndex || 1)));
    const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slot}`);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(slotRef);
      if (!snap.exists()) return;
      const mon = snap.data() as TeamPokemonDoc;
      const resolved = resolvePendingDecision({
        currentMoves: Array.isArray(mon.moves) ? mon.moves : [],
        moveHistory: mon.moveHistory ?? [],
        relearnableMoves: mon.relearnableMoves ?? [],
        pendingLearnMove: mon.pendingLearnMove ?? null,
        forgetMoveIndex: null,
      });

      tx.update(slotRef, {
        moves: resolved.moves,
        moveHistory: resolved.moveHistory,
        relearnableMoves: resolved.relearnableMoves,
        pendingLearnMove: resolved.pendingLearnMove,
        updatedAt: serverTimestamp(),
      });
    });

    if (character) await reloadTeamAndBox(character);
  }

  function sanitizeForBox(mon: TeamPokemonDoc | BoxPokemonDoc) {
    const out: Record<string, any> = { ...(mon as any) };
    delete out.slotIndex;
    return out;
  }

  async function moveTeamToBox(teamSlotIndex: number): Promise<ActionResult> {
    if (!uid || !safeCharacterId) return { ok: false, message: "Sessao invalida." };
    const slot = Math.max(1, Math.min(6, Number(teamSlotIndex || 1)));
    try {
      await runTransaction(db, async (tx) => {
        const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slot}`);
        const slotSnap = await tx.get(slotRef);
        if (!slotSnap.exists()) throw new Error("Pokemon do slot nao encontrado.");
        const mon = slotSnap.data() as TeamPokemonDoc;
        if (Number(mon.speciesId || 0) <= 0) throw new Error("Slot vazio.");

        const boxRef = doc(collection(db, "players", uid, "characters", safeCharacterId, "box"));
        tx.set(
          boxRef,
          {
            ...sanitizeForBox(mon),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        tx.delete(slotRef);
      });

      if (character) await reloadTeamAndBox(character);
      return { ok: true, message: "Pokemon movido para a BOX." };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Falha ao mover para BOX." };
    }
  }

  async function swapTeamWithBox(teamSlotIndex: number, boxIndex: number): Promise<ActionResult> {
    if (!uid || !safeCharacterId) return { ok: false, message: "Sessao invalida." };
    const slot = Math.max(1, Math.min(6, Number(teamSlotIndex || 1)));
    const boxMon = box[Math.max(0, Number(boxIndex || 0))];
    if (!boxMon?.id) return { ok: false, message: "Pokemon da BOX nao encontrado." };

    try {
      await runTransaction(db, async (tx) => {
        const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slot}`);
        const boxRef = doc(db, "players", uid, "characters", safeCharacterId, "box", String(boxMon.id));

        const [slotSnap, boxSnap] = await Promise.all([tx.get(slotRef), tx.get(boxRef)]);
        if (!boxSnap.exists()) throw new Error("Pokemon da BOX nao encontrado.");
        if (!slotSnap.exists()) throw new Error("Slot do time nao encontrado.");

        const teamMon = slotSnap.data() as TeamPokemonDoc;
        const fromBox = boxSnap.data() as BoxPokemonDoc;
        if (Number(fromBox.speciesId || 0) <= 0 || Number(teamMon.speciesId || 0) <= 0) {
          throw new Error("Nao foi possivel trocar com slot vazio.");
        }

        tx.set(
          slotRef,
          {
            ...sanitizeForBox(fromBox),
            slotIndex: slot,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        tx.set(
          boxRef,
          {
            ...sanitizeForBox(teamMon),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });

      if (character) await reloadTeamAndBox(character);
      return { ok: true, message: "Pokemon trocado com sucesso." };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Falha ao trocar Pokemon." };
    }
  }

  async function moveBoxToTeam(boxIndex: number, teamSlotIndex: number): Promise<ActionResult> {
    if (!uid || !safeCharacterId) return { ok: false, message: "Sessao invalida." };
    const slot = Math.max(1, Math.min(6, Number(teamSlotIndex || 1)));
    const boxMon = box[Math.max(0, Number(boxIndex || 0))];
    if (!boxMon?.id) return { ok: false, message: "Pokemon da BOX nao encontrado." };

    try {
      await runTransaction(db, async (tx) => {
        const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slot}`);
        const boxRef = doc(db, "players", uid, "characters", safeCharacterId, "box", String(boxMon.id));
        const [slotSnap, boxSnap] = await Promise.all([tx.get(slotRef), tx.get(boxRef)]);
        if (!boxSnap.exists()) throw new Error("Pokemon da BOX nao encontrado.");
        const fromBox = boxSnap.data() as BoxPokemonDoc;
        if (Number(fromBox.speciesId || 0) <= 0) throw new Error("Pokemon invalido na BOX.");

        if (slotSnap.exists()) {
          const teamMon = slotSnap.data() as TeamPokemonDoc;
          if (Number(teamMon.speciesId || 0) > 0) {
            throw new Error("Slot do time ocupado.");
          }
        }

        tx.set(
          slotRef,
          {
            ...sanitizeForBox(fromBox),
            slotIndex: slot,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        tx.delete(boxRef);
      });

      if (character) await reloadTeamAndBox(character);
      return { ok: true, message: "Pokemon movido da BOX para o time." };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Falha ao mover da BOX para o time." };
    }
  }

  async function replaceTeamWithBox(teamSlotIndex: number, boxSlotIndex: number | null): Promise<ActionResult> {
    const slot = Math.max(1, Math.min(6, Number(teamSlotIndex || 1)));
    if (boxSlotIndex === null) {
      return moveTeamToBox(slot);
    }
    const targetTeam = team[slot - 1];
    if (!targetTeam || Number(targetTeam.speciesId || 0) <= 0) {
      return moveBoxToTeam(boxSlotIndex, slot);
    }
    return swapTeamWithBox(slot, boxSlotIndex);
  }

  async function releasePokemonFromTeam(slotIndex: number): Promise<ActionResult> {
    if (!uid || !safeCharacterId) return { ok: false, message: "Sessao invalida." };
    const slot = Math.max(1, Math.min(6, Number(slotIndex || 1)));
    const aliveCount = team.filter((p) => Number(p.speciesId || 0) > 0).length;
    if (aliveCount <= 1) {
      return { ok: false, message: "Voce precisa manter ao menos 1 Pokemon no time." };
    }

    const biomeId = slugifyText(String(character?.region || ""));

    try {
      await runTransaction(db, async (tx) => {
        const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slot}`);
        const slotSnap = await tx.get(slotRef);
        if (!slotSnap.exists()) throw new Error("Pokemon nao encontrado.");
        const mon = slotSnap.data() as TeamPokemonDoc;
        if (Number(mon.speciesId || 0) <= 0) throw new Error("Slot vazio.");

        const releasedRef = doc(collection(db, "releasedPokemonPool"));
        tx.set(
          releasedRef,
          {
            speciesId: Number(mon.speciesId),
            speciesName: String(mon.speciesName || getSpeciesName(Number(mon.speciesId || 0))),
            level: Math.max(1, Number(mon.level || 1)),
            moves: Array.isArray(mon.moves) ? mon.moves.slice(0, 4) : [],
            biomeId: biomeId || null,
            region: String(character?.region || ""),
            sourceCharacterId: safeCharacterId,
            sourceUid: uid,
            isAbandoned: true,
            traumaLevel: 2,
            friendship: applyFriendshipEvent(Number(mon.friendship || FRIENDSHIP_DEFAULT), "release"),
            releaseCooldownUntilMs: Date.now() + 2 * 60 * 60 * 1000,
            expiresAtMs: Date.now() + 7 * 24 * 60 * 60 * 1000,
            status: "active",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        tx.delete(slotRef);
      });

      if (character) await reloadTeamAndBox(character);
      return { ok: true, message: "Pokemon liberado. Ele retornou ao mundo como abandonado." };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Falha ao liberar Pokemon." };
    }
  }

  async function syncExploreLeadHp(payload: { slotIndex: number; hpCurrent: number }) {
    if (!uid || !safeCharacterId) return;

    const slotIndex = Math.max(1, Math.min(6, Number(payload.slotIndex || 1)));
    const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slotIndex}`);
    const nextHp = Math.max(0, Number(payload.hpCurrent || 0));

    await runTransaction(db, async (tx) => {
      const monSnap = await tx.get(slotRef);
      if (!monSnap.exists()) return;
      const mon = monSnap.data() as TeamPokemonDoc;
      const hpTotal = Math.max(1, Number(mon.hp?.total ?? 1));
      const nextFriendship =
        nextHp <= 0
          ? applyFriendshipEvent(Number(mon.friendship || FRIENDSHIP_DEFAULT), "faint")
          : Number(mon.friendship || FRIENDSHIP_DEFAULT);
      tx.update(slotRef, {
        hp: { current: Math.min(hpTotal, nextHp), total: hpTotal },
        friendship: nextFriendship,
        updatedAt: serverTimestamp(),
      });
    });

    setTeam((prev) =>
      prev.map((p, idx) =>
        idx === slotIndex - 1
          ? {
            ...p,
            hpCurrent: Math.max(0, Math.min(Number(p.hpTotal || 1), nextHp)),
          }
          : p
      )
    );
  }

  async function syncBattleTeamHp(payload: { slotIndex: number; hpCurrent: number; hpTotal?: number }[]) {
    if (!uid || !safeCharacterId) return;
    const rows = Array.from(
      new Map(
        (Array.isArray(payload) ? payload : [])
          .map((row) => ({
            slotIndex: Math.max(1, Math.min(6, Number(row.slotIndex || 0))),
            hpCurrent: Math.max(0, Number(row.hpCurrent || 0)),
          }))
          .filter((row) => Number.isFinite(row.slotIndex) && row.slotIndex > 0)
          .map((row) => [row.slotIndex, row] as const)
      ).values()
    );
    if (!rows.length) return;

    const batch = writeBatch(db);
    for (const row of rows) {
      const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${row.slotIndex}`);
      batch.update(slotRef, {
        "hp.current": row.hpCurrent,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();

    setTeam((prev) =>
      prev.map((p, idx) => {
        const slot = idx + 1;
        const found = rows.find((row) => row.slotIndex === slot);
        if (!found) return p;
        return {
          ...p,
          hpCurrent: Math.max(0, Math.min(Number(p.hpTotal || 1), found.hpCurrent)),
        };
      })
    );
  }

  async function healTeamAtPokemonCenter() {
    if (!uid || !safeCharacterId) return;
    const aliveOrFaintedTeam = team
      .map((p, idx) => ({ p, slotIndex: idx + 1 }))
      .filter(({ p }) => Number(p.speciesId) > 0 && Number(p.hpTotal) > 0);
    if (!aliveOrFaintedTeam.length) return;

    const batch = writeBatch(db);
    for (const { p, slotIndex } of aliveOrFaintedTeam) {
      const slotRef = doc(db, "players", uid, "characters", safeCharacterId, "time", `slot_${slotIndex}`);
      const hpTotal = Math.max(1, Number(p.hpTotal || 1));
      batch.set(
        slotRef,
        {
          hp: { current: hpTotal, total: hpTotal },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();

    setTeam((prev) =>
      prev.map((p) =>
        Number(p.speciesId) > 0 && Number(p.hpTotal) > 0
          ? { ...p, hpCurrent: Math.max(1, Number(p.hpTotal || 1)) }
          : p
      )
    );
  }

  useEffect(() => {
    let isMounted = true;

    async function loadCharacter() {
      try {
        setLoading(true);
        setError(null);
        setCharacter(null);

        if (!uid) throw new Error("Usuário não autenticado.");
        if (!safeCharacterId) throw new Error("characterId não informado.");

        const currentTier = await loadPlayerType();

        const ref = doc(db, "players", uid, "characters", safeCharacterId);
        const snap = await getDoc(ref);

        if (!snap.exists()) throw new Error("Personagem não encontrado.");

        const data = snap.data() as CharacterDoc;

        if (!data?.name || !data?.region || !data?.classType || !data?.starterPokemon?.speciesName) {
          throw new Error("Dados do personagem incompletos no Firestore.");
        }

        if (!isMounted) return;
        setCharacter(data);

        await ensureCharacterSubcollections();

        // ✅ TIME + BOX VEM DO FIRESTORE
        await reloadTeamAndBox(data);
        await loadBagFromFirestore(currentTier);
        await loadEggsFromFirestore();
        await loadDaycareState(currentTier);
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

  useEffect(() => {
    if (!uid || !safeCharacterId) return;
    const timer = setInterval(() => {
      Promise.all([loadEggsFromFirestore(), loadDaycareUnlockStatus()]).catch(() => undefined);
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [uid, safeCharacterId]);

  useEffect(() => {
    if (!uid || !safeCharacterId) return;
    loadDaycareUnlockStatus().catch(() => undefined);
  }, [uid, safeCharacterId, partySpeciesIds, teamMoves]);

  useEffect(() => {
    const next = normalizeActionKey(String(activeAction));
    if (next !== "BAG") {
      setBiomeNpcAccess(null);
    }
  }, [activeAction]);

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={[COLORS.dark, "#111827"]} style={styles.bg}>
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.container}>
            {/* Top bar (MANTIDO) */}
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
                  colors={["#0B1220", "#111827"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.characterCard}
                >
                  <LinearGradient
                    colors={["rgba(59,130,246,0.35)", "rgba(167,139,250,0.20)"]}
                    style={styles.characterCardGlow}
                  />

                  <View style={styles.characterHeaderRow}>
                    {/* Avatar */}
                    <View style={styles.avatarOuter}>
                      <LinearGradient
                        colors={[COLORS.primary, COLORS.secondary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.avatarGradientFrame}
                      >
                        <View style={styles.avatarInner}>
                          {character.avatarUrl ? (
                            <Image source={{ uri: character.avatarUrl }} style={styles.avatar} />
                          ) : (
                            <View style={styles.avatarPlaceholder}>
                              <Text style={styles.avatarPlaceholderText}>
                                {character.name?.slice(0, 1)?.toUpperCase() || "?"}
                              </Text>
                            </View>
                          )}
                        </View>
                      </LinearGradient>

                      {/* VIP/FREE corrigido */}
                      <View style={[styles.vipBadge, playerType === "VIP" ? styles.vipBadgeVip : null]}>
                        <Text style={styles.vipBadgeText}>{playerType}</Text>
                      </View>
                    </View>

                    {/* Infos */}
                    <View style={styles.characterInfo}>
                      <View style={styles.characterNameRow}>
                        <Text style={styles.characterName}>{character.name}</Text>
                        <Pressable style={styles.pcBtn} onPress={() => setBoxVisible(true)}>
                          <Monitor size={16} color={COLORS.white} />
                          <Text style={styles.pcBtnText}>BOX</Text>
                        </Pressable>
                      </View>

                      <View style={styles.pillsRow}>
                        <View style={styles.pill}>
                          <Text style={styles.pillText}>{character.region}</Text>
                        </View>
                        <View style={styles.pill}>
                          <Text style={styles.pillText}>{classLabel}</Text>
                        </View>
                      </View>

                      <View style={styles.metricsRow}>
                        <View style={styles.metricBox}>
                          <Text style={styles.metricLabel}>PVP</Text>
                          <Text style={styles.metricValue}>{pvpWinRateText}</Text>
                          <Text style={styles.metricHint}>vitórias</Text>
                        </View>

                        <View style={styles.metricDivider} />

                        <View style={styles.metricBox}>
                          <Text style={styles.metricLabel}>PokeCoins</Text>
                          <Text style={styles.metricValue}>{pokeCoinsText}</Text>
                          <Text style={styles.metricHint}>saldo</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </LinearGradient>

                {/* ✅ MOCHILA NA TELA PRINCIPAL */}
                {normalizedAction === "BAG" ? (
                  <>
                    <Mochila
                      bagTab={bagTab}
                      setBagTab={setBagTab}
                      team={team}
                      box={box}
                      // ✅ callbacks que escrevem no Firestore (o modal/UX fica na Mochila)
                      onRenamePokemon={renamePokemonOnce}
                      onEvolvePokemon={evolvePokemonFromTeam}
                      onReplaceWithBox={async (teamSlotIndex, boxSlotIndex) => {
                        const result = await replaceTeamWithBox(teamSlotIndex, boxSlotIndex);
                        if (!result.ok) Alert.alert("BOX", result.message);
                      }}
                      onReleasePokemon={releasePokemonFromTeam}
                      playerType={playerType}
                      items={bagItems}
                      pokeballs={bagPokeballs}
                      itemCapacityUsed={itemCapacityUsed}
                      itemCapacityLimit={itemCapacityLimit}
                      pokeballCapacityUsed={pokeballCapacityUsed}
                      pokeballCapacityLimit={pokeballCapacityLimit}
                      currentCoins={Math.max(0, Number(character?.pokeCoins ?? 0))}
                      onUseItem={useItemFromBag}
                      onRelearnMove={relearnMoveFromTutor}
                      onTutorTeachMove={teachMoveByTutor}
                      allowRelearn={!!biomeNpcAccess?.canRelearn}
                      allowTutor={!!biomeNpcAccess?.canTutor}
                      allowedTutorType={biomeNpcAccess?.tutorType ?? null}
                    />
                    {biomeNpcAccess?.canBreeding ? (
                      <EggsPanel
                        eggs={eggs}
                        team={team}
                        daycare={{
                          active: !!daycare?.active,
                          parentSlotA: daycare?.parentSlotA ?? null,
                          parentSlotB: daycare?.parentSlotB ?? null,
                          stepsSinceLastEgg: Math.max(0, Number(daycare?.stepsSinceLastEgg || 0)),
                          eggStepThreshold: Math.max(128, Number(daycare?.eggStepThreshold || 1024)),
                          eggsGenerated: Math.max(0, Number(daycare?.eggsGenerated || 0)),
                          daycareTier: daycare?.daycareTier === "VIP" ? "VIP" : "FREE",
                          eggHatchDays: Math.max(1, Number(daycare?.eggHatchDays || DAYCARE_PROFILE_BY_TIER.FREE.eggHatchDays)),
                        }}
                        daycareUnlocked={daycareUnlocked}
                        daycareUnlockHint={daycareUnlockHint}
                        incubatorCount={incubatorCount}
                        onHatchEgg={async (eggId) => {
                          try {
                            await hatchEgg(eggId);
                            Alert.alert("Ovo", "Ovo chocado com sucesso.");
                          } catch (e: any) {
                            Alert.alert("Ovo", e?.message || "Nao foi possivel chocar o ovo.");
                          }
                        }}
                        onCreateEgg={async (slotA, slotB) => {
                          const result = await createEggFromTeamSlots(slotA, slotB);
                          Alert.alert("Breeding", result.message);
                        }}
                        onAssignIncubator={async (eggId) => {
                          const result = await assignIncubatorToEgg(eggId);
                          Alert.alert("Chocadeira", result.message);
                        }}
                        onSetDaycareParents={async (slotA, slotB) => {
                          const result = await setDaycareParents(slotA, slotB);
                          Alert.alert("Daycare", result.message);
                        }}
                        onToggleDaycare={async (active) => {
                          const result = await toggleDaycareActive(active);
                          Alert.alert("Daycare", result.message);
                        }}
                        onClearDaycare={async () => {
                          const result = await clearDaycareParents();
                          Alert.alert("Daycare", result.message);
                        }}
                      />
                    ) : null}
                  </>
                ) : normalizedAction === "EXPLORE" ? (
                  <Explorar
                    uid={uid}
                    characterId={safeCharacterId}
                    characterRegion={character?.region}
                    team={team}
                    onPokemonCenterHeal={healTeamAtPokemonCenter}
                    pokeballs={bagPokeballs}
                    onBattleTeamSync={syncBattleTeamHp}
                    onWildDefeated={grantExploreExpToLead}
                    onLeadHpChanged={syncExploreLeadHp}
                    onTryCapture={tryCaptureFromExplore}
                    onExploreSteps={async (steps) => {
                      await Promise.all([progressEggsBySteps(steps), progressDaycareBySteps(steps)]);
                    }}
                    onNpcAction={async (payload) => {
                      if (payload.role === "nurse") {
                        await healTeamAtPokemonCenter();
                        return;
                      }
                      if (payload.role === "breeder") {
                        setBiomeNpcAccess({
                          canBreeding: true,
                          canRelearn: false,
                          canTutor: false,
                          tutorType: null,
                          npcName: payload.npcName,
                          biomeId: payload.biomeId,
                        });
                        setActiveAction("BAG");
                        Alert.alert("Criador", `Acesso ao breeding habilitado via ${payload.npcName}.`);
                        return;
                      }
                      if (payload.role === "remember") {
                        setBiomeNpcAccess({
                          canBreeding: false,
                          canRelearn: true,
                          canTutor: false,
                          tutorType: null,
                          npcName: payload.npcName,
                          biomeId: payload.biomeId,
                        });
                        setBagTab("TEAM");
                        setActiveAction("BAG");
                        Alert.alert("Remember", `Acesso ao Relearner habilitado via ${payload.npcName}.`);
                        return;
                      }
                      if (payload.role === "specialist") {
                        setBiomeNpcAccess({
                          canBreeding: false,
                          canRelearn: false,
                          canTutor: true,
                          tutorType: String(payload.specialistType || "").trim().toLowerCase() || null,
                          npcName: payload.npcName,
                          biomeId: payload.biomeId,
                        });
                        setBagTab("TEAM");
                        setActiveAction("BAG");
                        Alert.alert(
                          "Especialista",
                          payload.specialistType
                            ? `Tutor de golpes tipo ${payload.specialistType} habilitado via ${payload.npcName}.`
                            : `Tutor habilitado via ${payload.npcName}.`
                        );
                      }
                    }}
                  />
                ) : normalizedAction === "BATTLES" ? (
                  <Batalhas
                    uid={uid}
                    characterId={safeCharacterId}
                    trainerName={character?.name}
                    characterRegion={character?.region}
                    team={team}
                    onBattleTeamSync={syncBattleTeamHp}
                    onNpcVictoryExp={grantExploreExpToLead}
                  />
                ) : normalizedAction === "SHOP" ? (
                  <Loja
                    uid={uid}
                    characterId={safeCharacterId}
                    currentCoins={Math.max(0, Number(character?.pokeCoins ?? 0))}
                    onCoinsChanged={(nextCoins) =>
                      setCharacter((prev) => (prev ? { ...prev, pokeCoins: nextCoins } : prev))
                    }
                    onInventoryChanged={async () => {
                      await loadBagFromFirestore();
                    }}
                  />
                ) : (
                  <Eventos />
                )}
              </>
            ) : null}

            {/* Espaço para não ficar atrás do menu */}
            <View style={{ height: 110 }} />
          </ScrollView>

          {/* MENU INFERIOR (componentizado) */}
          <GameMenu
            activeAction={activeAction}
            onChange={(key) => {
              handleMenuPress(key);
            }}
          />

          <Modal visible={boxVisible} animationType="slide" onRequestClose={() => setBoxVisible(false)}>
            <SafeAreaView style={styles.safe}>
              <LinearGradient colors={[COLORS.dark, "#111827"]} style={styles.bg}>
                <Box
                  playerType={playerType}
                  team={team}
                  box={box}
                  onClose={() => setBoxVisible(false)}
                  onMoveTeamToBox={(teamSlotIndex) => {
                    moveTeamToBox(teamSlotIndex).then((result) => {
                      if (!result.ok) Alert.alert("BOX", result.message);
                    });
                  }}
                  onSwapTeamWithBox={(teamSlotIndex, boxIndex) => {
                    swapTeamWithBox(teamSlotIndex, boxIndex).then((result) => {
                      if (!result.ok) Alert.alert("BOX", result.message);
                    });
                  }}
                  onMoveBoxToTeam={(boxIndex, teamSlotIndex) => {
                    moveBoxToTeam(boxIndex, teamSlotIndex).then((result) => {
                      if (!result.ok) Alert.alert("BOX", result.message);
                    });
                  }}
                />
              </LinearGradient>
            </SafeAreaView>
          </Modal>

          <LearnMoveModal
            visible={learnMoveVisible && !!learnMoveDoc?.pendingLearnMove}
            pokemonName={String(learnMoveDoc?.speciesName || "Pokemon")}
            newMoveId={learnMoveDoc?.pendingLearnMove ?? null}
            currentMoves={Array.isArray(learnMoveDoc?.moves) ? learnMoveDoc?.moves.slice(0, 4) : []}
            onForgetMove={async (moveIndex) => {
              if (!learnMoveSlotIndex) return;
              try {
                await confirmLearnMove(learnMoveSlotIndex, moveIndex);
              } finally {
                setLearnMoveVisible(false);
                setLearnMoveSlotIndex(null);
              }
            }}
            onCancelLearn={async () => {
              if (!learnMoveSlotIndex) return;
              try {
                await cancelLearnMove(learnMoveSlotIndex);
              } finally {
                setLearnMoveVisible(false);
                setLearnMoveSlotIndex(null);
              }
            }}
          />
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

/* ===================== UI Components ===================== */

function BagTabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.bagTabPress}>
      <LinearGradient
        colors={
          active
            ? [COLORS.primary, COLORS.secondary]
            : ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.06)"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bagTabBtn}
      >
        <Text style={[styles.bagTabText, active ? styles.bagTabTextActive : null]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function ProgressBar({
  value,
  max,
  variant,
}: {
  value: number;
  max: number;
  variant: "HP" | "EXP";
}) {
  const pct = useMemo(() => {
    if (!max || max <= 0) return 0;
    const p = Math.round((value / max) * 100);
    return Math.max(0, Math.min(100, p));
  }, [value, max]);

  return (
    <View style={styles.barTrack}>
      <View
        style={[
          styles.barFillBase,
          variant === "HP" ? styles.barFillHp : styles.barFillExp,
          { width: `${pct}%` },
        ]}
      />
    </View>
  );
}

function PokemonCard({ pokemon }: { pokemon: TeamPokemonUI }) {
  const isEmpty = pokemon.speciesId === 0;
  const isFainted = !isEmpty && Number(pokemon.hpCurrent || 0) <= 0;

  const genderSymbol = pokemon.gender === "M" ? "♂" : pokemon.gender === "F" ? "♀" : "—";
  const hpLabel = isEmpty ? "—" : `${pokemon.hpCurrent}/${pokemon.hpTotal}`;
  const expLabel = isEmpty ? "—" : `${pokemon.expCurrent}/${pokemon.expToNext}`;

  return (
    <LinearGradient
      colors={
        pokemon.isStarter
          ? ["rgba(59,130,246,0.35)", "rgba(167,139,250,0.18)"]
          : ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.05)"]
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.pokeCard, pokemon.isStarter ? styles.pokeCardStarter : null]}
    >
      <View style={styles.pokeImageWrap}>
        <LinearGradient
          colors={
            pokemon.isStarter
              ? [COLORS.primary, COLORS.secondary]
              : ["rgba(255,255,255,0.10)", "rgba(255,255,255,0.06)"]
          }
          style={styles.pokeImageFrame}
        >
          <View style={styles.pokeImageInner}>
            {!isEmpty && pokemon.spriteUrl ? (
              <Image
                source={{ uri: pokemon.spriteUrl }}
                style={[styles.pokeSprite, isFainted ? styles.pokeSpriteFainted : null]}
                resizeMode="contain"
              />
            ) : (
              <Text style={styles.pokeImageText}>{isEmpty ? "?" : String(pokemon.name).slice(0, 1).toUpperCase()}</Text>
            )}
            {isFainted ? (
              <View style={styles.faintedVeil}>
                <Text style={styles.faintedText}>DESMAIADO</Text>
              </View>
            ) : null}
          </View>
        </LinearGradient>

        {pokemon.isStarter ? (
          <View style={styles.starterBadgeInline}>
            <Text style={styles.starterBadgeText}>INICIAL</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.pokeInfo}>
        <View style={styles.pokeTopRow}>
          <Text style={styles.pokeName} numberOfLines={1}>
            {pokemon.nickname && pokemon.nickname !== "—"
              ? `${pokemon.name} (${pokemon.nickname})`
              : pokemon.name}
          </Text>

          <View style={styles.pokeMiniRight}>
            <Text style={styles.pokeLevel}>{isEmpty ? "—" : `Nv ${pokemon.level}`}</Text>
          </View>
        </View>

        <View style={styles.pokeMetaRow}>
          <Text style={styles.pokeMetaText}>{pokemon.nature || "—"}</Text>
          <Text style={styles.pokeMetaDot}>•</Text>
          <Text style={styles.pokeMetaText}>{genderSymbol}</Text>
        </View>

        <View style={styles.pokeStatBlock}>
          <View style={styles.pokeStatRow}>
            <Text style={styles.pokeStatLabel}>HP</Text>
            <Text style={styles.pokeStatValue}>{hpLabel}</Text>
          </View>
          <ProgressBar value={pokemon.hpCurrent} max={pokemon.hpTotal} variant="HP" />
        </View>

        <View style={styles.pokeStatBlock}>
          <View style={styles.pokeStatRow}>
            <Text style={styles.pokeStatLabel}>EXP</Text>
            <Text style={styles.pokeStatValue}>{expLabel}</Text>
          </View>
          <ProgressBar value={pokemon.expCurrent} max={pokemon.expToNext} variant="EXP" />
        </View>
      </View>
    </LinearGradient>
  );
}

/* ===================== Styles ===================== */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.dark },
  bg: { flex: 1 },
  container: { padding: 16, paddingBottom: 28 },

  // Top bar (MANTIDO)
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
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
  backBtnText: { color: COLORS.white, fontWeight: "700" },
  brandWrap: { alignItems: "center", justifyContent: "center", paddingTop: 4 },
  logo: { width: 142, height: 52 },

  // Loading / Error
  loadingWrap: { paddingTop: 40, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 10, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  errorWrap: {
    marginTop: 22,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  errorTitle: { color: COLORS.white, fontSize: 18, fontWeight: "800", marginBottom: 6 },
  errorText: { color: "rgba(255,255,255,0.85)", lineHeight: 20, marginBottom: 14 },
  primaryBtn: {
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: COLORS.white, fontWeight: "800" },

  // Character card
  characterCard: {
    borderRadius: 22,
    padding: 14,
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    position: "relative",
  },
  characterCardGlow: {
    position: "absolute",
    top: -40,
    left: -40,
    right: -40,
    height: 120,
    borderRadius: 999,
    opacity: 0.9,
  },
  characterHeaderRow: { flexDirection: "row", alignItems: "center" },

  avatarOuter: { width: 104, height: 104, marginRight: 12, position: "relative" },
  avatarGradientFrame: { width: "100%", height: "100%", borderRadius: 26, padding: 3 },
  avatarInner: {
    flex: 1,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  avatar: { width: "100%", height: "100%" },
  avatarPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  avatarPlaceholderText: { color: COLORS.white, fontSize: 30, fontWeight: "900" },

  vipBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  vipBadgeVip: {
    borderColor: "rgba(59,130,246,0.65)",
    backgroundColor: "rgba(59,130,246,0.18)",
  },
  vipBadgeText: { color: COLORS.white, fontWeight: "900", fontSize: 11, letterSpacing: 0.5 },

  characterInfo: { flex: 1 },
  characterNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  characterName: { color: COLORS.white, fontSize: 18, fontWeight: "900" },
  pcBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pcBtnText: { color: COLORS.white, fontWeight: "900", fontSize: 11, letterSpacing: 0.4 },
  pillsRow: { flexDirection: "row", gap: 8 as any, marginBottom: 10, flexWrap: "wrap" },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  pillText: { color: COLORS.white, fontWeight: "800", fontSize: 12 },

  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  metricBox: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  metricDivider: { width: 1, height: "100%", backgroundColor: "rgba(255,255,255,0.10)" },
  metricLabel: { color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 11, marginBottom: 3 },
  metricValue: { color: COLORS.white, fontWeight: "900", fontSize: 18 },
  metricHint: { color: "rgba(255,255,255,0.55)", fontWeight: "700", fontSize: 11, marginTop: 2 },

  // ✅ Mochila header
  bagHeader: {
    marginTop: 6,
    marginBottom: 10,
  },
  bagTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
    marginBottom: 10,
  },
  bagTabsRow: {
    flexDirection: "row",
    gap: 10 as any,
    justifyContent: "center",
  },
  bagTabPress: { borderRadius: 14, overflow: "hidden" },
  bagTabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  bagTabText: { color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  bagTabTextActive: { color: COLORS.white },

  // Placeholder blocks
  placeholderCard: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 14,
  },
  placeholderTitle: { color: COLORS.white, fontWeight: "900", marginBottom: 6 },
  placeholderText: { color: "rgba(255,255,255,0.70)", lineHeight: 18 },

  // Sections (world)
  sectionHeader: { marginTop: 6, marginBottom: 10 },
  sectionTitle: { color: COLORS.white, fontSize: 16, fontWeight: "900", marginBottom: 4 },
  sectionSubtitle: { color: "rgba(255,255,255,0.70)", lineHeight: 18 },
  worldCard: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 14,
  },
  worldEmptyTitle: { color: COLORS.white, fontWeight: "900", marginBottom: 6 },
  worldEmptyText: { color: "rgba(255,255,255,0.75)", lineHeight: 18 },

  // Pokemon Card
  pokeCard: {
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    gap: 12 as any,
  },
  pokeCardStarter: { borderColor: "rgba(167,139,250,0.35)" },

  pokeImageWrap: { width: 74, position: "relative" },
  pokeImageFrame: { width: 74, height: 74, borderRadius: 18, padding: 2 },
  pokeImageInner: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  pokeSprite: { width: "100%", height: "100%" },
  pokeSpriteFainted: { tintColor: "#9CA3AF", opacity: 0.95 },
  pokeImageText: { color: COLORS.white, fontWeight: "900", fontSize: 20 },
  faintedVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 4,
  },
  faintedText: { color: "#D1D5DB", fontWeight: "900", fontSize: 10, letterSpacing: 0.4 },

  starterBadgeInline: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  starterBadgeText: { color: COLORS.white, fontWeight: "900", fontSize: 10, letterSpacing: 0.4 },

  pokeInfo: { flex: 1 },
  pokeTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 as any, marginBottom: 4 },
  pokeName: { color: COLORS.white, fontWeight: "900", fontSize: 14, flex: 1 },
  pokeMiniRight: { alignItems: "flex-end" },
  pokeLevel: { color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 12 },

  pokeMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 as any, marginBottom: 10 },
  pokeMetaText: { color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12 },
  pokeMetaDot: { color: "rgba(255,255,255,0.35)", fontWeight: "900" },

  pokeStatBlock: { marginBottom: 10 },
  pokeStatRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  pokeStatLabel: { color: "rgba(255,255,255,0.70)", fontWeight: "900", fontSize: 11 },
  pokeStatValue: { color: COLORS.white, fontWeight: "900", fontSize: 11 },

  // Bars
  barTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  barFillBase: { height: "100%", borderRadius: 999 },
  barFillHp: { backgroundColor: "#7A0000" },
  barFillExp: { backgroundColor: "rgba(59,130,246,0.85)" },

  // ===== Bottom Nav (estilo GIF) =====
  bottomNavWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomNavShadow: { width: "100%", alignItems: "center" },
  bottomNav: {
    width: "92%",
    height: 78,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    overflow: "hidden",
    position: "relative",
  },
  navRow: {
    flex: 1,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navItem: { height: "100%", alignItems: "center", justifyContent: "center", gap: 4 as any },
  navIcon: { color: "rgba(255,255,255,0.60)", fontWeight: "900", fontSize: 18 },
  navIconActive: { color: COLORS.white },
  navLabel: { color: "rgba(255,255,255,0.55)", fontWeight: "900", fontSize: 11 },
  navLabelActive: { color: COLORS.white },

  navBubble: {
    position: "absolute",
    left: 22,
    top: -18,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  navBubbleInner: {
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.85)",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },

  // ===== Modal =====
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalWrap: { width: "100%" },
  modalCard: {
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  modalGlow: {
    position: "absolute",
    top: -40,
    left: -40,
    right: -40,
    height: 140,
    borderRadius: 999,
    opacity: 0.95,
  },
  modalTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12 as any,
  },
  modalLeft: { flex: 1 },
  modalTitle: { color: COLORS.white, fontSize: 16, fontWeight: "900" },
  modalSubtitle: { color: "rgba(255,255,255,0.70)", fontWeight: "800", marginTop: 4, fontSize: 12 },

  modalCloseBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  modalCloseText: { color: COLORS.white, fontWeight: "900" },

  modalSection: {
    marginTop: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  modalSectionTitle: { color: COLORS.white, fontWeight: "900", letterSpacing: 1, marginBottom: 10, fontSize: 12 },
  modalHint: { color: "rgba(255,255,255,0.72)", lineHeight: 18, fontWeight: "700", fontSize: 12 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 as any },
  statPill: {
    width: "31%",
    minWidth: 90,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.20)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  statLabel: { color: "rgba(255,255,255,0.70)", fontWeight: "900", fontSize: 11, marginBottom: 4 },
  statValue: { color: COLORS.white, fontWeight: "900", fontSize: 16 },

  moveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.20)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  moveName: { color: COLORS.white, fontWeight: "900" },
  moveTag: { color: "rgba(255,255,255,0.60)", fontWeight: "900", fontSize: 11 },
});


