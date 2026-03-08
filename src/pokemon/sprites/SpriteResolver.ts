import spriteLibrary from "../../data/pokemon/pokemonSpriteLibrary.json";

export type BattleSpritePerspective = "front" | "back";

const PLACEHOLDER = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png";
const BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master";

function n(v: unknown) {
  const out = Number(v);
  return Number.isFinite(out) ? out : 0;
}

function inLibrary(speciesId: number) {
  const dict = spriteLibrary as Record<string, any>;
  return dict[String(speciesId)] ?? null;
}

function sameSourceFallbacks(speciesId: number, perspective: BattleSpritePerspective) {
  const sid = n(speciesId);
  if (sid <= 0) return [PLACEHOLDER];

  if (perspective === "front") {
    return [
      `${BASE}/sprites/pokemon/${sid}.png`,
      `${BASE}/sprites/pokemon/versions/generation-v/black-white/${sid}.png`,
      `${BASE}/sprites/pokemon/versions/generation-iv/platinum/${sid}.png`,
      PLACEHOLDER,
    ];
  }

  return [
    `${BASE}/sprites/pokemon/back/${sid}.png`,
    `${BASE}/sprites/pokemon/versions/generation-v/black-white/back/${sid}.png`,
    `${BASE}/sprites/pokemon/versions/generation-iv/platinum/back/${sid}.png`,
    PLACEHOLDER,
  ];
}

export function resolveBattleSprite(speciesId: number, perspective: BattleSpritePerspective): string {
  const sid = n(speciesId);
  const lib = inLibrary(sid);

  const primary =
    perspective === "front"
      ? [lib?.frontDefault, lib?.frontArtwork, lib?.frontHome]
      : [lib?.backDefault, lib?.backShiny];

  const resolved = primary.find((u) => typeof u === "string" && u.length > 0);
  if (resolved) return resolved;

  const fallbacks = sameSourceFallbacks(sid, perspective);
  return fallbacks[0] || PLACEHOLDER;
}

export function resolveBattleSpriteCandidates(speciesId: number, perspective: BattleSpritePerspective): string[] {
  const sid = n(speciesId);
  const lib = inLibrary(sid);
  const primary =
    perspective === "front"
      ? [lib?.frontDefault, lib?.frontArtwork, lib?.frontHome]
      : [lib?.backDefault, lib?.backShiny];
  const cleaned = primary.filter((u) => typeof u === "string" && u.length > 0) as string[];
  return [...cleaned, ...sameSourceFallbacks(sid, perspective)];
}

