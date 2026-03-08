export type BiomeDef = {
  id: string;
  name: string;
  description: string;
  regionKeys?: string[];
  unlockedByDefault?: boolean;
  imageUrl?: string;
  battleWeather?: "none" | "sun" | "rain" | "sandstorm" | "hail" | "snow";
  minLevel: number;
  maxLevel: number;
  speciesPool: number[];
};

export const BIOMES: BiomeDef[] = [
  {
    id: "planice-sylphia",
    name: "PlaniceSylphia",
    description: "Planicies abertas com ventos constantes e encontros comuns.",
    regionKeys: ["kanto", "johto", "hoenn", "sinnoh", "unova", "kalos", "galar", "paldea", "eldoria"],
    unlockedByDefault: true,
    battleWeather: "none",
    minLevel: 2,
    maxLevel: 8,
    speciesPool: [16, 19, 25, 263, 265, 504],
  },
  {
    id: "floresta-esmeralda",
    name: "FlorestaEsmeralda",
    description: "Floresta densa com trilhas antigas e Pokemon de grama/inseto.",
    regionKeys: ["kanto", "johto", "hoenn", "sinnoh", "unova", "kalos", "eldoria"],
    unlockedByDefault: false,
    battleWeather: "rain",
    minLevel: 4,
    maxLevel: 12,
    speciesPool: [10, 13, 43, 46, 163, 187],
  },
  {
    id: "floresta-luminar",
    name: "FlorestaLuminar",
    description: "Bosque iluminado por cristais com encontros mais raros.",
    regionKeys: ["johto", "hoenn", "sinnoh", "unova", "kalos", "eldoria"],
    unlockedByDefault: false,
    battleWeather: "sun",
    minLevel: 6,
    maxLevel: 14,
    speciesPool: [43, 44, 69, 102, 163, 177],
  },
  {
    id: "caverna-luminar",
    name: "CavernaLuminar",
    description: "Caverna com formações brilhantes e Pokemon de rocha/morcego.",
    regionKeys: ["kanto", "johto", "hoenn", "sinnoh", "unova", "kalos", "galar", "paldea", "eldoria"],
    unlockedByDefault: false,
    battleWeather: "none",
    minLevel: 8,
    maxLevel: 16,
    speciesPool: [41, 66, 74, 95, 524, 527],
  },
  {
    id: "caverna-luminar-subsolo",
    name: "CavernaLuminarSubSolo",
    description: "Subsolo profundo da caverna, com encontros mais fortes.",
    regionKeys: ["hoenn", "sinnoh", "unova", "galar", "paldea", "eldoria"],
    unlockedByDefault: false,
    battleWeather: "sandstorm",
    minLevel: 12,
    maxLevel: 22,
    speciesPool: [75, 93, 95, 168, 246, 304],
  },
  {
    id: "praia-coralina",
    name: "PraiaCoralina",
    description: "Costa tropical com especies aquaticas e de areia.",
    regionKeys: ["kanto", "hoenn", "alola", "galar", "paldea", "eldoria"],
    unlockedByDefault: false,
    battleWeather: "rain",
    minLevel: 6,
    maxLevel: 14,
    speciesPool: [60, 72, 90, 120, 129, 170],
  },
  {
    id: "lago-estelar",
    name: "LagoEstelar",
    description: "Lago de aguas calmas com Pokemon de agua e psiquicos.",
    regionKeys: ["johto", "hoenn", "sinnoh", "unova", "paldea", "eldoria"],
    unlockedByDefault: false,
    battleWeather: "rain",
    minLevel: 8,
    maxLevel: 18,
    speciesPool: [54, 60, 79, 120, 170, 339],
  },
  {
    id: "porto-azuria",
    name: "PortoAzuria",
    description: "Zona portuaria com alto fluxo e encontros variados.",
    regionKeys: ["kanto", "hoenn", "unova", "galar", "paldea", "eldoria"],
    unlockedByDefault: false,
    battleWeather: "rain",
    minLevel: 7,
    maxLevel: 15,
    speciesPool: [19, 52, 60, 118, 129, 278],
  },
];
