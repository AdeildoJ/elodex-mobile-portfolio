import pokemonSpecies from "../data/pokemon/pokemonSpecies.json";
import pokemonForms from "../data/pokemon/pokemonForms.json";
import pokemonSpriteLibrary from "../data/pokemon/pokemonSpriteLibrary.json";

function speciesEntry(speciesId: number): any | null {
  const list = Array.isArray(pokemonSpecies) ? (pokemonSpecies as any[]) : Object.values(pokemonSpecies as any);
  return list.find((p) => Number(p?.id ?? p?.speciesId) === Number(speciesId)) ?? null;
}

function libraryEntry(speciesId: number): any | null {
  const dict: any = pokemonSpriteLibrary as any;
  return dict?.[String(speciesId)] ?? null;
}

function normalizeSpriteUrl(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return `https://raw.githubusercontent.com/PokeAPI/sprites/master${raw}`;
  return null;
}

function pickSpriteCandidate(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return normalizeSpriteUrl(value);
  if (typeof value === "object" && value.default) return normalizeSpriteUrl(value.default);
  return null;
}

function toBackFromFront(frontUrl: string | null): string | null {
  if (!frontUrl) return null;
  // relative path normalized to github raw
  if (frontUrl.includes("/sprites/pokemon/") && !frontUrl.includes("/sprites/pokemon/back/")) {
    return frontUrl.replace("/sprites/pokemon/", "/sprites/pokemon/back/");
  }
  return null;
}

function resolveFromSpecies(speciesId: number): string | null {
  const e = speciesEntry(speciesId);
  if (!e) return null;
  return (
    pickSpriteCandidate(e?.sprites?.default) ||
    pickSpriteCandidate(e?.sprites?.home) ||
    pickSpriteCandidate(e?.sprites?.officialArtwork) ||
    pickSpriteCandidate(e?.sprites?.official) ||
    pickSpriteCandidate(e?.sprites?.front_default) ||
    pickSpriteCandidate(e?.sprites?.frontDefault) ||
    pickSpriteCandidate(e?.artwork) ||
    pickSpriteCandidate(e?.image) ||
    pickSpriteCandidate(e?.img) ||
    pickSpriteCandidate(e?.sprite)
  );
}

function resolveFromForms(speciesId: number): string | null {
  try {
    const entries: any[] = Array.isArray(pokemonForms) ? (pokemonForms as any[]) : Object.values(pokemonForms as any);
    const sid = String(speciesId);
    const found =
      entries.find((f) => String(f?.baseSpeciesId) === sid && f?.sprites?.default) ||
      entries.find((f) => String(f?.baseSpeciesId) === sid && f?.sprites?.home) ||
      entries.find((f) => String(f?.baseSpeciesId) === sid && f?.sprites?.official) ||
      entries.find((f) => String(f?.baseSpeciesId) === sid && f?.sprites?.front_default) ||
      null;
    return (
      pickSpriteCandidate(found?.sprites?.default) ||
      pickSpriteCandidate(found?.sprites?.home) ||
      pickSpriteCandidate(found?.sprites?.official) ||
      pickSpriteCandidate(found?.sprites?.front_default)
    );
  } catch {
    return null;
  }
}

export function getPokemonSpriteUrl(speciesId: number): string | null {
  if (!Number.isFinite(Number(speciesId)) || Number(speciesId) <= 0) return null;
  return (
    resolveFromSpecies(speciesId) ||
    resolveFromForms(speciesId) ||
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${speciesId}.png`
  );
}

export function getFrontSprite(speciesId: number): string | null {
  return getPokemonSpriteUrl(speciesId);
}

export function getBackSprite(speciesId: number): string | null {
  const e = speciesEntry(speciesId);
  const explicitBack =
    pickSpriteCandidate(e?.sprites?.backDefault) ||
    pickSpriteCandidate(e?.sprites?.back_default) ||
    pickSpriteCandidate((e as any)?.sprites?.back);
  if (explicitBack) return explicitBack;

  const frontFromJson =
    pickSpriteCandidate(e?.sprites?.frontDefault) ||
    pickSpriteCandidate(e?.sprites?.front_default) ||
    pickSpriteCandidate((e as any)?.sprites?.front) ||
    pickSpriteCandidate(e?.sprites?.default);

  const derivedBack = toBackFromFront(frontFromJson);
  return (
    derivedBack ||
    null
  );
}

export function getBattleFrontSprite(speciesId: number): string | null {
  if (!Number.isFinite(Number(speciesId)) || Number(speciesId) <= 0) return null;
  const lib = libraryEntry(speciesId);
  return (
    pickSpriteCandidate(lib?.frontArtwork) ||
    pickSpriteCandidate(lib?.frontHome) ||
    getFrontSprite(speciesId)
  );
}

export function getBattleBackSprite(speciesId: number): string | null {
  if (!Number.isFinite(Number(speciesId)) || Number(speciesId) <= 0) return null;
  const lib = libraryEntry(speciesId);
  return (
    pickSpriteCandidate(lib?.backDefault) ||
    pickSpriteCandidate(lib?.backShiny) ||
    getBackSprite(speciesId)
  );
}

export function getSpeciesTypes(speciesId: number): string[] {
  const e = speciesEntry(speciesId);
  return Array.isArray(e?.types) ? e.types.map((t: any) => String(t || "").toLowerCase()).filter(Boolean) : [];
}

export function getTypeMultiplier(moveType: string, defenderSpeciesId: number): number {
  const e = speciesEntry(defenderSpeciesId);
  const v = Number(e?.typeMatchups?.multipliers?.[String(moveType || "").toLowerCase()]);
  return Number.isFinite(v) ? v : 1;
}
