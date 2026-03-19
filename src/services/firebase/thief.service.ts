import { auth } from "./firebaseConfig";

type LootType = "coins" | "item" | "pokemon";

export type ThiefLootResponse = {
  ok: boolean;
  message: string;
  lootType?: LootType;
  stolenCoins?: number;
  stolenItemId?: string | null;
  stolenPokemonSpeciesId?: number | null;
  policeInterceptRequired?: boolean;
  policeNpcName?: string | null;
  caseId?: string | null;
};

type PoliceOutcomeResponse = {
  ok: boolean;
  message: string;
  destination?: "police" | "hq";
};

type RecoverResponse = {
  ok: boolean;
  recoveredCount: number;
  message: string;
};

function getFunctionsBaseUrl() {
  const projectId = String(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
  if (!projectId) throw new Error("Projeto Firebase não configurado.");
  return `https://southamerica-east1-${projectId}.cloudfunctions.net`;
}

async function callFn<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado.");
  const token = await user.getIdToken(true);
  const base = getFunctionsBaseUrl();
  const res = await fetch(`${base}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as any)?.error || `Erro HTTP ${res.status}`);
  }
  return data;
}

export async function resolveThiefPvpLoot(payload: {
  thiefUid: string;
  thiefCharacterId: string;
  victimUid: string;
  victimCharacterId: string;
  targetScope?: "character" | "gym";
  gymOwnerUid?: string;
  gymPokemonEntryId?: string;
}) {
  return callFn<ThiefLootResponse>("thiefResolvePvpLoot", payload);
}

export async function resolveThiefPoliceOutcome(payload: {
  caseId: string;
  thiefWon: boolean;
}) {
  return callFn<PoliceOutcomeResponse>("thiefResolvePoliceOutcome", payload);
}

export async function recoverPokemonFromPolice(payload: { characterId: string }) {
  return callFn<RecoverResponse>("thiefRecoverFromPolice", payload);
}

export async function transferHqToPolice(payload: { characterId: string; forceAll?: boolean }) {
  return callFn<RecoverResponse>("thiefTransferHqToPolice", payload);
}
