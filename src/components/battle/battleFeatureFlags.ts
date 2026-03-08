export type BattleFeatureFlags = {
  enableLayeredBackgrounds: boolean;
  enableBattleParallax: boolean;
  enableBattleCamera: boolean;
  enableBattleTimeline: boolean;
  enableBattleWeatherOverlay: boolean;
  enableBattleSpriteReactions: boolean;
};

export const defaultBattleFeatureFlags: BattleFeatureFlags = {
  enableLayeredBackgrounds: true,
  enableBattleParallax: true,
  enableBattleCamera: true,
  enableBattleTimeline: true,
  enableBattleWeatherOverlay: true,
  enableBattleSpriteReactions: true,
};

export function resolveBattleFeatureFlags(overrides?: Partial<BattleFeatureFlags> | null): BattleFeatureFlags {
  return {
    ...defaultBattleFeatureFlags,
    ...(overrides || {}),
  };
}
