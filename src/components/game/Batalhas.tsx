import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";

import { COLORS } from "../../theme/colors";
import { db } from "../../services/firebase/firebaseConfig";
import pokemonSpecies from "../../data/pokemon/pokemonSpecies.json";
import pokemonMoves from "../../data/pokemon/pokemonMoves.json";
import type { TeamPokemonUI } from "./types";
import type { PlayerGymDoc } from "../../services/firebase/gym.service";
import { BattleScene } from "../battle/BattleScene";
import { resolveScenarioAssetOverrides } from "../battle/remoteScenarioAssets";
import type { BattleAssetSet, BattleBackgroundKind, BattleMonster, BattleMove, BattleWeather } from "../battle/types";
import { buildBattleMove } from "../battle/moveCatalog";
import { getBattleBackSprite, getBattleFrontSprite, getSpeciesTypes, getTypeMultiplier } from "../../pokemon/PokemonSprites";

type Props = {
  uid?: string;
  characterId?: string;
  trainerName?: string;
  characterRegion?: string;
  team?: TeamPokemonUI[];
  playerGym?: PlayerGymDoc | null;
  moneyRewardMultiplier?: number;
  onBattleTeamSync?: (payload: { slotIndex: number; hpCurrent: number; hpTotal: number }[]) => Promise<void> | void;
  onNpcVictoryExp?: (payload: { speciesId: number; level: number; slotIndices: number[] }) => Promise<void> | void;
};
type Presence = {
  id: string;
  uid: string;
  characterId: string;
  trainerName: string;
  region?: string;
  updatedAt?: any;
  isGymLeader?: boolean;
  gymName?: string;
  gymType?: string;
  gymBadgeImageUrl?: string;
};
type Invite = {
  id: string;
  fromUid: string;
  fromCharacterId: string;
  fromName: string;
  toUid: string;
  toCharacterId: string;
  toName: string;
  status: "pending" | "accepted" | "declined" | "canceled";
  mode?: "pvp" | "gym_leader";
  pairKey?: string;
  gymName?: string;
  gymType?: string;
  leaderUid?: string;
  createdAt?: any;
};
type RoomTeamMember = {
  slotIndex: number;
  sourceSlotIndex: number;
  speciesId: number;
  speciesName: string;
  nickname?: string | null;
  level: number;
  hpCurrent: number;
  hpTotal: number;
  moves?: string[];
};
type BattleRoomDoc = {
  id: string;
  ownerUid: string;
  ownerCharacterId: string;
  ownerTrainerName: string;
  roomType: "open" | "closed";
  accessCode?: string | null;
  levelMin: number;
  levelMax: number;
  allowedPokemonCount: number;
  ownerTeam: RoomTeamMember[];
  challengerUid?: string | null;
  challengerCharacterId?: string | null;
  challengerTrainerName?: string | null;
  challengerTeam?: RoomTeamMember[] | null;
  ownerConfirmedAt?: any;
  challengerConfirmedAt?: any;
  expiresAtMs?: number | null;
  status: "waiting_opponent" | "waiting_confirmation" | "ready" | "in_battle" | "finished" | "cancelled" | "expired";
  createdAt?: any;
  updatedAt?: any;
};
type BattleHistoryItem = { id: string; mode: "npc" | "trainer" | "pvp" | string; result: "victory" | "defeat" | string; rewardCoins: number; npcName?: string; createdAt?: any };
type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
type Stats = Record<StatKey, number>;

const ONLINE_WINDOW_MS = 1000 * 60 * 5;
const ROOM_OPEN_EXPIRES_MS = 1000 * 60 * 30;
const ROOM_CLOSED_EXPIRES_MS = 1000 * 60 * 60;
const ROOM_CONFIRMATION_EXPIRES_MS = 1000 * 60 * 15;
const NPC_NAMES = ["Ace Kairo", "Ranger Lyra", "Veterano Orion", "Treinadora Mina", "Capitao Rho"];
const NATURES = ["Hardy", "Lonely", "Brave", "Adamant", "Naughty", "Bold", "Docile", "Relaxed", "Impish", "Lax", "Timid", "Hasty", "Serious", "Jolly", "Naive", "Modest", "Mild", "Quiet", "Bashful", "Rash", "Calm", "Gentle", "Sassy", "Careful", "Quirky"];
const NATURE_FX: Record<string, { up?: Exclude<StatKey, "hp">; down?: Exclude<StatKey, "hp"> }> = {
  Hardy: {}, Lonely: { up: "atk", down: "def" }, Brave: { up: "atk", down: "spe" }, Adamant: { up: "atk", down: "spa" }, Naughty: { up: "atk", down: "spd" },
  Bold: { up: "def", down: "atk" }, Docile: {}, Relaxed: { up: "def", down: "spe" }, Impish: { up: "def", down: "spa" }, Lax: { up: "def", down: "spd" },
  Timid: { up: "spe", down: "atk" }, Hasty: { up: "spe", down: "def" }, Serious: {}, Jolly: { up: "spe", down: "spa" }, Naive: { up: "spe", down: "spd" },
  Modest: { up: "spa", down: "atk" }, Mild: { up: "spa", down: "def" }, Quiet: { up: "spa", down: "spe" }, Bashful: {}, Rash: { up: "spa", down: "spd" },
  Calm: { up: "spd", down: "atk" }, Gentle: { up: "spd", down: "def" }, Sassy: { up: "spd", down: "spe" }, Careful: { up: "spd", down: "spa" }, Quirky: {},
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const randomBetween = (min: number, max: number) => Math.min(min, max) + Math.floor(Math.random() * (Math.abs(max - min) + 1));

function tsToMs(ts: any) {
  if (!ts) return 0;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  return 0;
}

function fmtDate(ts: any) {
  try {
    if (!ts) return "-";
    if (typeof ts?.toDate === "function") return ts.toDate().toLocaleString("pt-BR");
    if (typeof ts?.seconds === "number") return new Date(ts.seconds * 1000).toLocaleString("pt-BR");
    return "-";
  } catch {
    return "-";
  }
}

function speciesEntry(speciesId: number): any | null {
  const list = Array.isArray(pokemonSpecies) ? (pokemonSpecies as any[]) : Object.values(pokemonSpecies as any);
  return list.find((p) => n(p?.id ?? p?.speciesId) === speciesId) ?? null;
}

function speciesBaseStats(speciesId: number): Stats | null {
  const e = speciesEntry(speciesId);
  if (!e) return null;
  const s = e.baseStats ?? e.stats;
  if (!s) return null;
  return { hp: n(s.hp), atk: n(s.atk ?? s.attack), def: n(s.def ?? s.defense), spa: n(s.spa ?? s.specialAttack), spd: n(s.spd ?? s.specialDefense), spe: n(s.spe ?? s.speed) };
}

function speciesName(speciesId: number): string {
  return String(speciesEntry(speciesId)?.name || `#${speciesId}`);
}

function natureMultiplier(nature: string, stat: Exclude<StatKey, "hp">) {
  const fx = NATURE_FX[nature] || {};
  if (fx.up === stat) return 1.1;
  if (fx.down === stat) return 0.9;
  return 1;
}

function calcStats(level: number, base: Stats, nature: string): Stats {
  const lv = Math.max(1, level);
  const hp = Math.floor(((2 * base.hp) * lv) / 100) + lv + 10;
  const other = (s: Exclude<StatKey, "hp">) => Math.floor((Math.floor(((2 * base[s]) * lv) / 100) + 5) * natureMultiplier(nature, s));
  return { hp, atk: other("atk"), def: other("def"), spa: other("spa"), spd: other("spd"), spe: other("spe") };
}

function movesAtLevel(speciesId: number, level: number): string[] {
  try {
    const data: any = pokemonMoves;
    const byKey = data?.[String(speciesId)];
    const raw = Array.isArray(byKey?.moves) ? byKey.moves : Array.isArray(byKey) ? byKey : [];
    const learned = raw.map((m: any) => ({ id: String(m.moveId || m.id || m.name || m.moveName || ""), lv: n(m.level ?? m.levelLearnedAt) })).filter((m: any) => m.id && m.lv > 0 && m.lv <= level).sort((a: any, b: any) => a.lv - b.lv);
    const out: string[] = [];
    for (let i = learned.length - 1; i >= 0; i--) {
      if (!out.includes(learned[i].id)) out.unshift(learned[i].id);
      if (out.length >= 4) break;
    }
    return out.length ? out : ["tackle", "quick-attack"];
  } catch {
    return ["tackle", "quick-attack"];
  }
}

function toBattleMove(id: string): BattleMove {
  return buildBattleMove(id);
}

function toBattleMonFromPlayer(mon: TeamPokemonUI, slotIndex: number): BattleMonster | null {
  const sid = n(mon.speciesId);
  if (sid <= 0) return null;
  const base = speciesBaseStats(sid);
  if (!base) return null;
  const level = Math.max(1, n(mon.level || 1));
  const nature = NATURES[randomBetween(0, NATURES.length - 1)] || "Docile";
  const stats = calcStats(level, base, nature);
  const hpTotal = Math.max(1, n(mon.hpTotal ?? stats.hp));
  const hpCurrent = clamp(n(mon.hpCurrent ?? hpTotal), 0, hpTotal);
  const movesRaw = Array.isArray((mon as any)?.moves) && (mon as any).moves.length ? (mon as any).moves : movesAtLevel(sid, level);
  return {
    id: `player-${slotIndex}-${sid}`,
    speciesId: sid,
    name: String(mon.nickname || mon.name || speciesName(sid)),
    level,
    hpCurrent,
    hpTotal,
    stats: { ...stats, hp: hpTotal },
    types: getSpeciesTypes(sid),
    sprite: { front: getBattleFrontSprite(sid), back: getBattleBackSprite(sid) },
    moves: movesRaw.slice(0, 4).map(toBattleMove),
    slotIndex,
    expCurrent: Math.max(0, n((mon as any)?.expCurrent ?? 0)),
    expToNext: Math.max(1, n((mon as any)?.expToNext ?? 100)),
    expTotal: Math.max(0, n((mon as any)?.expTotal ?? (mon as any)?.expCurrent ?? 0)),
    abilityId: (mon as any)?.abilityId ?? null,
    heldItemId: (mon as any)?.heldItemId ?? (mon as any)?.itemId ?? null,
  };
}

function buildEnemyFromSpecies(speciesId: number, level: number, label?: string): BattleMonster | null {
  const base = speciesBaseStats(speciesId);
  if (!base) return null;
  const nature = NATURES[randomBetween(0, NATURES.length - 1)] || "Docile";
  const stats = calcStats(level, base, nature);
  const hpTotal = Math.max(1, stats.hp);
  return {
    id: `enemy-${speciesId}-${level}`,
    speciesId,
    name: label || speciesName(speciesId),
    level,
    hpCurrent: hpTotal,
    hpTotal,
    stats: { ...stats, hp: hpTotal },
    types: getSpeciesTypes(speciesId),
    sprite: { front: getBattleFrontSprite(speciesId), back: getBattleBackSprite(speciesId) },
    moves: movesAtLevel(speciesId, level).slice(0, 4).map(toBattleMove),
    abilityId: null,
    heldItemId: null,
  };
}

function buildNpcTeam(playerTeam: TeamPokemonUI[], difficultyScore = 0) {
  const alive = (playerTeam || []).filter((m) => n(m.speciesId) > 0 && n(m.level) > 0);
  const avg = alive.length ? Math.round(alive.reduce((a, b) => a + n(b.level), 0) / alive.length) : 5;
  const score = Math.max(0, Math.trunc(difficultyScore));
  const tier = Math.floor(score / 2);
  const count = Math.max(1, Math.min(6, Math.max(1, Math.min(3, alive.length || 1)) + Math.floor(score / 3)));
  const pool = (Array.isArray(pokemonSpecies) ? (pokemonSpecies as any[]) : Object.values(pokemonSpecies as any))
    .filter((p: any) => !p?.flags?.legendary && !p?.flags?.mythical && n(p?.id ?? p?.speciesId) > 0)
    .map((p: any) => Math.trunc(n(p?.id ?? p?.speciesId)));
  const used = new Set<number>();
  const out: BattleMonster[] = [];
  for (let i = 0; i < count; i++) {
    let sid = pool[randomBetween(0, Math.max(0, pool.length - 1))] || 25;
    let guard = 0;
    while (used.has(sid) && guard < 20) {
      sid = pool[randomBetween(0, Math.max(0, pool.length - 1))] || 25;
      guard++;
    }
    used.add(sid);
    const lvBoost = Math.min(22, score * 2);
    const lvMin = Math.max(2, avg - 2 + lvBoost + tier);
    const lvMax = Math.max(lvMin + 1, avg + 4 + lvBoost + tier * 2);
    const lv = Math.max(2, randomBetween(lvMin, lvMax));
    const mon = buildEnemyFromSpecies(sid, lv);
    if (mon) out.push(mon);
  }
  return out;
}

type BattleModeKey = "trainer" | "pvp";

function pickBattleBackgroundByTypes(types: string[]): BattleBackgroundKind {
  const t = types.map((x) => String(x || "").toLowerCase());
  if (t.includes("water") || t.includes("ice")) return randomBetween(0, 1) === 0 ? "beach" : "forest";
  if (t.includes("rock") || t.includes("ground") || t.includes("steel")) return "cave";
  if (t.includes("electric") || t.includes("normal")) return randomBetween(0, 1) === 0 ? "city" : "grasslands";
  if (t.includes("ghost") || t.includes("dark")) return randomBetween(0, 1) === 0 ? "cave" : "city";
  if (t.includes("grass") || t.includes("bug")) return "forest";
  return randomBetween(0, 2) === 0 ? "grasslands" : randomBetween(0, 1) === 0 ? "forest" : "city";
}

function slugifyText(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildInvitePairKey(uidA: string, charA: string, uidB: string, charB: string, mode: string) {
  const a = `${String(uidA || "").trim()}_${String(charA || "").trim()}`;
  const b = `${String(uidB || "").trim()}_${String(charB || "").trim()}`;
  return [a, b].sort().join("__") + `__${String(mode || "pvp").trim().toLowerCase()}`;
}

function buildRoomAccessCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function resolveRoomExpirationMs(roomType: "open" | "closed") {
  return Date.now() + (roomType === "closed" ? ROOM_CLOSED_EXPIRES_MS : ROOM_OPEN_EXPIRES_MS);
}

function roomStatusLabel(status: BattleRoomDoc["status"]) {
  switch (status) {
    case "waiting_opponent":
      return "Aguardando desafiante";
    case "waiting_confirmation":
      return "Aguardando confirmacao";
    case "ready":
      return "Pronta";
    case "in_battle":
      return "Em batalha";
    case "finished":
      return "Finalizada";
    case "cancelled":
      return "Cancelada";
    case "expired":
      return "Expirada";
    default:
      return status;
  }
}

function normalizeRoomTeamSelection(teamRows: TeamPokemonUI[], selectedSlots: number[]) {
  const uniqueSlots = Array.from(new Set(selectedSlots.map((value) => Math.max(1, Math.floor(Number(value || 0))))));
  return uniqueSlots
    .map((slotIndex) => {
      const row = teamRows[slotIndex - 1];
      if (!row || n(row.speciesId) <= 0 || n(row.level) <= 0) return null;
      return {
        slotIndex: uniqueSlots.indexOf(slotIndex) + 1,
        sourceSlotIndex: slotIndex,
        speciesId: Math.max(1, n(row.speciesId)),
        speciesName: String((row as any).speciesName || row.name || `#${row.speciesId}`),
        nickname: String((row as any).nickname || row.name || "") || null,
        level: Math.max(1, n(row.level)),
        hpCurrent: Math.max(0, n((row as any).hpCurrent ?? (row as any).hp?.current ?? 0)),
        hpTotal: Math.max(1, n((row as any).hpTotal ?? (row as any).hp?.total ?? 1)),
        moves: Array.isArray((row as any).moves) ? (row as any).moves.slice(0, 4) : [],
      };
    })
    .filter(Boolean) as RoomTeamMember[];
}

function roomTeamToBattleMon(teamRows: RoomTeamMember[]) {
  return teamRows
    .map((row) =>
      buildEnemyFromSpecies(row.speciesId, row.level, String(row.nickname || row.speciesName || `#${row.speciesId}`))
    )
    .filter(Boolean)
    .map((mon, index) => ({
      ...mon!,
      hpCurrent: Math.max(0, teamRows[index]?.hpCurrent || mon!.hpCurrent),
      hpTotal: Math.max(1, teamRows[index]?.hpTotal || mon!.hpTotal),
      slotIndex: index + 1,
      moves: (teamRows[index]?.moves || []).length ? (teamRows[index].moves || []).map(toBattleMove) : mon!.moves,
    })) as BattleMonster[];
}

function inviteModeLabel(inv: Invite) {
  return inv.mode === "gym_leader" ? "Desafio de lider" : "Convite PvP";
}

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

export function Batalhas({
  uid,
  characterId,
  trainerName,
  characterRegion,
  team = [],
  playerGym = null,
  moneyRewardMultiplier = 1,
  onBattleTeamSync,
  onNpcVictoryExp,
}: Props) {
  const [online, setOnline] = useState<Presence[]>([]);
  const [incoming, setIncoming] = useState<Invite[]>([]);
  const [sent, setSent] = useState<Invite[]>([]);
  const [searchNameText, setSearchNameText] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Presence[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [history, setHistory] = useState<BattleHistoryItem[]>([]);
  const [battleRooms, setBattleRooms] = useState<BattleRoomDoc[]>([]);
  const [myRoom, setMyRoom] = useState<BattleRoomDoc | null>(null);
  const [roomType, setRoomType] = useState<"open" | "closed">("open");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [roomLevelMin, setRoomLevelMin] = useState("1");
  const [roomLevelMax, setRoomLevelMax] = useState("100");
  const [roomPokemonCount, setRoomPokemonCount] = useState("3");
  const [selectedRoomTeam, setSelectedRoomTeam] = useState<number[]>([]);
  const [selectedJoinTeam, setSelectedJoinTeam] = useState<number[]>([]);

  const [battleVisible, setBattleVisible] = useState(false);
  const [battleMode, setBattleMode] = useState<BattleModeKey>("trainer");
  const [battleBg, setBattleBg] = useState<BattleBackgroundKind>("grasslands");
  const [battleLabel, setBattleLabel] = useState("Batalha");
  const [battleBiomeAssets, setBattleBiomeAssets] = useState<BattleAssetSet | null>(null);
  const [battleBiomeWeather, setBattleBiomeWeather] = useState<BattleWeather>("none");
  const [playerBattleTeam, setPlayerBattleTeam] = useState<BattleMonster[]>([]);
  const [enemyBattleTeam, setEnemyBattleTeam] = useState<BattleMonster[]>([]);
  const [resultPersisted, setResultPersisted] = useState(false);

  const meName = useMemo(() => String(trainerName || "").trim() || "Treinador", [trainerName]);
  const onlineGymLeaders = useMemo(
    () => online.filter((entry) => entry.isGymLeader && entry.gymName && entry.gymType),
    [online]
  );
  const incomingGymChallenges = useMemo(
    () => incoming.filter((inv) => inv.mode === "gym_leader"),
    [incoming]
  );

  async function persistBattleResult(mode: BattleModeKey, result: "victory" | "defeat", enemyName?: string) {
    if (!uid || !characterId || resultPersisted) return;
    setResultPersisted(true);
    const baseReward = result === "victory" ? (mode === "pvp" ? 90 : 60) : 10;
    const reward = Math.max(1, Math.round(baseReward * Math.max(1, Number(moneyRewardMultiplier || 1))));
    try {
      const charRef = doc(db, "players", uid, "characters", characterId);
      const histRef = doc(collection(db, "players", uid, "characters", characterId, "battleHistory"));
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(charRef);
        const data = snap.exists() ? (snap.data() as any) : {};
        const pokeCoins = Math.max(0, n(data?.pokeCoins));
        tx.set(charRef, { pokeCoins: pokeCoins + reward, updatedAt: serverTimestamp() }, { merge: true });
        tx.set(histRef, {
          mode,
          result,
          rewardCoins: reward,
          npcName: enemyName || null,
          playerName: meName,
          createdAt: serverTimestamp(),
        });
      });
    } catch {
      setResultPersisted(false);
    }
  }

  useEffect(() => {
    const biomeId = slugifyText(String(characterRegion || ""));
    if (!biomeId) {
      setBattleBiomeAssets(null);
      setBattleBiomeWeather("none");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const directRef = doc(db, "biomes", biomeId);
        const directSnap = await getDoc(directRef);
        if (directSnap.exists()) {
          const data = directSnap.data() as Record<string, unknown>;
          if (!cancelled) {
            let finalAssets = normalizeBattleAssets(data.battleAssets);
            const scenarios = Array.isArray(data.battleScenarios) ? data.battleScenarios : [];
            if (scenarios.length > 0) {
              const r = scenarios[randomBetween(0, scenarios.length - 1)];
              const sAssets = await resolveScenarioAssetOverrides(String(r));
              if (sAssets) {
                finalAssets = { ...finalAssets, ...sAssets };
              }
            }
            setBattleBiomeAssets(finalAssets);
            setBattleBiomeWeather(normalizeWeather(data.battleWeather ?? data.weather));
          }
          return;
        }
        const allSnap = await getDocs(collection(db, "biomes"));
        let found: Record<string, unknown> | null = null;
        for (const d of allSnap.docs) {
          const row = d.data() as Record<string, unknown>;
          const byId = slugifyText(String(row.id || d.id));
          const byName = slugifyText(String(row.name || ""));
          if (biomeId === byId || biomeId === byName) {
            found = row;
            break;
          }
        }
        if (!cancelled && found) {
          let finalAssets = normalizeBattleAssets(found.battleAssets);
          const scenarios = Array.isArray(found.battleScenarios) ? found.battleScenarios : [];
          if (scenarios.length > 0) {
            const r = scenarios[randomBetween(0, scenarios.length - 1)];
            const sAssets = await resolveScenarioAssetOverrides(String(r));
            if (sAssets) {
              finalAssets = { ...finalAssets, ...sAssets };
            }
          }
          setBattleBiomeAssets(finalAssets);
          setBattleBiomeWeather(normalizeWeather(found.battleWeather ?? found.weather));
        }
      } catch {
        if (!cancelled) {
          setBattleBiomeAssets(null);
          setBattleBiomeWeather("none");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterRegion]);

  useEffect(() => {
    if (!uid || !characterId) return;
    const presenceId = `${uid}_${characterId}`;
    const presenceRef = doc(db, "battlePresence", presenceId);
    const payload = {
      uid,
      characterId,
      trainerName: meName,
      region: characterRegion || "",
      online: true,
      isGymLeader: Boolean(playerGym?.active),
      gymName: playerGym?.active ? playerGym.name || "" : "",
      gymType: playerGym?.active ? playerGym.gymType || "" : "",
      gymBadgeImageUrl: playerGym?.active ? playerGym.primaryBadgeImageUrl || "" : "",
      updatedAt: serverTimestamp(),
    };
    setDoc(presenceRef, payload, { merge: true }).catch(() => { });
    const ticker = setInterval(() => setDoc(presenceRef, payload, { merge: true }).catch(() => { }), 45000);
    return () => {
      clearInterval(ticker);
      setDoc(presenceRef, { online: false, updatedAt: serverTimestamp() }, { merge: true }).catch(() => { });
    };
  }, [uid, characterId, meName, characterRegion, playerGym?.active, playerGym?.name, playerGym?.gymType, playerGym?.primaryBadgeImageUrl]);

  useEffect(() => {
    if (!uid || !characterId) return;
    const qOnline = query(collection(db, "battlePresence"), where("online", "==", true), orderBy("updatedAt", "desc"), limit(30));
    const unsubOnline = onSnapshot(qOnline, (snap) => {
      const now = Date.now();
      const out: Presence[] = [];
      snap.forEach((d) => {
        const v = d.data() as any;
        if (!v?.uid || !v?.characterId) return;
        if (String(v.uid) === uid && String(v.characterId) === characterId) return;
        if (tsToMs(v.updatedAt) > 0 && now - tsToMs(v.updatedAt) > ONLINE_WINDOW_MS) return;
        out.push({
          id: d.id,
          uid: String(v.uid),
          characterId: String(v.characterId),
          trainerName: String(v.trainerName || "Treinador"),
          region: String(v.region || ""),
          updatedAt: v.updatedAt,
          isGymLeader: Boolean(v.isGymLeader),
          gymName: String(v.gymName || ""),
          gymType: String(v.gymType || ""),
          gymBadgeImageUrl: String(v.gymBadgeImageUrl || ""),
        });
      });
      setOnline(out);
    }, () => setOnline([]));

    const qIncoming = query(collection(db, "battleInvites"), where("toUid", "==", uid), where("status", "==", "pending"));
    const unsubIncoming = onSnapshot(qIncoming, (snap) => {
      const out: Invite[] = [];
      snap.forEach((d) => out.push({ id: d.id, ...(d.data() as any) }));
      setIncoming(out);
    }, () => setIncoming([]));

    const qSent = query(collection(db, "battleInvites"), where("fromUid", "==", uid), where("status", "==", "pending"));
    const unsubSent = onSnapshot(qSent, (snap) => {
      const out: Invite[] = [];
      snap.forEach((d) => out.push({ id: d.id, ...(d.data() as any) }));
      setSent(out);
    }, () => setSent([]));

    return () => {
      unsubOnline();
      unsubIncoming();
      unsubSent();
    };
  }, [uid, characterId]);

  useEffect(() => {
    if (!uid || !characterId) return;
    const qRooms = query(collection(db, "battleRooms"), orderBy("createdAt", "desc"), limit(20));
    const unsub = onSnapshot(
      qRooms,
      (snap) => {
        const now = Date.now();
        const rows = snap.docs
          .map((row) => ({ id: row.id, ...(row.data() as Omit<BattleRoomDoc, "id">) }))
          .filter((room) => {
            const expiresAtMs = Number(room.expiresAtMs || 0);
            const canManageRoom = String(room.ownerUid || "") === uid || String(room.challengerUid || "") === uid;
            if (
              expiresAtMs > 0 &&
              now >= expiresAtMs &&
              ["waiting_opponent", "waiting_confirmation", "ready"].includes(String(room.status || ""))
            ) {
              if (canManageRoom) {
                void updateDoc(doc(db, "battleRooms", room.id), {
                  status: "expired",
                  updatedAt: serverTimestamp(),
                }).catch(() => {});
              }
              return false;
            }
            const activeStatuses = ["waiting_opponent", "waiting_confirmation", "ready", "in_battle"];
            if (!activeStatuses.includes(String(room.status || ""))) return false;
            if (String(room.ownerUid || "") === uid) return true;
            if (String(room.challengerUid || "") === uid) return true;
            return room.status === "waiting_opponent";
          });
        setBattleRooms(rows);
        setMyRoom(
          rows.find(
            (room) =>
              (String(room.ownerUid || "") === uid && String(room.ownerCharacterId || "") === characterId) ||
              (String(room.challengerUid || "") === uid && String(room.challengerCharacterId || "") === characterId)
          ) || null
        );
      },
      () => {
        setBattleRooms([]);
        setMyRoom(null);
      }
    );
    return () => unsub();
  }, [uid, characterId]);

  useEffect(() => {
    if (!uid || !characterId) return;
    const qHist = query(collection(db, "players", uid, "characters", characterId, "battleHistory"), orderBy("createdAt", "desc"), limit(12));
    const unsub = onSnapshot(qHist, (snap) => {
      const out: BattleHistoryItem[] = [];
      snap.forEach((d) => out.push({ id: d.id, ...(d.data() as any) }));
      setHistory(out);
    }, () => setHistory([]));
    return () => unsub();
  }, [uid, characterId]);

  async function sendInvite(
    target: { uid: string; characterId: string; trainerName: string; gymName?: string; gymType?: string },
    mode: "pvp" | "gym_leader" = "pvp"
  ) {
    if (!uid || !characterId) return;
    if (target.uid === uid && target.characterId === characterId) return;
    const pairKey = buildInvitePairKey(uid, characterId, target.uid, target.characterId, mode);
    const hasPendingPair = [...incoming, ...sent].some((inv) => inv.status === "pending" && inv.pairKey === pairKey);
    if (hasPendingPair) {
      Alert.alert("Batalhas", "Ja existe um desafio pendente entre esses jogadores.");
      return;
    }
    setBusyId(`${target.uid}_${target.characterId}`);
    try {
      await addDoc(collection(db, "battleInvites"), {
        fromUid: uid,
        fromCharacterId: characterId,
        fromName: meName,
        toUid: target.uid,
        toCharacterId: target.characterId,
        toName: target.trainerName,
        status: "pending",
        mode,
        pairKey,
        gymName: mode === "gym_leader" ? String(target.gymName || "") : "",
        gymType: mode === "gym_leader" ? String(target.gymType || "") : "",
        leaderUid: mode === "gym_leader" ? target.uid : "",
        createdAt: serverTimestamp(),
      });
      Alert.alert(
        "Batalhas",
        mode === "gym_leader"
          ? `Desafio enviado para o lider ${target.trainerName}.`
          : `Convite enviado para ${target.trainerName}.`
      );
    } catch (e: any) {
      Alert.alert("Batalhas", e?.message || "Nao foi possivel enviar convite.");
    } finally {
      setBusyId(null);
    }
  }

  async function respondInvite(inv: Invite, accept: boolean) {
    setBusyId(inv.id);
    try {
      await updateDoc(doc(db, "battleInvites", inv.id), { status: accept ? "accepted" : "declined", respondedAt: serverTimestamp() });
      if (accept) {
        await addDoc(collection(db, "battleRooms"), {
          type: inv.mode === "gym_leader" ? "gym" : "pvp",
          status: "open",
          ownerUid: uid,
          gymName: inv.gymName || null,
          gymType: inv.gymType || null,
          battleMode: inv.mode || "pvp",
          createdAt: serverTimestamp(),
          players: [
            { uid: inv.fromUid, characterId: inv.fromCharacterId, trainerName: inv.fromName },
            { uid: inv.toUid, characterId: inv.toCharacterId, trainerName: inv.toName },
          ],
        });
        Alert.alert(
          "Batalhas",
          inv.mode === "gym_leader"
            ? `Desafio de GYM iniciado: ${inv.fromName} vs ${inv.toName}`
            : `Batalha iniciada: ${inv.fromName} vs ${inv.toName}`
        );
      }
    } catch (e: any) {
      Alert.alert("Batalhas", e?.message || "Falha ao responder convite.");
    } finally {
      setBusyId(null);
    }
  }

  async function searchAndInvite() {
    const target = String(searchNameText || "").trim();
    if (!target) return;
    setSearching(true);
    try {
      const qPresence = query(collection(db, "battlePresence"), where("trainerName", "==", target), where("online", "==", true), limit(5));
      const snap = await getDocs(qPresence);
      const out: Presence[] = [];
      snap.forEach((d) => {
        const v = d.data() as any;
        const puid = String(v?.uid || "");
        const pchar = String(v?.characterId || "");
        if (!puid || !pchar) return;
        if (puid === uid && pchar === characterId) return;
        out.push({
          id: d.id,
          uid: puid,
          characterId: pchar,
          trainerName: String(v?.trainerName || target),
          region: String(v?.region || ""),
          isGymLeader: Boolean(v?.isGymLeader),
          gymName: String(v?.gymName || ""),
          gymType: String(v?.gymType || ""),
          gymBadgeImageUrl: String(v?.gymBadgeImageUrl || ""),
        });
      });
      setSearchResults(out);
      if (!out.length) Alert.alert("Batalhas", "Nenhum treinador encontrado com esse nome.");
    } catch (e: any) {
      Alert.alert("Batalhas", e?.message || "Falha ao buscar treinador.");
    } finally {
      setSearching(false);
    }
  }

  async function createBattleRoom() {
    if (!uid || !characterId) return;
    const allowedPokemonCount = Math.max(1, Math.min(6, Math.floor(Number(roomPokemonCount || 1))));
    const levelMin = Math.max(1, Math.floor(Number(roomLevelMin || 1)));
    const levelMax = Math.max(levelMin, Math.min(100, Math.floor(Number(roomLevelMax || levelMin))));
    const ownerTeam = normalizeRoomTeamSelection(team, selectedRoomTeam);
    if (ownerTeam.length !== allowedPokemonCount) {
      Alert.alert("Batalhas", `Selecione exatamente ${allowedPokemonCount} Pokemon para criar a sala.`);
      return;
    }
    if (ownerTeam.some((entry) => entry.level < levelMin || entry.level > levelMax)) {
      Alert.alert("Batalhas", "Todos os Pokemon precisam respeitar a faixa de nivel da sala.");
      return;
    }
    setBusyId("room-create");
    try {
      await addDoc(collection(db, "battleRooms"), {
        ownerUid: uid,
        ownerCharacterId: characterId,
        ownerTrainerName: meName,
        roomType,
        accessCode: roomType === "closed" ? buildRoomAccessCode() : null,
        levelMin,
        levelMax,
        allowedPokemonCount,
        ownerTeam,
        challengerUid: null,
        challengerCharacterId: null,
        challengerTrainerName: null,
        challengerTeam: null,
        ownerConfirmedAt: null,
        challengerConfirmedAt: null,
        expiresAtMs: resolveRoomExpirationMs(roomType),
        status: "waiting_opponent",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSelectedRoomTeam([]);
      Alert.alert("Batalhas", "Sala criada com sucesso.");
    } catch (e: any) {
      Alert.alert("Batalhas", e?.message || "Falha ao criar sala.");
    } finally {
      setBusyId(null);
    }
  }

  async function joinBattleRoom(room: BattleRoomDoc) {
    if (!uid || !characterId) return;
    const requiredCount = Math.max(1, Math.min(6, Number(room.allowedPokemonCount || 1)));
    const challengerTeam = normalizeRoomTeamSelection(team, selectedJoinTeam);
    if (challengerTeam.length !== requiredCount) {
      Alert.alert("Batalhas", `Selecione exatamente ${requiredCount} Pokemon para entrar na sala.`);
      return;
    }
    if (challengerTeam.some((entry) => entry.level < Number(room.levelMin || 1) || entry.level > Number(room.levelMax || 100))) {
      Alert.alert("Batalhas", "Seu time precisa respeitar a faixa de nivel da sala.");
      return;
    }
    if (room.roomType === "closed" && room.accessCode && roomCodeInput.trim().toUpperCase() !== String(room.accessCode).toUpperCase()) {
      Alert.alert("Batalhas", "Codigo da sala invalido.");
      return;
    }
    setBusyId(room.id);
    try {
      await updateDoc(doc(db, "battleRooms", room.id), {
        challengerUid: uid,
        challengerCharacterId: characterId,
        challengerTrainerName: meName,
        challengerTeam,
        ownerConfirmedAt: null,
        challengerConfirmedAt: null,
        expiresAtMs: Date.now() + ROOM_CONFIRMATION_EXPIRES_MS,
        status: "waiting_confirmation",
        updatedAt: serverTimestamp(),
      });
      setSelectedJoinTeam([]);
      setRoomCodeInput("");
      Alert.alert("Batalhas", "Entrada confirmada. Agora os dois jogadores precisam confirmar a sala.");
    } catch (e: any) {
      Alert.alert("Batalhas", e?.message || "Falha ao entrar na sala.");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmBattleRoom(room: BattleRoomDoc) {
    if (!uid) return;
    const amOwner = String(room.ownerUid || "") === uid;
    const amChallenger = String(room.challengerUid || "") === uid;
    if (!amOwner && !amChallenger) return;
    const ownerAlreadyConfirmed = Boolean(room.ownerConfirmedAt);
    const challengerAlreadyConfirmed = Boolean(room.challengerConfirmedAt);
    const nextStatus =
      (amOwner && challengerAlreadyConfirmed) || (amChallenger && ownerAlreadyConfirmed)
        ? "ready"
        : "waiting_confirmation";
    setBusyId(`confirm-${room.id}`);
    try {
      await updateDoc(doc(db, "battleRooms", room.id), {
        ownerConfirmedAt: amOwner ? serverTimestamp() : room.ownerConfirmedAt || null,
        challengerConfirmedAt: amChallenger ? serverTimestamp() : room.challengerConfirmedAt || null,
        expiresAtMs: Date.now() + ROOM_CONFIRMATION_EXPIRES_MS,
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      Alert.alert(
        "Batalhas",
        nextStatus === "ready"
          ? "As duas equipes foram confirmadas. A sala esta pronta para iniciar."
          : "Sua equipe foi confirmada. Aguardando o outro jogador."
      );
    } catch (e: any) {
      Alert.alert("Batalhas", e?.message || "Falha ao confirmar a sala.");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelBattleRoom(room: BattleRoomDoc) {
    if (!uid) return;
    if (String(room.ownerUid || "") !== uid) return;
    setBusyId(`cancel-${room.id}`);
    try {
      await updateDoc(doc(db, "battleRooms", room.id), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });
      Alert.alert("Batalhas", "Sala cancelada.");
    } catch (e: any) {
      Alert.alert("Batalhas", e?.message || "Falha ao cancelar a sala.");
    } finally {
      setBusyId(null);
    }
  }

  async function openRoomBattle(room: BattleRoomDoc) {
    const ownerTeam = roomTeamToBattleMon(room.ownerTeam || []);
    const challengerTeam = roomTeamToBattleMon(room.challengerTeam || []);
    if (String(room.status || "") !== "ready" || !room.ownerConfirmedAt || !room.challengerConfirmedAt) {
      Alert.alert("Batalhas", "A sala ainda nao foi confirmada pelos dois jogadores.");
      return;
    }
    if (!ownerTeam.length || !challengerTeam.length) {
      Alert.alert("Batalhas", "A sala ainda nao possui dois times validos.");
      return;
    }
    const amOwner = String(room.ownerUid || "") === uid;
    const localTeam = amOwner ? ownerTeam : challengerTeam;
    const remoteTeam = amOwner ? challengerTeam : ownerTeam;
    setResultPersisted(false);
    setBattleMode("pvp");
    setBattleBg("city");
    setBattleLabel(`Sala PvP ${room.ownerTrainerName} vs ${room.challengerTrainerName || "Desafiante"}`);
    setPlayerBattleTeam(localTeam);
    setEnemyBattleTeam(remoteTeam);
    setBattleVisible(true);
    await updateDoc(doc(db, "battleRooms", room.id), {
      status: "in_battle",
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  function startScene(mode: BattleModeKey) {
    const playerReady = (team || []).map((m, i) => toBattleMonFromPlayer(m, i + 1)).filter(Boolean) as BattleMonster[];
    if (!playerReady.length) {
      Alert.alert("Batalhas", "Voce precisa de ao menos um Pokemon no time.");
      return;
    }
    if (!playerReady.some((m) => m.hpCurrent > 0)) {
      Alert.alert("Batalhas", "Nenhum Pokemon vivo no time. Cure seus Pokemon antes de batalhar.");
      return;
    }
    setResultPersisted(false);
    setPlayerBattleTeam(playerReady);

    if (mode === "pvp") {
      const rival = online[0];
      const enemy = buildNpcTeam(team).map((m) => ({ ...m, name: `${rival?.trainerName || "Rival"} ${m.name}` }));
      setBattleMode("pvp");
      setBattleBg("city");
      setBattleLabel(`PvP ${meName} vs ${rival?.trainerName || "Rival"}`);
      setEnemyBattleTeam(enemy.length ? enemy : buildNpcTeam(team));
      setBattleVisible(true);
      return;
    }

    const npcName = NPC_NAMES[randomBetween(0, NPC_NAMES.length - 1)];
    const npcVictories = history.filter((h) => (h.mode === "npc" || h.mode === "trainer") && h.result === "victory").length;
    const enemy = buildNpcTeam(team, npcVictories);
    setBattleMode("trainer");
    setBattleBg(pickBattleBackgroundByTypes(enemy[0]?.types || ["normal"]));
    setBattleLabel(`${npcName} desafiou voce`);
    setEnemyBattleTeam(enemy);
    setBattleVisible(true);
  }

  return (
    <View style={styles.wrap}>
      <LinearGradient colors={["rgba(239,68,68,0.20)", "rgba(59,130,246,0.12)", "rgba(255,255,255,0.04)"]} style={styles.hero}>
        <Text style={styles.title}>Batalhas</Text>
        <Text style={styles.text}>Trainer continua direto. PvP agora acontece apenas pelas salas criadas abaixo.</Text>
      </LinearGradient>

      <View style={styles.modeRow}>
        <Pressable style={styles.modeBtn} onPress={() => startScene("trainer")}><Text style={styles.modeTitle}>Trainer</Text><Text style={styles.modeMeta}>Batalha NPC progressiva</Text></Pressable>
        <View style={styles.modeBtn}><Text style={styles.modeTitle}>PvP em salas</Text><Text style={styles.modeMeta}>Crie, entre, confirme e inicie pela propria sala</Text></View>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Criar sala PvP</Text>
        <View style={styles.actionsRow}>
          <Pressable style={[styles.miniBtn, roomType === "open" ? styles.acceptBtn : null]} onPress={() => setRoomType("open")}>
            <Text style={styles.miniBtnText}>Aberta</Text>
          </Pressable>
          <Pressable style={[styles.miniBtn, roomType === "closed" ? styles.acceptBtn : null]} onPress={() => setRoomType("closed")}>
            <Text style={styles.miniBtnText}>Fechada</Text>
          </Pressable>
        </View>
        <View style={styles.actionsRow}>
          <TextInput value={roomLevelMin} onChangeText={setRoomLevelMin} placeholder="Nivel min" placeholderTextColor="rgba(255,255,255,0.45)" style={[styles.input, { flex: 1 }]} keyboardType="numeric" />
          <TextInput value={roomLevelMax} onChangeText={setRoomLevelMax} placeholder="Nivel max" placeholderTextColor="rgba(255,255,255,0.45)" style={[styles.input, { flex: 1 }]} keyboardType="numeric" />
          <TextInput value={roomPokemonCount} onChangeText={setRoomPokemonCount} placeholder="Qtd" placeholderTextColor="rgba(255,255,255,0.45)" style={[styles.input, { flex: 1 }]} keyboardType="numeric" />
        </View>
        {(team || []).map((mon, index) => {
          if (n(mon.speciesId) <= 0 || n(mon.level) <= 0) return null;
          const slotIndex = index + 1;
          const selected = selectedRoomTeam.includes(slotIndex);
          return (
            <Pressable
              key={`room-team-${slotIndex}`}
              style={[styles.itemRow, selected ? styles.histWin : null]}
              onPress={() =>
                setSelectedRoomTeam((current) =>
                  current.includes(slotIndex) ? current.filter((value) => value !== slotIndex) : [...current, slotIndex]
                )
              }
            >
              <Text style={styles.itemText}>{(mon as any).nickname || mon.name || speciesName(n(mon.speciesId))}</Text>
              <Text style={styles.textMuted}>Lv {n(mon.level)} • Slot {slotIndex}</Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.cta} onPress={createBattleRoom} disabled={busyId === "room-create"}>
          <Text style={styles.ctaText}>{busyId === "room-create" ? "Criando..." : "Criar sala"}</Text>
        </Pressable>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Salas PvP</Text>
        {!battleRooms.length ? <Text style={styles.textMuted}>Nenhuma sala ativa no momento.</Text> : null}
        {battleRooms.map((room) => {
          const amOwner = String(room.ownerUid || "") === uid;
          const amChallenger = String(room.challengerUid || "") === uid;
          return (
            <View key={room.id} style={styles.block}>
              <Text style={styles.itemText}>{room.ownerTrainerName}</Text>
              {room.expiresAtMs ? <Text style={styles.textMuted}>Expira em: {new Date(room.expiresAtMs).toLocaleTimeString("pt-BR")}</Text> : null}
              <Text style={styles.textMuted}>
                {room.roomType === "closed" ? "Fechada" : "Aberta"} • Niveis {room.levelMin}-{room.levelMax} • {room.allowedPokemonCount} Pokemon • {roomStatusLabel(room.status)}
              </Text>
              {room.roomType === "closed" && amOwner && room.accessCode ? (
                <Text style={styles.textMuted}>Codigo: {room.accessCode}</Text>
              ) : null}
              {!amOwner && !amChallenger && room.status === "waiting_opponent" ? (
                <>
                  {room.roomType === "closed" ? (
                    <TextInput value={roomCodeInput} onChangeText={setRoomCodeInput} placeholder="Codigo da sala" placeholderTextColor="rgba(255,255,255,0.45)" style={styles.input} />
                  ) : null}
                  {(team || []).map((mon, index) => {
                    if (n(mon.speciesId) <= 0 || n(mon.level) <= 0) return null;
                    const slotIndex = index + 1;
                    const selected = selectedJoinTeam.includes(slotIndex);
                    return (
                      <Pressable
                        key={`join-team-${room.id}-${slotIndex}`}
                        style={[styles.itemRow, selected ? styles.histWin : null]}
                        onPress={() =>
                          setSelectedJoinTeam((current) =>
                            current.includes(slotIndex) ? current.filter((value) => value !== slotIndex) : [...current, slotIndex]
                          )
                        }
                      >
                        <Text style={styles.itemText}>{(mon as any).nickname || mon.name || speciesName(n(mon.speciesId))}</Text>
                        <Text style={styles.textMuted}>Lv {n(mon.level)} • Slot {slotIndex}</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable style={styles.cta} onPress={() => joinBattleRoom(room)} disabled={busyId === room.id}>
                    <Text style={styles.ctaText}>{busyId === room.id ? "Entrando..." : "Entrar na sala"}</Text>
                  </Pressable>
                </>
              ) : null}
              {(amOwner || amChallenger) && room.status === "waiting_confirmation" ? (
                <>
                  <Text style={styles.textMuted}>
                    {amOwner
                      ? room.ownerConfirmedAt
                        ? "Sua equipe ja foi confirmada. Aguardando o desafiante."
                        : "Confirme sua equipe para liberar a batalha."
                      : room.challengerConfirmedAt
                      ? "Sua equipe ja foi confirmada. Aguardando o criador."
                      : "Confirme sua equipe para liberar a batalha."}
                  </Text>
                  <Pressable
                    style={styles.cta}
                    onPress={() => confirmBattleRoom(room)}
                    disabled={busyId === `confirm-${room.id}` || (amOwner ? Boolean(room.ownerConfirmedAt) : Boolean(room.challengerConfirmedAt))}
                  >
                    <Text style={styles.ctaText}>
                      {busyId === `confirm-${room.id}`
                        ? "Confirmando..."
                        : amOwner
                        ? room.ownerConfirmedAt
                          ? "Equipe confirmada"
                          : "Confirmar equipe"
                        : room.challengerConfirmedAt
                        ? "Equipe confirmada"
                        : "Confirmar equipe"}
                    </Text>
                  </Pressable>
                </>
              ) : null}
              {(amOwner || amChallenger) && room.status === "ready" ? (
                <Pressable style={styles.cta} onPress={() => openRoomBattle(room)}>
                  <Text style={styles.ctaText}>Iniciar batalha da sala</Text>
                </Pressable>
              ) : null}
              {amOwner && ["waiting_opponent", "waiting_confirmation", "ready"].includes(room.status) ? (
                <Pressable
                  style={[styles.cta, { borderColor: "rgba(239,68,68,0.55)", backgroundColor: "rgba(239,68,68,0.16)" }]}
                  onPress={() => cancelBattleRoom(room)}
                  disabled={busyId === `cancel-${room.id}`}
                >
                  <Text style={styles.ctaText}>{busyId === `cancel-${room.id}` ? "Cancelando..." : "Cancelar sala"}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      <ScrollView style={{ maxHeight: 290 }}>
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Historico de Batalhas</Text>
          {!history.length ? <Text style={styles.textMuted}>Sem batalhas registradas.</Text> : null}
          {history.map((h) => (
            <View key={`hist-${h.id}`} style={styles.histRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemText}>{h.mode === "npc" ? `NPC: ${h.npcName || "Treinador NPC"}` : h.mode?.toUpperCase?.() || "Batalha"}</Text>
                <Text style={styles.textMuted}>{fmtDate(h.createdAt)}</Text>
              </View>
              <View style={styles.histRight}>
                <Text style={[styles.histBadge, h.result === "victory" ? styles.histWin : styles.histLose]}>{h.result === "victory" ? "Vitoria" : "Derrota"}</Text>
                <Text style={styles.ppText}>+{Math.max(0, n(h.rewardCoins))} moedas</Text>
              </View>
            </View>
          ))}
        </View>

        {false ? (
          <>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Desafiar Lider de GYM</Text>
          {!onlineGymLeaders.length ? <Text style={styles.textMuted}>Nenhum lider de GYM online no momento.</Text> : null}
          {onlineGymLeaders.map((leader) => (
            <View key={`gym-${leader.id}`} style={styles.itemRow}>
              <View style={styles.gymLeaderInfo}>
                {leader.gymBadgeImageUrl ? <Image source={{ uri: leader.gymBadgeImageUrl }} style={styles.badgePreview} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemText}>{leader.trainerName}</Text>
                  <Text style={styles.textMuted}>{leader.gymName} • {String(leader.gymType || "").toUpperCase()}</Text>
                </View>
              </View>
              <Pressable
                style={styles.miniBtn}
                onPress={() => sendInvite(leader, "gym_leader")}
                disabled={busyId === `${leader.uid}_${leader.characterId}`}
              >
                <Text style={styles.miniBtnText}>Desafiar</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Jogadores online</Text>
          {!online.length ? <Text style={styles.textMuted}>Nenhum jogador online no momento.</Text> : null}
          {online.map((p) => (
            <View key={`on-${p.id}`} style={styles.itemRow}>
              <Text style={styles.itemText}>{p.trainerName}</Text>
              <Pressable style={styles.miniBtn} onPress={() => sendInvite(p)} disabled={busyId === `${p.uid}_${p.characterId}`}><Text style={styles.miniBtnText}>Convidar</Text></Pressable>
            </View>
          ))}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Convites recebidos</Text>
          {!incoming.length ? <Text style={styles.textMuted}>Sem convites pendentes.</Text> : null}
          {incoming.map((inv) => (
            <View key={`in-${inv.id}`} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemText}>{inv.fromName}</Text>
                <Text style={styles.textMuted}>
                  {inviteModeLabel(inv)}
                  {inv.mode === "gym_leader" && inv.gymName ? ` • ${inv.gymName}` : ""}
                </Text>
              </View>
              <View style={styles.actionsRow}>
                <Pressable style={styles.acceptBtn} onPress={() => respondInvite(inv, true)} disabled={busyId === inv.id}><Text style={styles.miniBtnText}>Aceitar</Text></Pressable>
                <Pressable style={styles.declineBtn} onPress={() => respondInvite(inv, false)} disabled={busyId === inv.id}><Text style={styles.miniBtnText}>Recusar</Text></Pressable>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Convites enviados</Text>
          {!sent.length ? <Text style={styles.textMuted}>Sem convites ativos.</Text> : null}
          {sent.map((inv) => (
            <View key={`se-${inv.id}`} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemText}>{inv.toName}</Text>
                <Text style={styles.textMuted}>
                  {inviteModeLabel(inv)}
                  {inv.mode === "gym_leader" && inv.gymType ? ` • ${String(inv.gymType).toUpperCase()}` : ""}
                </Text>
              </View>
              <Text style={styles.textMuted}>Pendente</Text>
            </View>
          ))}
        </View>
          </>
        ) : null}
      </ScrollView>

      <BattleScene
        visible={battleVisible && playerBattleTeam.length > 0 && enemyBattleTeam.length > 0}
        mode={battleMode}
        backgroundKind={battleBg}
        battleAssets={battleBiomeAssets}
        initialFieldState={{
          weather: battleMode === "pvp" ? "none" : battleBiomeWeather,
          weatherTurns: battleMode === "pvp" || battleBiomeWeather === "none" ? 0 : 5,
        }}
        playerTeam={playerBattleTeam}
        enemyTeam={enemyBattleTeam}
        initialPlayerIndex={Math.max(0, playerBattleTeam.findIndex((p) => p.hpCurrent > 0))}
        initialEnemyIndex={0}
        canRun={battleMode !== "pvp"}
        canUseBag={false}
        typeMultiplier={getTypeMultiplier}
        onTryCapture={async () => ({ ok: false, message: "Captura disponivel apenas no Explore." })}
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

          if (result === "victory" && enemyTeam.length) {
            const topEnemy = enemyTeam[0];
            try {
              await onNpcVictoryExp?.({
                speciesId: Math.max(1, n(topEnemy.speciesId)),
                level: Math.max(1, n(topEnemy.level)),
                slotIndices: participants.length ? participants : [1],
              });
            } catch {
              // ignore
            }
            await persistBattleResult(battleMode, "victory", battleLabel);
          } else if (result === "defeat" || result === "ran") {
            await persistBattleResult(battleMode, "defeat", battleLabel);
          }
          if (battleMode === "pvp" && myRoom?.id) {
            await updateDoc(doc(db, "battleRooms", myRoom.id), {
              status: "finished",
              updatedAt: serverTimestamp(),
            }).catch(() => {});
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
  wrap: { borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", padding: 14, gap: 12 },
  hero: { borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  title: { color: COLORS.white, fontWeight: "900", marginBottom: 6, fontSize: 16 },
  text: { color: "rgba(255,255,255,0.78)", lineHeight: 18, fontWeight: "700" },
  textMuted: { color: "rgba(255,255,255,0.62)", fontWeight: "700", fontSize: 12 },
  modeRow: { flexDirection: "row", gap: 8 },
  modeBtn: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", backgroundColor: "rgba(255,255,255,0.05)", padding: 10, gap: 4 },
  modeTitle: { color: COLORS.white, fontWeight: "900", fontSize: 13 },
  modeMeta: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "700" },
  searchBox: { gap: 8 },
  input: { borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", backgroundColor: "rgba(255,255,255,0.05)", color: COLORS.white, paddingHorizontal: 10, paddingVertical: 9, fontWeight: "700" },
  cta: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(59,130,246,0.55)", backgroundColor: "rgba(59,130,246,0.16)", alignItems: "center" },
  ctaText: { color: COLORS.white, fontWeight: "900", fontSize: 12 },
  block: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.04)", padding: 10, gap: 8, marginBottom: 10 },
  blockTitle: { color: COLORS.white, fontWeight: "900", fontSize: 13 },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  gymLeaderInfo: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  badgePreview: { width: 28, height: 28, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)" },
  itemText: { color: "rgba(255,255,255,0.88)", fontWeight: "800", flex: 1 },
  miniBtn: { borderRadius: 9, paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: "rgba(59,130,246,0.6)", backgroundColor: "rgba(59,130,246,0.18)" },
  acceptBtn: { borderRadius: 9, paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: "rgba(16,185,129,0.70)", backgroundColor: "rgba(16,185,129,0.22)" },
  declineBtn: { borderRadius: 9, paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: "rgba(239,68,68,0.70)", backgroundColor: "rgba(239,68,68,0.22)" },
  miniBtnText: { color: COLORS.white, fontWeight: "900", fontSize: 11 },
  actionsRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  ppText: { color: "rgba(255,255,255,0.72)", fontSize: 10, fontWeight: "700" },
  histRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", paddingHorizontal: 8, paddingVertical: 6 },
  histRight: { alignItems: "flex-end", gap: 3 },
  histBadge: { fontSize: 11, fontWeight: "900", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, color: COLORS.white },
  histWin: { backgroundColor: "rgba(16,185,129,0.35)", borderWidth: 1, borderColor: "rgba(16,185,129,0.65)" },
  histLose: { backgroundColor: "rgba(239,68,68,0.28)", borderWidth: 1, borderColor: "rgba(239,68,68,0.60)" },
});
