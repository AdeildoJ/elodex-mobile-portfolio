import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebaseConfig";

/**
 * ⚠️ IMPORTANTE:
 * - players/{uid} é o perfil mutável do jogador (mobile)
 * - playerType por enquanto é "FREE" (fluxo VIP vem depois)
 */

export type PlayerType = "FREE" | "VIP";

export type PlayerProfile = {
  uid: string;
  playerType: PlayerType;
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

function playerDoc(uid: string) {
  return doc(db, "players", uid);
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
