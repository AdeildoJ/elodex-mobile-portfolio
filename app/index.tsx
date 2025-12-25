import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { useAuthContext } from "../src/contexts/AuthContext";
import { COLORS } from "../src/theme/colors";

export default function AppIndex() {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <View style={styles.screen}>
        <LinearGradient
          colors={["#050B1E", "#0A1440", "rgba(59,130,246,0.55)", "rgba(167,139,250,0.50)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color={COLORS.white} />
      </View>
    );
  }

  // ✅ Se já estiver logado, vai direto pra Home
  if (user) return <Redirect href="/home" />;

  // ❌ Se não estiver logado, vai pro público
  return <Redirect href="/public" />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
});
