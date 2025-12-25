import { RegionKey } from "./regions";

/**
 * Regra: Ladrão = 3 pokémon usados por vilões conforme a região.
 * Mantendo fixo e local.
 */
export const VILLAINS_BY_REGION: Record<RegionKey, string[]> = {
  KANTO: ["Ekans", "Koffing", "Meowth"],
  JOHTO: ["Houndour", "Sneasel", "Murkrow"],
  HOENN: ["Carvanha", "Mightyena", "Zubat"],
  SINNOH: ["Stunky", "Glameow", "Croagunk"],
  UNOVA: ["Sandile", "Scraggy", "Trubbish"],
  KALOS: ["Pawniard", "Inkay", "Houndour"],
  ALOLA: ["Rattata", "Grimer", "Meowth"],
  GALAR: ["Nickit", "Zigzagoon", "Sneasel"],
  PALDEA: ["Maschiff", "Shroodle", "Grafaiai"],
};
