import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  Timestamp,
  DocumentData,
  QueryDocumentSnapshot,
  FieldValue,
} from "firebase/firestore";
import { db } from "./firebaseConfig";

/**
 * =========================================================
 *  Tipos (mutáveis) — Firestore: players/{uid}/characters/{id}
 * =========================================================
 */

export type CharacterClassType = "TRAINER" | "THIEF";
export type GenderType = "M" | "F" | "U";

export type StarterPokemonData = {
  speciesId: number;
  speciesName: string;
  nickname: string;

  abilityId: string;
  nature: string;
  gender: GenderType;
};

export type PlayerCharacter = {
  id: string;

  name: string;
  avatarUrl?: string;

  region: string; // RegionKey guardado como string
  classType: CharacterClassType;

  starterPokemon: StarterPokemonData;

  /**
   * ✅ Downgrade VIP -> FREE
   * - lockedAt: quando foi bloqueado
   * - expireAt: quando deve ser removido automaticamente (TTL)
   *
   * Obs: expireAt null/undefined = não expira
   */
  lockedAt?: Timestamp | null;
  expireAt?: Timestamp | null;

  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export type CreateCharacterInput = {
  name: string;
  avatarUrl?: string;

  region: string;
  classType: CharacterClassType;

  starterPokemon: StarterPokemonData;
};

export type UpdateCharacterInput = Partial<{
  name: string;
  avatarUrl: string;

  region: string;
  classType: CharacterClassType;

  starterPokemon: StarterPokemonData;

  lockedAt: Timestamp | null | FieldValue;
  expireAt: Timestamp | null | FieldValue;
}>;

/**
 * =========================================================
 *  Refs / Helpers
 * =========================================================
 */
function charactersCollection(uid: string) {
  return collection(db, "players", uid, "characters");
}

function characterDoc(uid: string, characterId: string) {
  return doc(db, "players", uid, "characters", characterId);
}

function mapCharacterDoc(
  snap: QueryDocumentSnapshot<DocumentData>
): PlayerCharacter {
  const data = snap.data();

  return {
    id: snap.id,

    name: (data.name ?? "") as string,
    avatarUrl: (data.avatarUrl ?? undefined) as string | undefined,

    region: (data.region ?? "") as string,
    classType: (data.classType ?? "TRAINER") as CharacterClassType,

    starterPokemon: (data.starterPokemon ?? null) as StarterPokemonData,

    lockedAt: (data.lockedAt ?? null) as Timestamp | null,
    expireAt: (data.expireAt ?? null) as Timestamp | null,

    createdAt: (data.createdAt ?? null) as Timestamp | null,
    updatedAt: (data.updatedAt ?? null) as Timestamp | null,
  };
}

/**
 * =========================================================
 *  API
 * =========================================================
 */

/**
 * Listener da lista de personagens do jogador.
 * Ordena por createdAt (asc), como você já usa no app.
 */
export function listenPlayerCharacters(
  uid: string,
  onData: (characters: PlayerCharacter[]) => void,
  onError?: (error: Error) => void
) {
  const q = query(charactersCollection(uid), orderBy("createdAt", "asc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const chars = snapshot.docs.map(mapCharacterDoc);
      onData(chars);
    },
    (err) => {
      if (onError) onError(err as Error);
    }
  );
}

/**
 * Cria personagem e retorna o ID do documento criado.
 */
export async function createCharacterForPlayer(
  uid: string,
  data: CreateCharacterInput
): Promise<string> {
  const payload = {
    ...data,
    // ✅ não setar expireAt/lockedAt na criação normal
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(charactersCollection(uid), payload);
  return docRef.id;
}

/**
 * Busca um personagem do jogador.
 */
export async function getCharacterForPlayer(
  uid: string,
  characterId: string
): Promise<PlayerCharacter | null> {
  const snap = await getDoc(characterDoc(uid, characterId));
  if (!snap.exists()) return null;

  const data = snap.data();

  return {
    id: snap.id,

    name: (data.name ?? "") as string,
    avatarUrl: (data.avatarUrl ?? undefined) as string | undefined,

    region: (data.region ?? "") as string,
    classType: (data.classType ?? "TRAINER") as CharacterClassType,

    starterPokemon: (data.starterPokemon ?? null) as StarterPokemonData,

    lockedAt: (data.lockedAt ?? null) as Timestamp | null,
    expireAt: (data.expireAt ?? null) as Timestamp | null,

    createdAt: (data.createdAt ?? null) as Timestamp | null,
    updatedAt: (data.updatedAt ?? null) as Timestamp | null,
  };
}

/**
 * Atualiza personagem (parcial) e sempre atualiza updatedAt.
 */
export async function updateCharacterForPlayer(
  uid: string,
  characterId: string,
  data: UpdateCharacterInput
): Promise<void> {
  await updateDoc(characterDoc(uid, characterId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Exclui um personagem do jogador.
 */
export async function deleteCharacterForPlayer(
  uid: string,
  characterId: string
): Promise<void> {
  await deleteDoc(characterDoc(uid, characterId));
}
