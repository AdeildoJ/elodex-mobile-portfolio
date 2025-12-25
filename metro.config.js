const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// ✅ Workaround Expo SDK 53 + Firebase Auth ("Component auth has not been registered yet")
config.resolver.unstable_enablePackageExports = false;

// ✅ (opcional mas recomendado) evitar problemas com libs que usam .cjs
config.resolver.assetExts.push("cjs");

module.exports = config;
