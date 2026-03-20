import { auth } from "./firebaseConfig";
import { runtimeConfig } from "../config/runtime";

type RegisterBiomeCapturePayload = {
  biomeId: string;
  speciesId: number;
};

function getFunctionsBaseUrl() {
  const projectId = String(runtimeConfig.firebaseProjectId || "").trim();
  if (!projectId) throw new Error("Projeto Firebase nao configurado.");
  return `https://southamerica-east1-${projectId}.cloudfunctions.net`;
}

async function callFn<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Usuario nao autenticado.");
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
  if (!res.ok) throw new Error((data as any)?.error || `Erro HTTP ${res.status}`);
  return data;
}

export async function registerBiomeCapture(payload: RegisterBiomeCapturePayload) {
  return callFn<{ ok: boolean; exhausted: boolean; remaining: number | null }>("registerBiomeCapture", payload);
}
