import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import pokemonSpecies from "../../data/pokemon/pokemonSpecies.json";
import { db } from "./firebaseConfig";
import type { PlayerProductEntitlement } from "./monetization.service";
import { isEntitlementActive, parseMetadataString, parseMetadataStringList } from "../monetization/runtime.service";
import { normalizeBadgeRecord } from "./badge.service";
import { normalizeGymScenarioRecord } from "./scenario.service";
import { biomeAllowsGym } from "./biome.service";

export type GymSourceType = "ticket";
export type GymStatus = "active" | "blocked" | "expired" | "em_batalha" | "removed";

export type PlayerGymNpcState = {
  nurse: boolean;
  police: boolean;
  additionalNpcCount: number;
};

export type PlayerGymUpgradeState = {
  policeUnlocked: boolean;
  additionalNpcCount: number;
  storageSlotsAdded: number;
  mainTeamSlotsAdded: number;
  badgeCountAdded: number;
};

export type PlayerGymDoc = {
  id: string;
  ownerUid: string;
  ownerCharacterId: string;
  ownerCharacterName?: string | null;
  name: string;
  gymType: string;
  scenarioThemeId: string;
  primaryBadgeId?: string | null;
  primaryBadgeName?: string | null;
  primaryBadgeDescription?: string | null;
  primaryBadgeImageUrl?: string | null;
  primaryBadgeBonusType?: string | null;
  primaryBadgeBonusValue?: number | null;
  sourceType: GymSourceType;
  sourceEntitlementId?: string | null;
  biomeId?: string | null;
  ticketMode?: "permanent" | "temporary" | null;
  expiresAtMs?: number | null;
  blockedAtMs?: number | null;
  status: GymStatus;
  approved: boolean;
  active: boolean;
  xpBonusPercent: number;
  storageLimit: number;
  storageCount: number;
  mainTeamSlotLimit: number;
  totalSlots?: number;
  extraSlotsApplied?: number;
  mainTeamCount: number;
  challengeQueueCount?: number;
  badgeCount: number;
  assignedNpcIds?: string[];
  assignedNpcCount?: number;
  linkedNpcId?: string | null;
  linkedNpcName?: string | null;
  linkedNpcRole?: string | null;
  linkedNpcImageUrl?: string | null;
  activeNpcs: PlayerGymNpcState;
  upgrades: PlayerGymUpgradeState;
  policeInterceptPrepared: boolean;
  initialEggSpeciesId?: number | null;
  initialEggGrantedAtMs?: number | null;
  createdAtMs?: number | null;
  updatedAtMs?: number | null;
};

export type GymRosterEntry = {
  id: string;
  slotOrder?: number | null;
  sourceCollection: "time" | "box";
  sourceDocId: string;
  sourceCharacterId: string;
  speciesId: number;
  speciesName: string;
  level: number;
  pokemonTypes: string[];
  nickname?: string | null;
  nature?: string | null;
  hpCurrent?: number | null;
  hpTotal?: number | null;
  expCurrent?: number | null;
  expToNext?: number | null;
  isStarter?: boolean | null;
  spriteUrl?: string | null;
  createdAtMs?: number | null;
  updatedAtMs?: number | null;
};

export type GymAssignedNpcEntry = {
  id: string;
  npcId: string;
  name: string;
  role: string;
  imageUrl?: string | null;
  appearanceRate?: number | null;
  isCommercialized: boolean;
  ecoinPrice?: number | null;
  createdAtMs?: number | null;
  updatedAtMs?: number | null;
};

type CreateGymInput = {
  uid: string;
  characterId: string;
  characterName?: string | null;
  biomeId: string;
  gymName: string;
  gymType: string;
  scenarioThemeId: string;
  primaryBadgeId: string;
  creationEntitlement: PlayerProductEntitlement;
  initialMainTeam: Array<{
    sourceCollection: "time" | "box";
    sourceDocId: string;
  }>;
  linkedNpcId?: string | null;
};

type ApplyGymUpgradeInput = {
  uid: string;
  characterId: string;
  entitlement: PlayerProductEntitlement;
};

export type PlayerGymUpgradeCredits = {
  availableMainTeamSlotCredits: number;
};

type AddGymPokemonInput = {
  uid: string;
  characterId: string;
  sourceCollection: "time" | "box";
  sourceDocId: string;
};

function toLower(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function speciesList() {
  return Array.isArray(pokemonSpecies) ? pokemonSpecies : Object.values(pokemonSpecies as Record<string, unknown>);
}

function getSpeciesEntry(speciesId: number) {
  return speciesList().find((row: any) => Number(row?.id ?? row?.speciesId) === Number(speciesId)) as any;
}

function getSpeciesTypes(speciesId: number) {
  const entry = getSpeciesEntry(speciesId);
  const types = Array.isArray(entry?.types) ? entry.types : [];
  return types.map((value: unknown) => toLower(value)).filter(Boolean);
}

function getTypePoolSpeciesIds(gymType: string) {
  const normalizedType = toLower(gymType);
  return speciesList()
    .filter((row: any) => {
      const types = Array.isArray(row?.types) ? row.types.map((value: unknown) => toLower(value)) : [];
      const flags = row?.flags || {};
      if (!types.includes(normalizedType)) return false;
      if (Boolean(flags.legendary) || Boolean(flags.mythical)) return false;
      return true;
    })
    .map((row: any) => Math.max(1, Number(row?.id ?? row?.speciesId ?? 0)))
    .filter((value: number) => value > 0);
}

function buildInitialGymState() {
  return {
    storageLimit: 50,
    mainTeamSlotLimit: 1,
    badgeCount: 0,
    activeNpcs: {
      nurse: true,
      police: false,
      additionalNpcCount: 0,
    },
  };
}

function buildRosterEntryId(sourceCollection: "time" | "box", sourceDocId: string) {
  return `${sourceCollection}_${String(sourceDocId || "").trim()}`;
}

export function buildGymRosterEntryId(sourceCollection: "time" | "box", sourceDocId: string) {
  return buildRosterEntryId(sourceCollection, sourceDocId);
}

function normalizeGymDoc(id: string, data: Omit<PlayerGymDoc, "id">): PlayerGymDoc {
  const rawStatus = String(data.status || "").trim().toLowerCase();
  const expiresAtMs = toNumber(data.expiresAtMs, 0);
  const expiredByTime = expiresAtMs > 0 && expiresAtMs < Date.now();
  const status: GymStatus =
    rawStatus === "em_batalha" || rawStatus === "blocked" || rawStatus === "expired" || rawStatus === "removed" || rawStatus === "active"
      ? (rawStatus as GymStatus)
      : "active";
  const effectiveStatus = expiredByTime && status === "active" ? "blocked" : status;
  return {
    id,
    ...data,
    ticketMode: data.ticketMode || (expiresAtMs > 0 ? "temporary" : "permanent"),
    status: effectiveStatus,
    active: effectiveStatus === "active" || effectiveStatus === "em_batalha",
    totalSlots: Math.max(1, Math.min(6, Number(data.totalSlots || data.mainTeamSlotLimit || 1))),
    extraSlotsApplied: Math.max(0, Number(data.extraSlotsApplied || Math.max(0, Number(data.mainTeamSlotLimit || 1) - 1))),
    storageLimit: Math.max(1, Number(data.storageLimit || 50)),
    mainTeamSlotLimit: Math.max(1, Math.min(6, Number(data.mainTeamSlotLimit || data.totalSlots || 1))),
  };
}

function resolveGymTicketConfiguration(entitlement: PlayerProductEntitlement | null | undefined) {
  if (!entitlement) return null;
  const productType = toLower(entitlement.productType);
  const metadata = entitlement.benefits?.metadata || {};
  const ticketSubtype = toLower(metadata.ticketSubtype || metadata.ticketType);
  if (productType !== "gym_ticket" && !(productType === "ticket" && ticketSubtype === "gym")) {
    return null;
  }
  const gymMode = toLower(metadata.gymTicketMode) === "temporary" ? "temporary" : "permanent";
  const gymDurationDays =
    gymMode === "temporary" ? Math.max(1, Math.floor(toNumber(metadata.gymDurationDays, 1))) : null;
  return { gymMode, gymDurationDays };
}

export function findStandaloneGymTicket(entitlements: PlayerProductEntitlement[]) {
  return entitlements.find(
    (entry) => isEntitlementActive(entry) && !entry.claimedAt && Boolean(resolveGymTicketConfiguration(entry))
  ) ?? null;
}

export async function getPlayerGym(uid: string) {
  const snap = await getDoc(doc(db, "gyms", uid));
  if (!snap.exists()) return null;
  return normalizeGymDoc(snap.id, snap.data() as Omit<PlayerGymDoc, "id">);
}

export async function getGymById(gymId: string) {
  const normalizedId = String(gymId || "").trim();
  if (!normalizedId) return null;
  const snap = await getDoc(doc(db, "gyms", normalizedId));
  if (!snap.exists()) return null;
  return normalizeGymDoc(snap.id, snap.data() as Omit<PlayerGymDoc, "id">);
}

export function listenPlayerGym(uid: string, cb: (gym: PlayerGymDoc | null) => void) {
  return onSnapshot(doc(db, "gyms", uid), (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    cb(normalizeGymDoc(snap.id, snap.data() as Omit<PlayerGymDoc, "id">));
  });
}

export function listenPlayerGymByCharacter(
  uid: string,
  ownerCharacterId: string,
  cb: (gym: PlayerGymDoc | null) => void
) {
  const normalizedCharacterId = String(ownerCharacterId || "").trim();
  return listenPlayerGym(uid, (gym) => {
    if (!gym) {
      cb(null);
      return;
    }
    if (!normalizedCharacterId || String(gym.ownerCharacterId || "").trim() !== normalizedCharacterId) {
      cb(null);
      return;
    }
    cb(gym);
  });
}

export function listenGymStorage(uid: string, cb: (rows: GymRosterEntry[]) => void) {
  return onSnapshot(query(collection(db, "gyms", uid, "storage"), orderBy("createdAtMs", "asc")), (snap) => {
    cb(
      snap.docs.map((row) => ({
        id: row.id,
        ...(row.data() as Omit<GymRosterEntry, "id">),
      }))
    );
  });
}

export function listenGymMainTeam(uid: string, cb: (rows: GymRosterEntry[]) => void) {
  return onSnapshot(query(collection(db, "gyms", uid, "mainTeam"), orderBy("slotOrder", "asc")), (snap) => {
    cb(
      snap.docs.map((row) => ({
        id: row.id,
        ...(row.data() as Omit<GymRosterEntry, "id">),
      }))
    );
  });
}

export function listenGymAssignedNpcs(uid: string, cb: (rows: GymAssignedNpcEntry[]) => void) {
  return onSnapshot(query(collection(db, "gyms", uid, "assignedNpcs"), orderBy("createdAtMs", "asc")), (snap) => {
    cb(
      snap.docs.map((row) => ({
        id: row.id,
        ...(row.data() as Omit<GymAssignedNpcEntry, "id">),
      }))
    );
  });
}

export async function createGymForPlayer(input: CreateGymInput) {
  const uid = String(input.uid || "").trim();
  const characterId = String(input.characterId || "").trim();
  const biomeId = String(input.biomeId || "").trim().toLowerCase();
  const gymName = String(input.gymName || "").trim();
  const gymType = toLower(input.gymType);
  const scenarioThemeId = String(input.scenarioThemeId || "").trim().toLowerCase();
  const primaryBadgeId = String(input.primaryBadgeId || "").trim().toLowerCase();
  const initialMainTeam = Array.isArray(input.initialMainTeam) ? input.initialMainTeam : [];
  if (!uid || !characterId) throw new Error("Sessao invalida para criar GYM.");
  if (!biomeId) throw new Error("Bioma invalido para criar o GYM.");
  if (!gymName) throw new Error("Informe o nome do GYM.");
  if (!gymType) throw new Error("Informe o tipo do GYM.");
  if (!scenarioThemeId) throw new Error("Selecione o tema do cenario.");
  if (!primaryBadgeId) throw new Error("Selecione a insignia principal do GYM.");
  if (!input.creationEntitlement?.id) throw new Error("Ticket GYM nao encontrado.");
  const ticketConfig = resolveGymTicketConfiguration(input.creationEntitlement);
  if (!ticketConfig) throw new Error("Esse item nao e um ticket GYM valido.");

  const baseState = buildInitialGymState();
  const initialMainTeamLimit = Math.max(1, Number(baseState.mainTeamSlotLimit || 1));
  const uniqueSelections = Array.from(
    new Map(
      initialMainTeam.map((entry) => [
        buildRosterEntryId(entry.sourceCollection, entry.sourceDocId),
        {
          sourceCollection: entry.sourceCollection,
          sourceDocId: String(entry.sourceDocId || "").trim(),
        },
      ])
    ).values()
  ).filter((entry) => entry.sourceDocId);
  if (!uniqueSelections.length) {
    throw new Error("Selecione pelo menos 1 Pokemon para o time principal.");
  }
  if (uniqueSelections.length > initialMainTeamLimit) {
    throw new Error("O time principal selecionado excede o limite inicial desse GYM.");
  }
  const now = Date.now();

  await runTransaction(db, async (tx) => {
    const gymRef = doc(db, "gyms", uid);
    const playerRef = doc(db, "players", uid);
    const biomeRef = doc(db, "biomes", biomeId);
    const scenarioRef = doc(db, "scenarios", scenarioThemeId);
    const badgeRef = doc(db, "badges", primaryBadgeId);
    const creationEntitlementRef = doc(db, "players", uid, "productEntitlements", input.creationEntitlement.id);
    const nameRegistryRef = doc(db, "gymNames", gymName.trim().toLowerCase());
    const sourceRefs = uniqueSelections.map((entry) =>
      doc(db, "players", uid, "characters", characterId, entry.sourceCollection, entry.sourceDocId)
    );
    const linkedNpcId = String(input.linkedNpcId || "").trim().toLowerCase();
    const linkedNpcRef = linkedNpcId ? doc(db, "npcs", linkedNpcId) : null;

    const [gymSnap, playerSnap, biomeSnap, entitlementSnap, scenarioSnap, badgeSnap, nameRegistrySnap, ...remainingSnaps] = await Promise.all([
      tx.get(gymRef),
      tx.get(playerRef),
      tx.get(biomeRef),
      tx.get(creationEntitlementRef),
      tx.get(scenarioRef),
      tx.get(badgeRef),
      tx.get(nameRegistryRef),
      ...sourceRefs.map((ref) => tx.get(ref)),
      ...(linkedNpcRef ? [tx.get(linkedNpcRef)] : []),
    ]);
    const sourceSnaps = remainingSnaps.slice(0, sourceRefs.length);
    const linkedNpcSnap = linkedNpcRef ? remainingSnaps[sourceRefs.length] : null;

    if (gymSnap.exists() && String(gymSnap.data()?.status || "") !== "removed") {
      throw new Error("Voce ja possui um GYM registrado.");
    }
    if (playerSnap.exists() && playerSnap.data()?.gymOwnership?.gymId && String(playerSnap.data()?.gymOwnership?.status || "") !== "removed") {
      throw new Error("Sua conta ja possui um GYM vinculado.");
    }
    if (!biomeSnap.exists()) throw new Error("Bioma nao encontrado.");
    const biomeData = biomeSnap.data() as Record<string, unknown>;
    if (!biomeAllowsGym(biomeData)) {
      throw new Error("Esse bioma nao permite criacao de GYM.");
    }
    if (nameRegistrySnap.exists()) throw new Error("Ja existe um GYM com esse nome.");
    if (!entitlementSnap?.exists()) throw new Error("Ticket GYM nao encontrado.");
    const freshEntitlementData = entitlementSnap.data() as Omit<PlayerProductEntitlement, "id">;
    const freshEntitlement = { ...freshEntitlementData, id: input.creationEntitlement.id };
    const freshTicketConfig = resolveGymTicketConfiguration(freshEntitlement);
    if (!freshTicketConfig) throw new Error("Ticket GYM invalido.");
    if (!isEntitlementActive(freshEntitlement)) throw new Error("Ticket GYM inativo ou expirado.");
    if (freshEntitlement.claimedAt) throw new Error("Esse ticket de GYM ja foi utilizado.");
    if (!scenarioSnap.exists()) throw new Error("Cenario do GYM nao encontrado.");
    const scenario = normalizeGymScenarioRecord(scenarioSnap.id, scenarioSnap.data());
    if (!scenario.isActive) throw new Error("O cenario escolhido esta inativo.");
    if (!badgeSnap.exists()) throw new Error("Insignia principal nao encontrada.");
    const badge = normalizeBadgeRecord(badgeSnap.id, badgeSnap.data());
    if (!badge.isActive) throw new Error("A insignia selecionada esta inativa.");

    const rosterEntries = uniqueSelections.map((entry, index) => {
      const sourceSnap = sourceSnaps[index];
      if (!sourceSnap?.exists()) {
        throw new Error("Um dos Pokemon selecionados nao foi encontrado.");
      }
      const mon = sourceSnap.data() as Record<string, unknown>;
      const hpData = (mon.hp && typeof mon.hp === "object" ? (mon.hp as Record<string, unknown>) : null);
      const speciesId = Math.max(1, Number(mon.speciesId || 0));
      const pokemonTypes = getSpeciesTypes(speciesId);
      if (!pokemonTypes.includes(gymType)) {
        throw new Error("O time principal possui Pokemon incompativeis com o tipo do GYM.");
      }
      return {
        id: buildRosterEntryId(entry.sourceCollection, entry.sourceDocId),
        payload: {
          sourceCollection: entry.sourceCollection,
          sourceDocId: entry.sourceDocId,
          sourceCharacterId: characterId,
          speciesId,
          speciesName: String(mon.speciesName || `#${speciesId}`),
          level: Math.max(1, Number(mon.level || 1)),
          pokemonTypes,
          nickname: String(mon.nickname || "") || null,
          nature: String(mon.nature || "") || null,
          hpCurrent: Math.max(1, Number(mon.hpCurrent ?? hpData?.current ?? mon.hpTotal ?? hpData?.total ?? 1)),
          hpTotal: Math.max(1, Number(mon.hpTotal ?? hpData?.total ?? mon.hpCurrent ?? hpData?.current ?? 1)),
          expCurrent: Math.max(0, Number(mon.expCurrent ?? mon.currentExp ?? mon.exp ?? 0)),
          expToNext: Math.max(1, Number(mon.expToNext ?? mon.nextExp ?? mon.expToNextLevel ?? 100)),
          isStarter: Boolean(mon.isStarter),
          spriteUrl: String(mon.spriteUrl || "") || null,
          createdAtMs: now,
          updatedAtMs: now,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      };
    });
    const linkedNpcData =
      linkedNpcId && linkedNpcSnap && "exists" in linkedNpcSnap && linkedNpcSnap.exists()
        ? (linkedNpcSnap.data() as Record<string, unknown>)
        : null;
    const expiresAtMs =
      freshTicketConfig.gymMode === "temporary" && freshTicketConfig.gymDurationDays
        ? now + freshTicketConfig.gymDurationDays * 24 * 60 * 60 * 1000
        : null;
    const normalizedGymName = gymName.trim().toLowerCase();

    tx.set(
      gymRef,
      {
        ownerUid: uid,
        ownerCharacterId: characterId,
        ownerCharacterName: input.characterName || null,
        name: gymName,
        gymType,
        scenarioThemeId,
        primaryBadgeId: badge.id,
        primaryBadgeName: badge.name,
        primaryBadgeDescription: badge.description || null,
        primaryBadgeImageUrl: badge.imageUrl || null,
        primaryBadgeBonusType: badge.bonusType,
        primaryBadgeBonusValue: badge.bonusValue,
        sourceType: "ticket",
        sourceEntitlementId: input.creationEntitlement.id,
        biomeId,
        ticketMode: freshTicketConfig.gymMode,
        expiresAtMs,
        blockedAtMs: null,
        status: "active",
        approved: true,
        active: true,
        xpBonusPercent: 20,
        storageLimit: baseState.storageLimit,
        storageCount: rosterEntries.length,
        mainTeamSlotLimit: baseState.mainTeamSlotLimit,
        totalSlots: baseState.mainTeamSlotLimit,
        extraSlotsApplied: 0,
        mainTeamCount: rosterEntries.length,
        badgeCount: baseState.badgeCount,
        assignedNpcIds: linkedNpcId ? [linkedNpcId] : [],
        assignedNpcCount: linkedNpcId ? 1 : 0,
        linkedNpcId: linkedNpcId || null,
        linkedNpcName: linkedNpcData ? String(linkedNpcData.nome || linkedNpcId) : null,
        linkedNpcRole: linkedNpcData ? String(linkedNpcData.role || "") : null,
        linkedNpcImageUrl: linkedNpcData ? String(linkedNpcData.imageUrl || "") || null : null,
        activeNpcs: {
          ...baseState.activeNpcs,
          police: linkedNpcData ? toLower(linkedNpcData.role) === "policial" : false,
          additionalNpcCount: 0,
        },
        upgrades: {
          policeUnlocked: linkedNpcData ? toLower(linkedNpcData.role) === "policial" : false,
          additionalNpcCount: 0,
          storageSlotsAdded: 0,
          mainTeamSlotsAdded: 0,
          badgeCountAdded: 0,
        },
        policeInterceptPrepared: linkedNpcData ? toLower(linkedNpcData.role) === "policial" : false,
        challengeQueueCount: 0,
        normalizedName: normalizedGymName,
        createdAtMs: now,
        updatedAtMs: now,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    rosterEntries.forEach((entry, index) => {
      tx.set(doc(db, "gyms", uid, "storage", entry.id), entry.payload, { merge: true });
      tx.set(doc(db, "gyms", uid, "mainTeam", entry.id), { ...entry.payload, slotOrder: index + 1 }, { merge: true });
    });
    if (linkedNpcId && linkedNpcData) {
      tx.set(
        doc(db, "gyms", uid, "assignedNpcs", linkedNpcId),
        {
          npcId: linkedNpcId,
          name: String(linkedNpcData.nome || linkedNpcId),
          role: String(linkedNpcData.role || ""),
          imageUrl: String(linkedNpcData.imageUrl || "") || null,
          appearanceRate: typeof linkedNpcData.appearanceRate === "number" ? linkedNpcData.appearanceRate : null,
          isCommercialized: Boolean(linkedNpcData.isCommercialized),
          ecoinPrice: typeof linkedNpcData.ecoinPrice === "number" ? linkedNpcData.ecoinPrice : null,
          createdAtMs: now,
          updatedAtMs: now,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    tx.set(
      playerRef,
      {
        gymOwnership: {
          gymId: uid,
          sourceType: "ticket",
          status: "active",
          gymType,
          biomeId,
          updatedAtMs: now,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(nameRegistryRef, { ownerUid: uid, gymId: uid, name: gymName, normalizedName: normalizedGymName, createdAtMs: now, createdAt: serverTimestamp() }, { merge: true });
    tx.set(
      creationEntitlementRef,
      {
        claimedAt: serverTimestamp(),
        claimedByCharacterId: characterId,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

export function getGymInitialMainTeamLimit(sourceType: GymSourceType) {
  return buildInitialGymState().mainTeamSlotLimit;
}

export async function addPokemonToGymStorage(input: AddGymPokemonInput) {
  const sourceRef = doc(
    db,
    "players",
    input.uid,
    "characters",
    input.characterId,
    input.sourceCollection,
    input.sourceDocId
  );

  await runTransaction(db, async (tx) => {
    const gymRef = doc(db, "gyms", input.uid);
    const storageRef = doc(db, "gyms", input.uid, "storage", buildRosterEntryId(input.sourceCollection, input.sourceDocId));
    const [gymSnap, sourceSnap, storageSnap] = await Promise.all([
      tx.get(gymRef),
      tx.get(sourceRef),
      tx.get(storageRef),
    ]);
    if (!gymSnap.exists()) throw new Error("GYM nao encontrado.");
    if (!sourceSnap.exists()) throw new Error("Pokemon selecionado nao encontrado.");
    if (storageSnap.exists()) throw new Error("Esse Pokemon ja esta no storage do GYM.");

    const gym = gymSnap.data() as PlayerGymDoc;
    const mon = sourceSnap.data() as Record<string, unknown>;
    const hpData = (mon.hp && typeof mon.hp === "object" ? (mon.hp as Record<string, unknown>) : null);
    const speciesId = Math.max(1, Number(mon.speciesId || 0));
    const pokemonTypes = getSpeciesTypes(speciesId);
    if (!pokemonTypes.includes(toLower(gym.gymType))) {
      throw new Error("Esse Pokemon nao e compativel com o tipo principal do GYM.");
    }
    const storageCount = Math.max(0, Number(gym.storageCount || 0));
    const storageLimit = Math.max(1, Number(gym.storageLimit || 1));
    if (storageCount >= storageLimit) throw new Error("Storage do GYM lotado.");

    tx.set(
      storageRef,
      {
        sourceCollection: input.sourceCollection,
        sourceDocId: input.sourceDocId,
        sourceCharacterId: input.characterId,
        speciesId,
        speciesName: String(mon.speciesName || `#${speciesId}`),
        level: Math.max(1, Number(mon.level || 1)),
        pokemonTypes,
        nickname: String(mon.nickname || "") || null,
        nature: String(mon.nature || "") || null,
        hpCurrent: Math.max(1, Number(mon.hpCurrent ?? hpData?.current ?? mon.hpTotal ?? hpData?.total ?? 1)),
        hpTotal: Math.max(1, Number(mon.hpTotal ?? hpData?.total ?? mon.hpCurrent ?? hpData?.current ?? 1)),
        expCurrent: Math.max(0, Number(mon.expCurrent ?? mon.currentExp ?? mon.exp ?? 0)),
        expToNext: Math.max(1, Number(mon.expToNext ?? mon.nextExp ?? mon.expToNextLevel ?? 100)),
        isStarter: Boolean(mon.isStarter),
        spriteUrl: String(mon.spriteUrl || "") || null,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(
      gymRef,
      {
        storageCount: storageCount + 1,
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

export async function removePokemonFromGymStorage(uid: string, entryId: string) {
  await runTransaction(db, async (tx) => {
    const gymRef = doc(db, "gyms", uid);
    const storageRef = doc(db, "gyms", uid, "storage", entryId);
    const mainTeamRef = doc(db, "gyms", uid, "mainTeam", entryId);
    const [gymSnap, storageSnap, mainTeamSnap] = await Promise.all([
      tx.get(gymRef),
      tx.get(storageRef),
      tx.get(mainTeamRef),
    ]);
    if (!gymSnap.exists() || !storageSnap.exists()) throw new Error("Pokemon do GYM nao encontrado.");
    const gym = gymSnap.data() as PlayerGymDoc;
    tx.delete(storageRef);
    tx.set(
      gymRef,
      {
        storageCount: Math.max(0, Number(gym.storageCount || 0) - 1),
        mainTeamCount: mainTeamSnap.exists() ? Math.max(0, Number(gym.mainTeamCount || 0) - 1) : Number(gym.mainTeamCount || 0),
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    if (mainTeamSnap.exists()) {
      tx.delete(mainTeamRef);
    }
  });
}

export async function addPokemonToGymMainTeam(uid: string, entryId: string, preferredSlotOrder?: number | null) {
  const mainTeamQuery = query(collection(db, "gyms", uid, "mainTeam"), orderBy("slotOrder", "asc"));
  const existingTeamSnap = await getDocs(mainTeamQuery);
  await runTransaction(db, async (tx) => {
    const gymRef = doc(db, "gyms", uid);
    const storageRef = doc(db, "gyms", uid, "storage", entryId);
    const teamRef = doc(db, "gyms", uid, "mainTeam", entryId);
    const [gymSnap, storageSnap, teamSnap] = await Promise.all([
      tx.get(gymRef),
      tx.get(storageRef),
      tx.get(teamRef),
    ]);
    if (!gymSnap.exists()) throw new Error("GYM nao encontrado.");
    if (!storageSnap.exists()) throw new Error("Adicione o Pokemon ao storage primeiro.");
    if (teamSnap.exists()) throw new Error("Esse Pokemon ja esta no time principal.");
    const gym = gymSnap.data() as PlayerGymDoc;
    const mainTeamCount = Math.max(0, Number(gym.mainTeamCount || 0));
    const mainTeamSlotLimit = Math.max(1, Number(gym.mainTeamSlotLimit || 1));
    if (mainTeamCount >= mainTeamSlotLimit) throw new Error("Limite do time principal do GYM atingido.");
    const usedSlots = new Set(
      existingTeamSnap.docs
        .map((row) => Math.max(1, Number(row.data()?.slotOrder || 0)))
        .filter((value: number) => value > 0)
    );
    let slotOrder = preferredSlotOrder == null ? 0 : Math.max(1, Math.floor(Number(preferredSlotOrder || 0)));
    if (slotOrder > mainTeamSlotLimit) {
      throw new Error("Esse slot ainda nao esta ativo no GYM.");
    }
    if (slotOrder > 0 && usedSlots.has(slotOrder)) {
      throw new Error("Esse slot do time principal ja esta ocupado.");
    }
    if (slotOrder <= 0) {
      for (let slot = 1; slot <= mainTeamSlotLimit; slot += 1) {
        if (!usedSlots.has(slot)) {
          slotOrder = slot;
          break;
        }
      }
    }
    if (slotOrder <= 0) throw new Error("Nenhum slot disponivel no time principal.");
    tx.set(teamRef, { ...(storageSnap.data() as Record<string, unknown>), slotOrder, updatedAtMs: Date.now(), updatedAt: serverTimestamp() }, { merge: true });
    tx.set(gymRef, { mainTeamCount: mainTeamCount + 1, updatedAtMs: Date.now(), updatedAt: serverTimestamp() }, { merge: true });
  });
}

export async function removePokemonFromGymMainTeam(uid: string, entryId: string) {
  await runTransaction(db, async (tx) => {
    const gymRef = doc(db, "gyms", uid);
    const teamRef = doc(db, "gyms", uid, "mainTeam", entryId);
    const [gymSnap, teamSnap] = await Promise.all([tx.get(gymRef), tx.get(teamRef)]);
    if (!gymSnap.exists() || !teamSnap.exists()) throw new Error("Pokemon nao encontrado no time principal.");
    const gym = gymSnap.data() as PlayerGymDoc;
    tx.delete(teamRef);
    tx.set(gymRef, { mainTeamCount: Math.max(0, Number(gym.mainTeamCount || 0) - 1), updatedAtMs: Date.now(), updatedAt: serverTimestamp() }, { merge: true });
  });
}

export async function applyGymUpgradeEntitlement(input: ApplyGymUpgradeInput) {
  const uid = String(input.uid || "").trim();
  const characterId = String(input.characterId || "").trim();
  const entitlement = input.entitlement;
  if (!uid || !characterId) throw new Error("Sessao invalida.");
  if (!entitlement?.id) throw new Error("Entitlement de upgrade invalido.");

  await runTransaction(db, async (tx) => {
    const gymRef = doc(db, "gyms", uid);
    const entitlementRef = doc(db, "players", uid, "productEntitlements", entitlement.id);
    const [gymSnap, entitlementSnap] = await Promise.all([tx.get(gymRef), tx.get(entitlementRef)]);
    if (!gymSnap.exists()) throw new Error("Crie um GYM antes de aplicar upgrades.");
    if (!entitlementSnap.exists()) throw new Error("Upgrade nao encontrado.");
    const freshEntitlement = { id: entitlement.id, ...(entitlementSnap.data() as Omit<PlayerProductEntitlement, "id">) };
    if (!isEntitlementActive(freshEntitlement)) throw new Error("Upgrade inativo ou expirado.");
    if (freshEntitlement.claimedAt) throw new Error("Esse upgrade ja foi aplicado.");

    const gym = gymSnap.data() as PlayerGymDoc;
    const productType = toLower(freshEntitlement.productType);
    const metadata = freshEntitlement.benefits?.metadata || {};
    const nextPatch: Record<string, unknown> = {
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    };
    const isGymSlot =
      productType === "gym_main_team_slot" ||
      (productType === "slot" && toLower(metadata.slotScope) === "gym");

    if (!isGymSlot) {
      throw new Error("Esse produto nao e um upgrade de GYM aplicavel.");
    }

    const add = Math.max(1, Number(freshEntitlement.benefits?.gymDefenseSlotsAdded || freshEntitlement.benefits?.gymMainTeamSlots || metadata.slotsAdded || 1));
    const currentTotalSlots = Math.max(1, Math.min(6, Number(gym.totalSlots || gym.mainTeamSlotLimit || 1)));
    const nextTotalSlots = Math.min(6, currentTotalSlots + add);
    nextPatch["mainTeamSlotLimit"] = nextTotalSlots;
    nextPatch["totalSlots"] = nextTotalSlots;
    nextPatch["extraSlotsApplied"] = Math.max(0, nextTotalSlots - 1);
    nextPatch["upgrades"] = {
      ...(gym.upgrades || {}),
      mainTeamSlotsAdded: Math.max(0, nextTotalSlots - 1),
    };

    tx.set(gymRef, nextPatch, { merge: true });
    tx.set(entitlementRef, { claimedAt: serverTimestamp(), claimedByCharacterId: characterId, updatedAt: serverTimestamp() }, { merge: true });
  });
}

export function listenGymUpgradeCredits(uid: string, cb: (value: PlayerGymUpgradeCredits) => void) {
  return onSnapshot(doc(db, "players", uid, "gymUpgradeCredits", "main_team_slot"), (snap) => {
    cb({
      availableMainTeamSlotCredits: Math.max(0, Number(snap.data()?.availableCredits || 0)),
    });
  });
}

export async function applyActivatedGymMainTeamSlot(args: { uid: string; characterId: string }) {
  const uid = String(args.uid || "").trim();
  const characterId = String(args.characterId || "").trim();
  if (!uid || !characterId) throw new Error("Sessao invalida.");

  await runTransaction(db, async (tx) => {
    const gymRef = doc(db, "gyms", uid);
    const creditRef = doc(db, "players", uid, "gymUpgradeCredits", "main_team_slot");
    const [gymSnap, creditSnap] = await Promise.all([tx.get(gymRef), tx.get(creditRef)]);
    if (!gymSnap.exists()) throw new Error("Crie um GYM antes de aplicar slots.");
    const availableCredits = Math.max(0, Number(creditSnap.data()?.availableCredits || 0));
    if (availableCredits <= 0) throw new Error("Nenhum credito de slot ativado na mochila.");

    const gym = gymSnap.data() as PlayerGymDoc;
    const currentTotalSlots = Math.max(1, Math.min(6, Number(gym.totalSlots || gym.mainTeamSlotLimit || 1)));
    if (currentTotalSlots >= 6) throw new Error("O GYM ja atingiu o limite maximo de 6 slots.");
    const nextTotalSlots = Math.min(6, currentTotalSlots + 1);

    tx.set(
      gymRef,
      {
        mainTeamSlotLimit: nextTotalSlots,
        totalSlots: nextTotalSlots,
        extraSlotsApplied: Math.max(0, nextTotalSlots - 1),
        upgrades: {
          ...(gym.upgrades || {}),
          mainTeamSlotsAdded: Math.max(0, nextTotalSlots - 1),
        },
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(
      creditRef,
      {
        availableCredits: Math.max(0, availableCredits - 1),
        lastAppliedByCharacterId: characterId,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

export async function updatePlayerGymScenario(args: {
  uid: string;
  scenarioId: string;
}) {
  const uid = String(args.uid || "").trim();
  const scenarioId = toLower(args.scenarioId);
  if (!uid || !scenarioId) throw new Error("Cenario invalido.");

  await runTransaction(db, async (tx) => {
    const gymRef = doc(db, "gyms", uid);
    const scenarioRef = doc(db, "scenarios", scenarioId);
    const unlockRef = doc(db, "players", uid, "gymScenarioUnlocks", scenarioId);
    const [gymSnap, scenarioSnap, unlockSnap] = await Promise.all([tx.get(gymRef), tx.get(scenarioRef), tx.get(unlockRef)]);
    if (!gymSnap.exists()) throw new Error("GYM nao encontrado.");
    if (!scenarioSnap.exists()) throw new Error("Cenario nao encontrado.");
    const scenario = normalizeGymScenarioRecord(scenarioSnap.id, scenarioSnap.data());
    if (!scenario.isActive) throw new Error("Esse cenario esta inativo.");
    if (scenario.isCommercialized && !unlockSnap.exists()) {
      throw new Error("Ative esse cenario na mochila antes de usar no GYM.");
    }
    tx.set(
      gymRef,
      {
        scenarioThemeId: scenario.id,
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

export async function updatePlayerGymNpc(args: {
  uid: string;
  npcId: string;
}) {
  const uid = String(args.uid || "").trim();
  const npcId = toLower(args.npcId);
  if (!uid || !npcId) throw new Error("NPC invalido.");

  await runTransaction(db, async (tx) => {
    const gymRef = doc(db, "gyms", uid);
    const npcRef = doc(db, "npcs", npcId);
    const unlockRef = doc(db, "players", uid, "gymNpcUnlocks", npcId);
    const assignedNpcRef = doc(db, "gyms", uid, "assignedNpcs", npcId);
    const [gymSnap, npcSnap, unlockSnap] = await Promise.all([tx.get(gymRef), tx.get(npcRef), tx.get(unlockRef)]);
    if (!gymSnap.exists()) throw new Error("GYM nao encontrado.");
    if (!npcSnap.exists()) throw new Error("NPC nao encontrado.");
    const gym = gymSnap.data() as PlayerGymDoc;
    const npcData = npcSnap.data() as Record<string, unknown>;
    if (Boolean(npcData.isCommercialized) && !unlockSnap.exists()) {
      throw new Error("Ative esse NPC na mochila antes de usar no GYM.");
    }

    const role = String(npcData.role || "");
    const isPolice = toLower(role) === "policial";
    tx.set(
      gymRef,
      {
        assignedNpcIds: [npcId],
        assignedNpcCount: 1,
        linkedNpcId: npcId,
        linkedNpcName: String(npcData.nome || npcId),
        linkedNpcRole: role || null,
        linkedNpcImageUrl: String(npcData.imageUrl || "") || null,
        activeNpcs: {
          ...(gym.activeNpcs || { nurse: true, police: false, additionalNpcCount: 0 }),
          police: isPolice,
        },
        upgrades: {
          ...(gym.upgrades || {
            policeUnlocked: false,
            additionalNpcCount: 0,
            storageSlotsAdded: 0,
            mainTeamSlotsAdded: 0,
            badgeCountAdded: 0,
          }),
          policeUnlocked: isPolice || Boolean(gym.upgrades?.policeUnlocked),
        },
        policeInterceptPrepared: isPolice || Boolean(gym.policeInterceptPrepared),
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(
      assignedNpcRef,
      {
        npcId,
        name: String(npcData.nome || npcId),
        role,
        imageUrl: String(npcData.imageUrl || "") || null,
        appearanceRate: typeof npcData.appearanceRate === "number" ? npcData.appearanceRate : null,
        isCommercialized: Boolean(npcData.isCommercialized),
        ecoinPrice: typeof npcData.ecoinPrice === "number" ? npcData.ecoinPrice : null,
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

export async function healGymPokemon(uid: string, characterId: string, rosterEntryIds: string[]) {
  if (!uid || !characterId) throw new Error("Sessao invalida.");
  const targetIds = Array.from(new Set(rosterEntryIds.map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 50);
  if (!targetIds.length) return { healedCount: 0, totalCost: 0 };

  const [gymStorageSnap, gymMainTeamSnap, characterSnap] = await Promise.all([
    Promise.all(targetIds.map((entryId) => getDoc(doc(db, "gyms", uid, "storage", entryId)))),
    Promise.all(targetIds.map((entryId) => getDoc(doc(db, "gyms", uid, "mainTeam", entryId)))),
    getDoc(doc(db, "players", uid, "characters", characterId)),
  ]);

  const toHeal = targetIds
    .map((entryId, index) => {
      const storageSnap = gymStorageSnap[index];
      const mainTeamSnap = gymMainTeamSnap[index];
      const preferredSnap = mainTeamSnap.exists() ? mainTeamSnap : storageSnap;
      if (!preferredSnap.exists()) return null;
      return {
        id: entryId,
        entry: { id: preferredSnap.id, ...(preferredSnap.data() as Omit<GymRosterEntry, "id">) } as GymRosterEntry,
        hasStorageDoc: storageSnap.exists(),
        hasMainTeamDoc: mainTeamSnap.exists(),
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      entry: GymRosterEntry;
      hasStorageDoc: boolean;
      hasMainTeamDoc: boolean;
    }>;

  const totalCost = toHeal.length * 50;
  const currentCoins = Math.max(0, Number(characterSnap.data()?.pokeCoins || 0));
  if (currentCoins < totalCost) {
    throw new Error(`Moedas insuficientes para curar. Necessario: ${totalCost}.`);
  }

  await runTransaction(db, async (tx) => {
    const charRef = doc(db, "players", uid, "characters", characterId);
    const sourceRefs = toHeal.map(({ entry }) =>
      doc(db, "players", uid, "characters", characterId, entry.sourceCollection, entry.sourceDocId)
    );
    const [freshCharSnap, ...sourceSnaps] = await Promise.all([tx.get(charRef), ...sourceRefs.map((ref) => tx.get(ref))]);
    const freshCoins = Math.max(0, Number(freshCharSnap.data()?.pokeCoins || 0));
    if (freshCoins < totalCost) throw new Error(`Moedas insuficientes para curar. Necessario: ${totalCost}.`);
    tx.set(charRef, { pokeCoins: freshCoins - totalCost, updatedAt: serverTimestamp() }, { merge: true });

    toHeal.forEach(({ id, entry, hasStorageDoc, hasMainTeamDoc }, index) => {
      const sourceSnap = sourceSnaps[index];
      if (!sourceSnap?.exists()) return;
      const sourceData = sourceSnap.data() as Record<string, unknown>;
      const sourceHp = sourceData.hp && typeof sourceData.hp === "object" ? (sourceData.hp as Record<string, unknown>) : null;
      const hpTotal = Math.max(
        1,
        Number(sourceHp?.total ?? entry.hpTotal ?? sourceHp?.current ?? entry.hpCurrent ?? 1)
      );
      const sourceRef = sourceRefs[index];
      tx.set(
        sourceRef,
        {
          hp: {
            ...(sourceHp || {}),
            current: hpTotal,
            total: hpTotal,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      if (hasStorageDoc) {
        tx.set(
          doc(db, "gyms", uid, "storage", id),
          {
            hpCurrent: hpTotal,
            hpTotal,
            updatedAtMs: Date.now(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      if (hasMainTeamDoc) {
        tx.set(
          doc(db, "gyms", uid, "mainTeam", id),
          {
            hpCurrent: hpTotal,
            hpTotal,
            updatedAtMs: Date.now(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    });
  });

  return { healedCount: toHeal.length, totalCost };
}

export async function renewPlayerGymWithTicket(args: {
  uid: string;
  characterId: string;
  entitlement: PlayerProductEntitlement;
}) {
  const uid = String(args.uid || "").trim();
  const characterId = String(args.characterId || "").trim();
  if (!uid || !characterId) throw new Error("Sessao invalida.");
  const ticketConfig = resolveGymTicketConfiguration(args.entitlement);
  if (!ticketConfig || ticketConfig.gymMode !== "temporary" || !ticketConfig.gymDurationDays) {
    throw new Error("A renovacao exige um ticket GYM temporario valido.");
  }

  await runTransaction(db, async (tx) => {
    const gymRef = doc(db, "gyms", uid);
    const entitlementRef = doc(db, "players", uid, "productEntitlements", args.entitlement.id);
    const [gymSnap, entitlementSnap] = await Promise.all([tx.get(gymRef), tx.get(entitlementRef)]);
    if (!gymSnap.exists()) throw new Error("GYM nao encontrado.");
    if (!entitlementSnap.exists()) throw new Error("Ticket GYM nao encontrado.");
    const gym = normalizeGymDoc(gymSnap.id, gymSnap.data() as Omit<PlayerGymDoc, "id">);
    if (gym.status === "removed") throw new Error("GYM removido.");
    const freshEntitlement = { id: args.entitlement.id, ...(entitlementSnap.data() as Omit<PlayerProductEntitlement, "id">) };
    const freshTicket = resolveGymTicketConfiguration(freshEntitlement);
    if (!freshTicket || freshTicket.gymMode !== "temporary" || !freshTicket.gymDurationDays) {
      throw new Error("Ticket de renovacao invalido.");
    }
    if (!isEntitlementActive(freshEntitlement)) throw new Error("Ticket GYM inativo ou expirado.");
    if (freshEntitlement.claimedAt) throw new Error("Esse ticket ja foi utilizado.");
    const expiresAtMs = Date.now() + freshTicket.gymDurationDays * 24 * 60 * 60 * 1000;
    tx.set(
      gymRef,
      {
        ticketMode: "temporary",
        expiresAtMs,
        blockedAtMs: null,
        status: "active",
        active: true,
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(entitlementRef, { claimedAt: serverTimestamp(), claimedByCharacterId: characterId, updatedAt: serverTimestamp() }, { merge: true });
  });
}

export type GymChallengeStatus = "pendente" | "aceita" | "expirada" | "recusada" | "cancelada" | "em_batalha" | "finalizada";

export type GymChallengeDoc = {
  id: string;
  challengerUid: string;
  challengerCharacterId: string;
  challengerName: string;
  leaderUid: string;
  gymId: string;
  gymName: string;
  gymType: string;
  slotsRequested: number;
  status: GymChallengeStatus;
  createdAtMs: number;
  expiresAtMs: number;
  selectedTeam: Array<{ slotIndex: number; speciesId: number; speciesName: string; level: number }>;
};

export function listenGymChallenges(uid: string, cb: (rows: GymChallengeDoc[]) => void) {
  return onSnapshot(query(collection(db, "gyms", uid, "challenges"), orderBy("createdAtMs", "asc")), (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<GymChallengeDoc, "id">) })));
  });
}

export async function createGymChallenge(args: {
  leaderUid: string;
  challengerUid: string;
  challengerCharacterId: string;
  challengerName: string;
  slotsRequested: number;
  selectedTeam: Array<{ slotIndex: number; speciesId: number; speciesName: string; level: number }>;
}) {
  const leaderUid = String(args.leaderUid || "").trim();
  if (!leaderUid) throw new Error("GYM alvo invalido.");
  await runTransaction(db, async (tx) => {
    const gymRef = doc(db, "gyms", leaderUid);
    const gymSnap = await tx.get(gymRef);
    if (!gymSnap.exists()) throw new Error("GYM nao encontrado.");
    const gym = normalizeGymDoc(gymSnap.id, gymSnap.data() as Omit<PlayerGymDoc, "id">);
    if (gym.status !== "active") throw new Error("Esse GYM nao esta aceitando desafios.");
    const requiredSlots = Math.max(1, Math.min(6, Number(gym.totalSlots || gym.mainTeamSlotLimit || 1)));
    const selectedTeam = Array.isArray(args.selectedTeam) ? args.selectedTeam : [];
    if (selectedTeam.length !== requiredSlots) {
      throw new Error(`Esse GYM exige exatamente ${requiredSlots} Pokemon no desafio.`);
    }
    const slotsRequested = Math.max(1, Math.min(requiredSlots, Math.floor(args.slotsRequested || 1)));
    if (slotsRequested !== requiredSlots) {
      throw new Error(`Esse GYM exige exatamente ${requiredSlots} slots.`);
    }
    const normalizedTeam = selectedTeam
      .map((entry) => ({
        slotIndex: Math.max(1, Math.floor(Number(entry.slotIndex || 0))),
        speciesId: Math.max(1, Math.floor(Number(entry.speciesId || 0))),
        speciesName: String(entry.speciesName || `#${entry.speciesId}`),
        level: Math.max(1, Math.floor(Number(entry.level || 1))),
      }))
      .filter((entry) => entry.speciesId > 0);
    if (normalizedTeam.length !== requiredSlots) {
      throw new Error("O time selecionado para o desafio do GYM esta invalido.");
    }
    const challengeRef = doc(collection(db, "gyms", leaderUid, "challenges"));
    const now = Date.now();
    tx.set(
      challengeRef,
      {
        challengerUid: args.challengerUid,
        challengerCharacterId: args.challengerCharacterId,
        challengerName: args.challengerName,
        leaderUid,
        gymId: leaderUid,
        gymName: gym.name,
        gymType: gym.gymType,
        leaderCharacterId: gym.ownerCharacterId,
        leaderCharacterName: gym.ownerCharacterName || null,
        badgeImageUrl: gym.primaryBadgeImageUrl || null,
        scenarioThemeId: gym.scenarioThemeId || null,
        slotsRequested,
        status: "pendente",
        createdAtMs: now,
        expiresAtMs: now + 24 * 60 * 60 * 1000,
        selectedTeam: normalizedTeam,
      },
      { merge: true }
    );
    tx.set(gymRef, { challengeQueueCount: Math.max(0, Number(gym.challengeQueueCount || 0)) + 1, updatedAtMs: now, updatedAt: serverTimestamp() }, { merge: true });
  });
}

export async function respondGymChallenge(args: {
  leaderUid: string;
  challengeId: string;
  accept: boolean;
}) {
  const leaderUid = String(args.leaderUid || "").trim();
  const challengeId = String(args.challengeId || "").trim();
  if (!leaderUid || !challengeId) throw new Error("Desafio invalido.");
  await runTransaction(db, async (tx) => {
    const gymRef = doc(db, "gyms", leaderUid);
    const challengeRef = doc(db, "gyms", leaderUid, "challenges", challengeId);
    const [gymSnap, challengeSnap] = await Promise.all([tx.get(gymRef), tx.get(challengeRef)]);
    if (!gymSnap.exists() || !challengeSnap.exists()) throw new Error("Desafio nao encontrado.");
    const gym = normalizeGymDoc(gymSnap.id, gymSnap.data() as Omit<PlayerGymDoc, "id">);
    const challenge = challengeSnap.data() as GymChallengeDoc;
    if (Date.now() > Number(challenge.expiresAtMs || 0)) {
      tx.set(challengeRef, { status: "expirada", updatedAtMs: Date.now(), updatedAt: serverTimestamp() }, { merge: true });
      throw new Error("Esse desafio expirou.");
    }
    if (args.accept) {
      if (gym.status === "em_batalha") throw new Error("Seu GYM ja esta em batalha.");
      tx.set(challengeRef, { status: "aceita", updatedAtMs: Date.now(), updatedAt: serverTimestamp() }, { merge: true });
      tx.set(gymRef, { status: "em_batalha", active: true, updatedAtMs: Date.now(), updatedAt: serverTimestamp() }, { merge: true });
    } else {
      tx.set(challengeRef, { status: "recusada", updatedAtMs: Date.now(), updatedAt: serverTimestamp() }, { merge: true });
    }
  });
}

export function resolveGymCreationMode(
  _vipBenefits: unknown,
  entitlements: PlayerProductEntitlement[]
) {
  return findStandaloneGymTicket(entitlements) ? ("ticket" as GymSourceType) : null;
}

export function getGymEligibleThemeIds(products: PlayerProductEntitlement[]) {
  return products
    .filter((entry) => isEntitlementActive(entry))
    .flatMap((entry) => parseMetadataStringList(entry.benefits || null, "gymThemeIds"));
}

export function getGymBiomeAccessFromLicense(entitlement: PlayerProductEntitlement | null | undefined) {
  return parseMetadataString(entitlement?.benefits || null, "biomeId");
}
