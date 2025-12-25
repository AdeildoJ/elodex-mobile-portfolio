export type RegionKey =
  | "KANTO"
  | "JOHTO"
  | "HOENN"
  | "SINNOH"
  | "UNOVA"
  | "KALOS"
  | "ALOLA"
  | "GALAR"
  | "PALDEA";

export const REGIONS: { key: RegionKey; label: string }[] = [
  { key: "KANTO", label: "Kanto" },
  { key: "JOHTO", label: "Johto" },
  { key: "HOENN", label: "Hoenn" },
  { key: "SINNOH", label: "Sinnoh" },
  { key: "UNOVA", label: "Unova" },
  { key: "KALOS", label: "Kalos" },
  { key: "ALOLA", label: "Alola" },
  { key: "GALAR", label: "Galar" },
  { key: "PALDEA", label: "Paldea" },
];
