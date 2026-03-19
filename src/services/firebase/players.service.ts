import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import type { TrainerLicenseState, VipBenefitSet } from "./monetization.service";

/**
 * ⚠️ IMPORTANTE:
 * - players/{uid} é o perfil mutável do jogador (mobile)
 * - playerType por enquanto é "FREE" (fluxo VIP vem depois)
 */

export type PlayerType = "FREE" | "VIP";

export type PlayerProfile = {
  uid: string;
  playerType: PlayerType;
  // saldo de Ecoin (moeda monetizada do jogo)
  ecoinBalance?: number;
  vipStatus?: "active" | "inactive" | "past_due" | "canceled";
  vipPlanId?: string | null;
  vipPlanCode?: string | null;
  vipPlanName?: string | null;
  vipBenefits?: VipBenefitSet | null;
  vipExpiresAt?: Timestamp | null;
  vipExpiresAtMs?: number | null;
  vipSubscription?: {
    planId: string | null;
    planCode?: string | null;
    planName?: string | null;
    status: "active" | "inactive" | "past_due" | "canceled";
    startedAt?: Timestamp | null;
    expiresAt?: Timestamp | null;
    expiresAtMs?: number | null;
    benefits?: VipBenefitSet | null;
    updatedAt?: Timestamp | null;
  } | null;
  trainerLicense?: TrainerLicenseState | null;
  vipWeeklyIncubatorLastGrantAtMs?: number | null;
  nomeJogador: string;
  dataNascimento: string;
  cpf: string;
  email: string;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;

  // Campo opcional para facilitar navegação/seleção futura (não obrigatório)
  selectedCharacterId?: string | null;
};

type UpsertPlayerProfileInput = {
  uid: string;
  playerType?: PlayerType; // se não vier, mantém ou assume FREE
  nomeJogador: string;
  dataNascimento: string;
  cpf: string;
  email: string;

  selectedCharacterId?: string | null;
};

const FALLBACK_VIP_BENEFITS: Record<string, VipBenefitSet> = {
  "vip-basic": {
    maxCharacters: 3,
    maxCapturedPokemon: 50,
    maxStorageItems: 50,
    xpBonusPercent: 10,
    moneyBonusPercent: 10,
    weeklyIncubators: 1,
  },
  "vip-plus": {
    maxCharacters: 3,
    maxCapturedPokemon: 50,
    maxStorageItems: 50,
    xpBonusPercent: 12,
    moneyBonusPercent: 12,
    weeklyIncubators: 1,
  },
};

function normalizePlanKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferFallbackVipBenefits(keys: string[]) {
  for (const key of keys) {
    if (!key) continue;
    if (key in FALLBACK_VIP_BENEFITS) return FALLBACK_VIP_BENEFITS[key];
    if (key === "vip basic") return FALLBACK_VIP_BENEFITS["vip-basic"];
    if (key === "vip plus") return FALLBACK_VIP_BENEFITS["vip-plus"];
    if (key.includes("vip plus")) return FALLBACK_VIP_BENEFITS["vip-plus"];
    if (key.includes("vip basic")) return FALLBACK_VIP_BENEFITS["vip-basic"];
    if (key.includes("vipplus")) return FALLBACK_VIP_BENEFITS["vip-plus"];
    if (key.includes("vipbasic")) return FALLBACK_VIP_BENEFITS["vip-basic"];
  }
  return null;
}

function playerDoc(uid: string) {
  return doc(db, "players", uid);
}

export function resolveEffectivePlayerType(profile: Partial<PlayerProfile> | null | undefined): PlayerType {
  const rawType = String(profile?.playerType || "FREE").toUpperCase() === "VIP" ? "VIP" : "FREE";
  const vipStatus = String(profile?.vipStatus || profile?.vipSubscription?.status || "").toLowerCase();
  const hasVipSignal =
    rawType === "VIP" ||
    vipStatus === "active" ||
    !!profile?.vipPlanId ||
    !!profile?.vipPlanCode ||
    !!profile?.vipPlanName ||
    !!profile?.vipSubscription?.planId ||
    !!profile?.vipSubscription?.planCode ||
    !!profile?.vipSubscription?.planName;
  if (!hasVipSignal) return "FREE";
  const expiresAtMs =
    Number(profile?.vipExpiresAtMs || 0) ||
    Number(profile?.vipSubscription?.expiresAtMs || 0) ||
    (profile?.vipExpiresAt && "toMillis" in profile.vipExpiresAt ? profile.vipExpiresAt.toMillis() : 0) ||
    (profile?.vipSubscription?.expiresAt && "toMillis" in profile.vipSubscription.expiresAt
      ? profile.vipSubscription.expiresAt.toMillis()
      : 0);
  if (expiresAtMs > 0 && expiresAtMs < Date.now()) return "FREE";
  return "VIP";
}

export function resolveEffectiveVipBenefits(
  profile: Partial<PlayerProfile> | null | undefined
): VipBenefitSet | null {
  if (resolveEffectivePlayerType(profile) !== "VIP") return null;
  const keys = [
    normalizePlanKey(profile?.vipPlanCode),
    normalizePlanKey(profile?.vipPlanId),
    normalizePlanKey(profile?.vipPlanName),
    normalizePlanKey(profile?.vipSubscription?.planCode),
    normalizePlanKey(profile?.vipSubscription?.planId),
    normalizePlanKey(profile?.vipSubscription?.planName),
  ].filter(Boolean);
  const fallback = inferFallbackVipBenefits(keys);
  const direct = (profile?.vipBenefits || profile?.vipSubscription?.benefits || null) as Partial<VipBenefitSet> | null;
  if (direct) {
    return {
      maxCharacters: Number(direct.maxCharacters ?? fallback?.maxCharacters ?? 3),
      maxCapturedPokemon: Number(direct.maxCapturedPokemon ?? fallback?.maxCapturedPokemon ?? 50),
      maxStorageItems: Number(direct.maxStorageItems ?? fallback?.maxStorageItems ?? 50),
      xpBonusPercent: Number(direct.xpBonusPercent ?? fallback?.xpBonusPercent ?? 0),
      moneyBonusPercent: Number(direct.moneyBonusPercent ?? fallback?.moneyBonusPercent ?? 0),
      weeklyIncubators: Number(direct.weeklyIncubators ?? fallback?.weeklyIncubators ?? 0),
    };
  }

  return fallback;
}

export function resolveEffectiveCharacterLimit(profile: Partial<PlayerProfile> | null | undefined) {
  const benefits = resolveEffectiveVipBenefits(profile);
  if (benefits?.maxCharacters != null) {
    const parsed = Number(benefits.maxCharacters);
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed);
  }
  return resolveEffectivePlayerType(profile) === "VIP" ? 3 : 1;
}

/**
 * ✅ Função já usada no cadastro (mantida)
 * Salva/atualiza players/{uid} com merge:true
 */
export async function upsertPlayerProfile(input: UpsertPlayerProfileInput) {
  const ref = playerDoc(input.uid);

  const payload = {
    uid: input.uid,
    playerType: (input.playerType ?? "FREE").toUpperCase() === "VIP" ? "VIP" : "FREE",
    nomeJogador: input.nomeJogador,
    dataNascimento: input.dataNascimento,
    cpf: input.cpf,
    email: input.email,

    // opcional
    selectedCharacterId: input.selectedCharacterId ?? null,

    updatedAt: serverTimestamp(),
    // createdAt só se o doc não existir — mas como usamos merge, guardamos createdAt se já existir
    createdAt: serverTimestamp(),
  };

  // ✅ merge true não quebra docs antigos
  await setDoc(ref, payload, { merge: true });
}

/**
 * ✅ Novo: Busca perfil do jogador uma vez
 * Necessário para a HOME (nomeJogador / playerType).
 */
export async function getPlayerProfile(uid: string): Promise<PlayerProfile | null> {
  const ref = playerDoc(uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as PlayerProfile;
}

/**
 * Ajusta o saldo de Ecoin do jogador (positivo ou negativo).
 * Retorna o novo saldo após a transacao.
 */
export async function changePlayerEcoinBalance(uid: string, delta: number): Promise<number> {
  const ref = playerDoc(uid);
  return (await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? Math.max(0, Number(snap.data()?.ecoinBalance || 0)) : 0;
    const next = Math.max(0, current + delta);
    tx.set(ref, { ecoinBalance: next, updatedAt: serverTimestamp() }, { merge: true });
    return next;
  })) as number;
}

/**
 * Busca o saldo atual de Ecoin do jogador (0 se nao existir).
 */
export async function getPlayerEcoinBalance(uid: string): Promise<number> {
  const profile = await getPlayerProfile(uid);
  return Math.max(0, Number(profile?.ecoinBalance || 0));
}

/**
 * ✅ Novo: Listener realtime do perfil do jogador
 * (Útil se outra tela precisar reagir a mudanças de playerType etc)
 */
export function listenPlayerProfile(uid: string, cb: (profile: PlayerProfile | null) => void) {
  const ref = playerDoc(uid);

  const unsub = onSnapshot(ref, (snap) => {
    if (!snap.exists()) return cb(null);
    cb(snap.data() as PlayerProfile);
  });

  return unsub;
}

/**
 * ✅ Opcional (não quebra nada): atualizar playerType
 * ATENÇÃO: hoje o fluxo VIP ainda não existe, então isso é apenas utilitário.
 */
export async function setPlayerType(uid: string, playerType: PlayerType) {
  const ref = playerDoc(uid);
  await updateDoc(ref, {
    playerType: (playerType ?? "FREE").toUpperCase() === "VIP" ? "VIP" : "FREE",
    updatedAt: serverTimestamp(),
  });
}

/**
 * ✅ Opcional: persistir qual personagem foi selecionado
 * (Ajuda no “abrir o jogo com personagem selecionado”)
 */
export async function setSelectedCharacter(uid: string, characterId: string | null) {
  const ref = playerDoc(uid);
  await updateDoc(ref, {
    selectedCharacterId: characterId ?? null,
    updatedAt: serverTimestamp(),
  });
}
