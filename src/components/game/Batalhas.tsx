import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";

import { COLORS } from "../../theme/colors";
import { db } from "../../services/firebase/firebaseConfig";
import pokemonSpecies from "../../data/pokemon/pokemonSpecies.json";
import pokemonMoves from "../../data/pokemon/pokemonMoves.json";
import type { TeamPokemonUI } from "./types";
import { BattleScene } from "../battle/BattleScene";
import type { BattleAssetSet, BattleBackgroundKind, BattleMonster, BattleMove, BattleWeather } from "../battle/types";
import { buildBattleMove } from "../battle/moveCatalog";
import { getScenarioAssets } from "../battle/scenarioAssets";
import { getBattleBackSprite, getBattleFrontSprite, getSpeciesTypes, getTypeMultiplier } from "../../pokemon/PokemonSprites";

type Props = {
  uid?: string;
  characterId?: string;
  trainerName?: string;
  characterRegion?: string;
  team?: TeamPokemonUI[];
  onBattleTeamSync?: (payload: { slotIndex: number; hpCurrent: number; hpTotal: number }[]) => Promise<void> | void;
  onNpcVictoryExp?: (payload: { speciesId: number; level: number; slotIndices: number[] }) => Promise<void> | void;
};
type Presence = { id: string; uid: string; characterId: string; trainerName: string; region?: string; updatedAt?: any };
type Invite = { id: string; fromUid: string; fromCharacterId: string; fromName: string; toUid: string; toCharacterId: string; toName: string; status: "pending" | "accepted" | "declined" | "canceled"; createdAt?: any };
type BattleHistoryItem = { id: string; mode: "npc" | "trainer" | "pvp" | string; result: "victory" | "defeat" | string; rewardCoins: number; npcName?: string; createdAt?: any };
type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
type Stats = Record<StatKey, number>;

const ONLINE_WINDOW_MS = 1000 * 60 * 5;
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

export function Batalhas({ uid, characterId, trainerName, characterRegion, team = [], onBattleTeamSync, onNpcVictoryExp }: Props) {
  const [online, setOnline] = useState<Presence[]>([]);
  const [incoming, setIncoming] = useState<Invite[]>([]);
  const [sent, setSent] = useState<Invite[]>([]);
  const [searchNameText, setSearchNameText] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Presence[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [history, setHistory] = useState<BattleHistoryItem[]>([]);

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

  async function persistBattleResult(mode: BattleModeKey, result: "victory" | "defeat", enemyName?: string) {
    if (!uid || !characterId || resultPersisted) return;
    setResultPersisted(true);
    const reward = result === "victory" ? (mode === "pvp" ? 90 : 60) : 10;
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
              const sAssets = getScenarioAssets(String(r));
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
            const sAssets = getScenarioAssets(String(r));
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
    setDoc(presenceRef, { uid, characterId, trainerName: meName, online: true, updatedAt: serverTimestamp() }, { merge: true }).catch(() => { });
    const ticker = setInterval(() => setDoc(presenceRef, { online: true, trainerName: meName, updatedAt: serverTimestamp() }, { merge: true }).catch(() => { }), 45000);
    return () => {
      clearInterval(ticker);
      setDoc(presenceRef, { online: false, updatedAt: serverTimestamp() }, { merge: true }).catch(() => { });
    };
  }, [uid, characterId, meName]);

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
        out.push({ id: d.id, uid: String(v.uid), characterId: String(v.characterId), trainerName: String(v.trainerName || "Treinador"), region: String(v.region || ""), updatedAt: v.updatedAt });
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
    const qHist = query(collection(db, "players", uid, "characters", characterId, "battleHistory"), orderBy("createdAt", "desc"), limit(12));
    const unsub = onSnapshot(qHist, (snap) => {
      const out: BattleHistoryItem[] = [];
      snap.forEach((d) => out.push({ id: d.id, ...(d.data() as any) }));
      setHistory(out);
    }, () => setHistory([]));
    return () => unsub();
  }, [uid, characterId]);

  async function sendInvite(target: { uid: string; characterId: string; trainerName: string }) {
    if (!uid || !characterId) return;
    if (target.uid === uid && target.characterId === characterId) return;
    setBusyId(`${target.uid}_${target.characterId}`);
    try {
      await addDoc(collection(db, "battleInvites"), { fromUid: uid, fromCharacterId: characterId, fromName: meName, toUid: target.uid, toCharacterId: target.characterId, toName: target.trainerName, status: "pending", createdAt: serverTimestamp() });
      Alert.alert("Batalhas", `Convite enviado para ${target.trainerName}.`);
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
          type: "pvp",
          status: "open",
          ownerUid: uid,
          createdAt: serverTimestamp(),
          players: [
            { uid: inv.fromUid, characterId: inv.fromCharacterId, trainerName: inv.fromName },
            { uid: inv.toUid, characterId: inv.toCharacterId, trainerName: inv.toName },
          ],
        });
        Alert.alert("Batalhas", `Batalha iniciada: ${inv.fromName} vs ${inv.toName}`);
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
        out.push({ id: d.id, uid: puid, characterId: pchar, trainerName: String(v?.trainerName || target), region: String(v?.region || "") });
      });
      setSearchResults(out);
      if (!out.length) Alert.alert("Batalhas", "Nenhum treinador encontrado com esse nome.");
    } catch (e: any) {
      Alert.alert("Batalhas", e?.message || "Falha ao buscar treinador.");
    } finally {
      setSearching(false);
    }
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
        <Text style={styles.text}>Escolha o modo e enfrente no mesmo BattleScene com regras diferentes.</Text>
      </LinearGradient>

      <View style={styles.modeRow}>
        <Pressable style={styles.modeBtn} onPress={() => startScene("trainer")}><Text style={styles.modeTitle}>Trainer</Text><Text style={styles.modeMeta}>Batalha NPC progressiva</Text></Pressable>
        <Pressable style={styles.modeBtn} onPress={() => startScene("pvp")}><Text style={styles.modeTitle}>PvP</Text><Text style={styles.modeMeta}>Duelo online/local</Text></Pressable>
      </View>

      <View style={styles.searchBox}>
        <TextInput value={searchNameText} onChangeText={setSearchNameText} placeholder="Nome do treinador" placeholderTextColor="rgba(255,255,255,0.45)" style={styles.input} />
        <Pressable style={styles.cta} onPress={searchAndInvite} disabled={searching}><Text style={styles.ctaText}>{searching ? "Buscando..." : "Buscar e convidar"}</Text></Pressable>
      </View>

      {searchResults.length ? (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Resultado da busca</Text>
          {searchResults.map((p) => (
            <View key={`sr-${p.id}`} style={styles.itemRow}>
              <Text style={styles.itemText}>{p.trainerName}</Text>
              <Pressable style={styles.miniBtn} onPress={() => sendInvite(p)} disabled={busyId === `${p.uid}_${p.characterId}`}><Text style={styles.miniBtnText}>Convidar</Text></Pressable>
            </View>
          ))}
        </View>
      ) : null}

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
              <Text style={styles.itemText}>{inv.fromName}</Text>
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
              <Text style={styles.itemText}>{inv.toName}</Text>
              <Text style={styles.textMuted}>Pendente</Text>
            </View>
          ))}
        </View>
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
