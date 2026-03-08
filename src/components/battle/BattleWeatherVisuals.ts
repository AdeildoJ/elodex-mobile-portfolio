import type { BattleAssetSet, BattleWeather } from "./types";

export type WeatherVisualMode = "none" | "rain" | "snow" | "sandstorm" | "sun";

export function weatherToVisualMode(weather: BattleWeather): WeatherVisualMode {
  if (weather === "rain") return "rain";
  if (weather === "sandstorm") return "sandstorm";
  if (weather === "hail" || weather === "snow") return "snow";
  if (weather === "sun") return "sun";
  return "none";
}

export function resolveWeatherBackground(weather: BattleWeather, assets?: BattleAssetSet | null) {
  if (!assets) return null;
  if (weather === "rain") return assets.backgroundRain || null;
  if (weather === "sun") return assets.backgroundSunny || null;
  if (weather === "sandstorm") return assets.backgroundSandstorm || null;
  if (weather === "hail" || weather === "snow") return assets.backgroundSnow || null;
  return null;
}

export function resolveWeatherOverlay(weather: BattleWeather, assets?: BattleAssetSet | null) {
  if (!assets) return null;
  if (weather === "rain") return assets.overlayRain || null;
  if (weather === "sun") return assets.overlaySunny || null;
  if (weather === "sandstorm") return assets.overlaySandstorm || null;
  if (weather === "hail" || weather === "snow") return assets.overlaySnow || null;
  return null;
}
