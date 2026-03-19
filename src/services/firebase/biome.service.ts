import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

import { db } from "./firebaseConfig";

function normalizeBiomeValue(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function biomeAllowsGym(raw: unknown) {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const acceptsGym = typeof data.acceptsGym === "boolean" ? data.acceptsGym : null;
  const gymEnabled = typeof data.gymEnabled === "boolean" ? data.gymEnabled : null;

  if (acceptsGym === true || gymEnabled === true) return true;
  if (acceptsGym === false || gymEnabled === false) return false;
  return false;
}

export async function getBiomeDocByKey(biomeKey: string) {
  const normalizedKey = normalizeBiomeValue(biomeKey);
  if (!normalizedKey) return null;

  const directRef = doc(db, "biomes", normalizedKey);
  const directSnap = await getDoc(directRef);
  if (directSnap.exists()) {
    return {
      id: directSnap.id,
      data: directSnap.data() as Record<string, unknown>,
    };
  }

  const byFieldSnap = await getDocs(query(collection(db, "biomes"), where("id", "==", normalizedKey)));
  const found = byFieldSnap.docs[0];
  if (!found) return null;

  return {
    id: found.id,
    data: found.data() as Record<string, unknown>,
  };
}
