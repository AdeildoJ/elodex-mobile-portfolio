import Constants from "expo-constants";

type ExtraConfig = {
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseProjectId?: string;
  firebaseStorageBucket?: string;
  firebaseMessagingSenderId?: string;
  firebaseAppId?: string;
  paymentApiBaseUrl?: string;
};

function getExtra(): ExtraConfig {
  const expoConfigExtra = (Constants.expoConfig?.extra || {}) as ExtraConfig;
  const manifestExtra = ((Constants as any)?.manifest2?.extra || (Constants as any)?.manifest?.extra || {}) as ExtraConfig;
  return { ...manifestExtra, ...expoConfigExtra };
}

const extra = getExtra();

function readConfig(value: string | undefined, fallback?: string) {
  const trimmed = String(value || fallback || "").trim();
  return trimmed || undefined;
}

export const runtimeConfig = {
  firebaseApiKey: readConfig(process.env.EXPO_PUBLIC_FIREBASE_API_KEY, extra.firebaseApiKey),
  firebaseAuthDomain: readConfig(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, extra.firebaseAuthDomain),
  firebaseProjectId: readConfig(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, extra.firebaseProjectId),
  firebaseStorageBucket: readConfig(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET, extra.firebaseStorageBucket),
  firebaseMessagingSenderId: readConfig(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, extra.firebaseMessagingSenderId),
  firebaseAppId: readConfig(process.env.EXPO_PUBLIC_FIREBASE_APP_ID, extra.firebaseAppId),
  paymentApiBaseUrl: readConfig(process.env.EXPO_PUBLIC_PAYMENT_API_BASE_URL, extra.paymentApiBaseUrl),
} as const;
