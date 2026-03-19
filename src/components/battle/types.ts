export type BattleMode = "wild" | "trainer" | "pvp";

export type BattleSide = "player" | "enemy";

export type BattleBackgroundKind = "grasslands" | "forest" | "cave" | "beach" | "city";
export type BattleWeather = "none" | "sun" | "rain" | "sandstorm" | "hail" | "snow";

export type BattleAssetSet = {
  skyDay?: string | null;
  skyNight?: string | null;
  sky?: string | null;
  backgroundDay?: string | null;
  backgroundNight?: string | null;
  background?: string | null;
  groundDay?: string | null;
  groundNight?: string | null;
  ground?: string | null;
  overlayRain?: string | null;
  overlaySnow?: string | null;
  overlaySandstorm?: string | null;
  overlaySunny?: string | null;
  backgroundRain?: string | null;
  backgroundSunny?: string | null;
  backgroundSandstorm?: string | null;
  backgroundSnow?: string | null;
  platformPlayer?: string | null;
  platformEnemy?: string | null;
  platformPlayerNight?: string | null;
  platformEnemyNight?: string | null;
};

export type BattleFieldState = {
  weather: BattleWeather;
  weatherTurns: number;
  playerReflectTurns: number;
  enemyReflectTurns: number;
  playerLightScreenTurns: number;
  enemyLightScreenTurns: number;
  playerSpikesLayers: number;
  enemySpikesLayers: number;
  playerStealthRock: boolean;
  enemyStealthRock: boolean;
};

export type BattleMoveEffectTarget = "user" | "target" | "user-side" | "target-side" | "field";

export type BattleMoveExecution = {
  chargeTurns?: number;
  hitTurn?: number;
  skipChargeInWeather?: BattleWeather[];
  semiInvulnerablePhase?: "airborne" | "underground" | "underwater" | "vanished";
  multiHit?: {
    minHits: number;
    maxHits: number;
  };
};

export type BattleMoveEffect =
  | {
      kind: "damage";
      target: "target";
    }
  | {
      kind: "heal";
      target: "user" | "target";
      percent: number;
      phase: "onUse" | "afterDamage";
    }
  | {
      kind: "drain";
      target: "user";
      percent: number;
      phase: "afterDamage";
    }
  | {
      kind: "recoil";
      target: "user";
      percent: number;
      basedOn: "damageDealt";
      phase: "afterDamage";
    }
  | {
      kind: "status";
      target: "user" | "target";
      status: string;
      chance: number;
      phase: "onUse" | "onHit";
    }
  | {
      kind: "volatileStatus";
      target: "user" | "target";
      status: string;
      chance: number;
      phase: "onUse" | "onHit" | "afterDamage";
    }
  | {
      kind: "statStages";
      target: "user" | "target";
      chance: number;
      phase: "onUse" | "onHit";
      changes: { stat: string; stages: number }[];
    }
  | {
      kind: "weather";
      target: "field";
      phase: "onUse";
      weather: BattleWeather;
      turns: number;
    }
  | {
      kind: "sideCondition";
      target: "user-side" | "target-side";
      phase: "onUse";
      condition: "reflect" | "light-screen" | "spikes" | "stealth-rock";
      turns?: number;
      layers?: number;
      maxLayers?: number;
    }
  | {
      kind: "protect";
      target: "user";
      phase: "onUse";
      protectType: "protect" | "detect" | "spiky-shield" | "kings-shield" | "baneful-bunker";
      blocksDamage: boolean;
      blocksStatus: boolean;
      successDecay: boolean;
    };

export type BattleMove = {
  id: string;
  name: string;
  type: string;
  power: number;
  accuracy: number;
  pp: number;
  ppMax: number;
  category: "physical" | "special" | "status";
  priority: number;
  critStage?: number;
  drain?: number;
  healing?: number;
  flinchChance?: number;
  isProtectAffected?: boolean;
  statusAilment?: string | null;
  statusChance?: number;
  statChanges?: { stat: string; stages: number }[];
  statChangeChance?: number;
  target?: string;
  isContact?: boolean;
  execution?: BattleMoveExecution;
  effects?: BattleMoveEffect[];
};

export type BattleStatusCondition = "none" | "burn" | "poison" | "bad-poison" | "paralyze" | "sleep" | "freeze";

export type BattleStats = {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
};

export type BattleSpriteSet = {
  front: string | null;
  back: string | null;
};

export type BattleMonster = {
  id: string;
  speciesId: number;
  name: string;
  level: number;
  hpCurrent: number;
  hpTotal: number;
  stats: BattleStats;
  types: string[];
  sprite: BattleSpriteSet;
  moves: BattleMove[];
  slotIndex?: number;
  expCurrent?: number;
  expToNext?: number;
  expTotal?: number;
  abilityId?: string | null;
  heldItemId?: string | null;
  status?: BattleStatusCondition;
  statusTurns?: number;
  badPoisonCounter?: number;
  accuracyStage?: number;
  evasionStage?: number;
  atkStage?: number;
  defStage?: number;
  spaStage?: number;
  spdStage?: number;
  speStage?: number;
  flinched?: boolean;
  protected?: boolean;
  protectMoveId?: string | null;
  protectStreak?: number;
  chargingMoveId?: string | null;
  volatileStatuses?: { id: string; turns?: number; sourceMoveId?: string | null }[];
};

export type BattleTeam = BattleMonster[];

export type BattleAction =
  | { type: "fight"; moveIndex: number }
  | { type: "bag"; ballId?: string }
  | { type: "switch"; targetIndex: number }
  | { type: "run" };

export type BattleTurnEventType =
  | "message"
  | "attack"
  | "hit"
  | "hp"
  | "status"
  | "faint"
  | "switch"
  | "weather"
  | "end";

export type BattleTurnEvent = {
  type: BattleTurnEventType;
  side?: BattleSide;
  text?: string;
  activeIndex?: number;
  moveId?: string;
  moveStage?: "charge" | "execute";
  semiInvulnerablePhase?: "airborne" | "underground" | "underwater" | "vanished" | null;
  hpCurrent?: number;
  hpTotal?: number;
  status?: BattleStatusCondition;
  targetHpCurrent?: number;
  targetHpTotal?: number;
  weather?: BattleWeather;
  weatherTurns?: number;
};

export type BattleResolution = {
  events: BattleTurnEvent[];
  playerTeam: BattleTeam;
  enemyTeam: BattleTeam;
  playerActive: number;
  enemyActive: number;
  fieldState: BattleFieldState;
  result: "ongoing" | "victory" | "defeat" | "ran";
};
