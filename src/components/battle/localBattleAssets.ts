import { Image } from "react-native";
import type { BattleAssetSet, BattleBackgroundKind } from "./types";

function localUri(moduleId: number) {
  return Image.resolveAssetSource(moduleId)?.uri || null;
}

const grasslandsAssets: BattleAssetSet = {
  skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/grassland/SKY_DAY.png")),
  skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/grassland/sky_grasslands_night.png")),
  backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/grassland/BACKGROUND_DAY.png")),
  backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/grassland/background_grasslands_night.png")),
  groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/grassland/GROUND_DAY.png")),
  groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/grassland/ground_grasslands_night.png")),
  platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/grassland/PLATFORM_PLAYER.png")),
  platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/grassland/PLATFORM_ENEMY.png")),
  platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/grassland/PLATFORM_PLAYER.png")),
  platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/grassland/PLATFORM_ENEMY.png")),
};

const forestAssets: BattleAssetSet = {
  skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/sky_forest_day.png")),
  skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/sky_forest_day.png")),
  backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/background_forest_day.png")),
  backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/background_forest_day.png")),
  groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/ground_forest_day.png")),
  groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/ground_forest_day.png")),
  platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/platform_player_forest.png")),
  platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/platform_enemy_forest.png")),
  platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/platform_player_forest.png")),
  platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/platform_enemy_forest.png")),
};

const caveAssets: BattleAssetSet = {
  skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/sky_cave_day.png")),
  skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/sky_cave_day.png")),
  backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/background_cave_day.png")),
  backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/background_cave_day.png")),
  groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/ground_cave_day.png")),
  groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/ground_cave_day.png")),
  platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/platform_player_cave_day.png")),
  platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/platform_enemy_cave_day.png")),
  platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/platform_player_cave_day.png")),
  platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/platform_enemy_cave_day.png")),
};

export function getLocalBattleAssets(kind: BattleBackgroundKind): BattleAssetSet | null {
  if (kind === "grasslands") return grasslandsAssets;
  if (kind === "forest") return forestAssets;
  if (kind === "cave") return caveAssets;
  return null;
}
