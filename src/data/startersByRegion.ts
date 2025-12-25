import { RegionKey } from "./regions";

/**
 * Aqui usamos NAMES (string) para não depender da estrutura do seu JSON agora.
 * Depois, se seu JSON for por ID, você pode trocar para IDs sem mudar a tela.
 */
export const STARTERS_BY_REGION: Record<RegionKey, string[]> = {
  KANTO: ["Bulbasaur", "Charmander", "Squirtle"],
  JOHTO: ["Chikorita", "Cyndaquil", "Totodile"],
  HOENN: ["Treecko", "Torchic", "Mudkip"],
  SINNOH: ["Turtwig", "Chimchar", "Piplup"],
  UNOVA: ["Snivy", "Tepig", "Oshawott"],
  KALOS: ["Chespin", "Fennekin", "Froakie"],
  ALOLA: ["Rowlet", "Litten", "Popplio"],
  GALAR: ["Grookey", "Scorbunny", "Sobble"],
  PALDEA: ["Sprigatito", "Fuecoco", "Quaxly"],
};
