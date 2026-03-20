import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { runtimeConfig } from "../config/runtime";

// ✅ Persistência no React Native (Expo)
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuth, initializeAuth, type Auth } from "firebase/auth";
import { getReactNativePersistence } from "firebase/auth/react-native";

const firebaseConfig = {
  apiKey: runtimeConfig.firebaseApiKey,
  authDomain: runtimeConfig.firebaseAuthDomain,
  projectId: runtimeConfig.firebaseProjectId,
  storageBucket: runtimeConfig.firebaseStorageBucket,
  messagingSenderId: runtimeConfig.firebaseMessagingSenderId,
  appId: runtimeConfig.firebaseAppId,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/**
 * ✅ Auth com persistência (AsyncStorage)
 * Mantém login após fechar o app.
 * Em Fast Refresh/Hot Reload, o auth pode já ter sido inicializado.
 */
let auth: Auth;

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.toLowerCase().includes("already-initialized")) {
    auth = getAuth(app);
  } else {
    throw err;
  }
}

const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

export { app, auth, db, storage, functions };
