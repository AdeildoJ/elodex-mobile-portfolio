export type GameActionKey = "BAG" | "EXPLORE" | "BATTLES" | "SHOP" | "LOJA" | "EVENTS";
export type BagTabKey = "TEAM" | "ITEMS" | "POKEBALLS";
export type PlayerTier = "FREE" | "VIP";

export type InventoryKind = "ITEM" | "POKEBALL";
export type ItemEffectType = "HEAL" | "REVIVE" | "LEVEL_UP" | "TEACH_MOVE";

export type InventoryEntry = {
  id: string;
  kind: InventoryKind;
  name: string;
  description: string;
  quantity: number;

  effectType?: ItemEffectType;
  healAmount?: number;
  revivePercent?: number;
  levelGain?: number;
  moveId?: string;
  consumable?: boolean;

  captureBonus?: number;
  isMasterBall?: boolean;
};

export type ActionResult = {
  ok: boolean;
  message: string;
};

export type WildEncounter = {
  speciesId: number;
  speciesName: string;
  level: number;
  hpCurrent: number;
  hpTotal: number;
  spriteUrl: string | null;
  moves?: string[];
};

export type TeamPokemonUI = {
  id: string;
  speciesId: number;
  name: string;
  nickname?: string;
  level: number;
  nature?: string;
  gender?: "M" | "F" | "—";
  hpCurrent: number;
  hpTotal: number;
  expCurrent: number;
  expToNext: number;
  isStarter?: boolean;
  spriteUrl?: string | null;
  moves?: string[];
  moveHistory?: string[];
  relearnableMoves?: string[];
  pendingLearnMove?: string | null;
  learnsetConstraints?: { maxGeneration?: number | null; blockedSources?: string[] } | null;
  abilityId?: string | null;
  stats?: { atk: number; def: number; spa: number; spd: number; spe: number } | null;
  ivs?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number } | null;
  evs?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number } | null;
  nicknameEdited?: boolean;
  canEvolve?: boolean;
  expTotal?: number;
  friendship?: number;
  traumaLevel?: number;
  isAbandoned?: boolean;
  traumaRecovered?: boolean;
  bondBuff?: boolean;
};
