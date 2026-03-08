import { Image } from "react-native";
import type { BattleAssetSet } from "./types";

function localUri(moduleId: number) {
  try {
    return Image.resolveAssetSource(moduleId)?.uri || null;
  } catch { return null; }
}

export function getScenarioAssets(scenario: string): Partial<BattleAssetSet> | null {
  switch (scenario) {
    case "beach":
      return {
        skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/beach/sky_beach_day.png")),
        backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/beach/background_beach_day.png")),
        groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/beach/ground_beach_day.png")),
        platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/beach/platform_player_beach.png")),
        platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/beach/platform_enemy_beach.png")),
        skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/beach/sky_beach_day.png")),
        backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/beach/background_beach_day.png")),
        groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/beach/ground_beach_day.png")),
        platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/beach/platform_player_beach.png")),
        platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/beach/platform_enemy_beach.png")),
      };
    case "cave":
      return {
        skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/sky_cave_day.png")),
        backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/background_cave_day.png")),
        groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/ground_cave_day.png")),
        platformPlayer: null,
        platformEnemy: null,
        skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/sky_cave_day.png")),
        backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/background_cave_day.png")),
        groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/cave/ground_cave_day.png")),
        platformPlayerNight: null,
        platformEnemyNight: null,
      };
    case "city":
      return {
        skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/city/sky_city_day.png")),
        backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/city/background_city_day.png")),
        groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/city/ground_city_day.png")),
        platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/city/platform_player_city.png")),
        platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/city/platform_enemy_city.png")),
        skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/city/sky_city_night.png")),
        backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/city/background_city_night.png")),
        groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/city/ground_city_night.png")),
        platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/city/platform_player_city.png")),
        platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/city/platform_enemy_city.png")),
      };
    case "desert":
      return {
        skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/desert/sky_desert_day.png")),
        backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/desert/background_desert_day.png")),
        groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/desert/ground_desert_day.png")),
        platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/desert/platform_player_desert.png")),
        platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/desert/platform_enemy_desert.png")),
        skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/desert/sky_desert_night.png")),
        backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/desert/background_desert_night.png")),
        groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/desert/ground_desert_night.png")),
        platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/desert/platform_player_desert.png")),
        platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/desert/platform_enemy_desert.png")),
      };
    case "dojo":
      return {
        skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/dojo/sky_dojo_day.png")),
        backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/dojo/background_dojo_day.png")),
        groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/dojo/ground_dojo_day.png")),
        platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/dojo/platform_player_dojo.png")),
        platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/dojo/platform_enemy_dojo.png")),
        skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/dojo/sky_dojo_night.png")),
        backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/dojo/background_dojo_night.png")),
        groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/dojo/ground_dojo_night.png")),
        platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/dojo/platform_player_dojo.png")),
        platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/dojo/platform_enemy_dojo.png")),
      };
    case "forest":
      return {
        skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/florest/sky_forest_day.png")),
        backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/florest/background_forest_day.png")),
        groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/florest/ground_forest_day.png")),
        platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/florest/platform_player_forest.png")),
        platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/florest/platform_enemy_forest.png")),
        skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/florest/sky_forest_night.png")),
        backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/florest/background_forest_night.png")),
        groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/florest/ground_forest_night.png")),
        platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/florest/platform_player_forest.png")),
        platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/florest/platform_enemy_forest.png")),
      };
    case "forest":
      return {
        skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/sky_forest_day.png")),
        backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/background_forest_day.png")),
        groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/ground_forest_day.png")),
        platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/platform_player_forest.png")),
        platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/platform_enemy_forest.png")),
        skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/sky_forest_day.png")),
        backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/background_forest_day.png")),
        groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/ground_forest_day.png")),
        platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/platform_player_forest.png")),
        platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/forest/platform_enemy_forest.png")),
      };
    case "grassland":
      return {
        skyDay: null,
        backgroundDay: null,
        groundDay: null,
        platformPlayer: null,
        platformEnemy: null,
        skyNight: null,
        backgroundNight: null,
        groundNight: null,
        platformPlayerNight: null,
        platformEnemyNight: null,
      };
    case "lake":
      return {
        skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/lake/sky_lake_day.png")),
        backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/lake/background_lake_day.png")),
        groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/lake/ground_lake_day.png")),
        platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/lake/platform_player_lake.png")),
        platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/lake/platform_enemy_lake.png")),
        skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/lake/sky_lake_night.png")),
        backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/lake/background_lake_night.png")),
        groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/lake/ground_lake_night.png")),
        platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/lake/platform_player_lake.png")),
        platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/lake/platform_enemy_lake.png")),
      };
    case "mountain":
      return {
        skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/montain/sky_mountain_day.png")),
        backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/montain/background_mountain_day.png")),
        groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/montain/ground_mountain_day.png")),
        platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/montain/platform_player_mountain.png")),
        platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/montain/platform_enemy_mountain.png")),
        skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/montain/sky_mountain_night.png")),
        backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/montain/background_mountain_night.png")),
        groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/montain/ground_mountain_night.png")),
        platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/montain/platform_player_mountain.png")),
        platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/montain/platform_enemy_mountain.png")),
      };
    case "river":
      return {
        skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/river/sky_river_day.png")),
        backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/river/background_river_day.png")),
        groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/river/ground_river_day.png")),
        platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/river/platform_player_river.png")),
        platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/river/platform_enemy_river.png")),
        skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/river/sky_river_night.png")),
        backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/river/background_river_night.png")),
        groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/river/ground_river_night.png")),
        platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/river/platform_player_river.png")),
        platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/river/platform_enemy_river.png")),
      };
    case "ruins":
      return {
        skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/ruinas/sky_ruins_day.png")),
        backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/ruinas/background_ruins_day.png")),
        groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/ruinas/ground_ruins_day.png")),
        platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/ruinas/platform_player_ruins.png")),
        platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/ruinas/platform_enemy_ruins.png")),
        skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/ruinas/sky_ruins_night.png")),
        backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/ruinas/background_ruins_night.png")),
        groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/ruinas/ground_ruins_night.png")),
        platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/ruinas/platform_player_ruins.png")),
        platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/ruinas/platform_enemy_ruins.png")),
      };
    case "snow":
      return {
        skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/snow/sky_snow_day.png")),
        backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/snow/background_snow_day.png")),
        groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/snow/ground_snow_day.png")),
        platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/snow/platform_player_snow.png")),
        platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/snow/platform_enemy_snow.png")),
        skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/snow/sky_snow_night.png")),
        backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/snow/background_snow_night.png")),
        groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/snow/ground_snow_night.png")),
        platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/snow/platform_player_snow.png")),
        platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/snow/platform_enemy_snow.png")),
      };
    case "swamp":
      return {
        skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/swamp/sky_swamp_day.png")),
        backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/swamp/background_swamp_day.png")),
        groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/swamp/ground_swamp_day.png")),
        platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/swamp/platform_player_swamp.png")),
        platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/swamp/platform_enemy_swamp.png")),
        skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/swamp/sky_swamp_night.png")),
        backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/swamp/background_swamp_night.png")),
        groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/swamp/ground_swamp_night.png")),
        platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/swamp/platform_player_swamp.png")),
        platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/swamp/platform_enemy_swamp.png")),
      };
    case "vocanion":
      return {
        skyDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/vocanion/sky_vocanion_day.png")),
        backgroundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/vocanion/background_vocanion_day.png")),
        groundDay: localUri(require("../../../assets/images/biomas/assets_cenario_battle/vocanion/ground_vocanion_day.png")),
        platformPlayer: localUri(require("../../../assets/images/biomas/assets_cenario_battle/vocanion/platform_player_vocanion.png")),
        platformEnemy: localUri(require("../../../assets/images/biomas/assets_cenario_battle/vocanion/platform_enemy_vocanion.png")),
        skyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/vocanion/sky_vocanion_night.png")),
        backgroundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/vocanion/background_vocanion_night.png")),
        groundNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/vocanion/ground_vocanion_night.png")),
        platformPlayerNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/vocanion/platform_player_vocanion.png")),
        platformEnemyNight: localUri(require("../../../assets/images/biomas/assets_cenario_battle/vocanion/platform_enemy_vocanion.png")),
      };
    default:
      return null;
  }
}
