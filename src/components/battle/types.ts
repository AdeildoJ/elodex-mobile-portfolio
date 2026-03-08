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
  | "faint"
  | "switch"
  | "weather"
  | "end";

export type BattleTurnEvent = {
  type: BattleTurnEventType;
  side?: BattleSide;
  text?: string;
  hpCurrent?: number;
  hpTotal?: number;
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
