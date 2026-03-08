const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Firebase Auth can fail to register on some Expo/Metro combinations without this.
config.resolver.unstable_enablePackageExports = false;

// .cjs must be resolved as source file, not asset.
if (!config.resolver.sourceExts.includes("cjs")) {
  config.resolver.sourceExts.push("cjs");
}

module.exports = config;
