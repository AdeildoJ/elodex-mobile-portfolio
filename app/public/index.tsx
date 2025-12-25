import React, { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ImageBackground,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../src/theme/colors";
import { useAuthContext } from "../../src/contexts/AuthContext";

const { height } = Dimensions.get("window");

export default function PublicIndex() {
  const router = useRouter();
  const { user, loading } = useAuthContext();

  // ✅ Se o usuário já estiver logado, não mostra a tela pública
  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [loading, user, router]);

  return (
    <View style={styles.screen}>
      {/* ====== TOPO: MUNDO ELODEX (ESCURÃO / FUTURISTA) ====== */}
      <View style={styles.world}>
        <LinearGradient
          colors={["#050B1E", "#0A1440", "rgba(59,130,246,0.55)", "rgba(167,139,250,0.50)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <LinearGradient
          colors={["rgba(59,130,246,0.50)", "rgba(167,139,250,0.35)", "rgba(0,0,0,0)"]}
          style={styles.energyAura}
        />

        <View style={styles.core}>
          <LinearGradient
            colors={[
              "rgba(255,255,255,0.18)",
              "rgba(255,255,255,0.06)",
              "rgba(255,255,255,0)",
            ]}
          />

          <Image
            source={require("../../assets/images/EloDexLogo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.worldText}>
          <Text style={styles.subtitle}>O mundo Pokémon começa aqui</Text>
        </View>

        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.70)"]}
          style={styles.worldFade}
        />
      </View>

      <ImageBackground
        source={require("../../assets/images/fundopokemon.png")}
        resizeMode="cover"
        style={styles.lowerBg}
      >
        <LinearGradient
          colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.18)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.cardWrapper}>
          <View style={styles.card}>
            <View style={styles.gifBox}>
              <Image
                source={require("../../assets/images/pokemonGif1.gif")}
                style={styles.gif}
                resizeMode="cover"
              />
              <LinearGradient
                colors={[
                  "rgba(59,130,246,0.18)",
                  "rgba(167,139,250,0.12)",
                  "rgba(255,255,255,0)",
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </View>

            <Text style={styles.heroTitle}>Bem-vindo, treinador</Text>
            <Text style={styles.heroText}>Acesse sua conta e continue sua jornada.</Text>

            <View style={styles.buttons}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => router.push("/auth/login")}>
                <LinearGradient
                  colors={[COLORS.primary, COLORS.secondary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryButton}
                >
                  <Ionicons name="log-in-outline" size={20} color={COLORS.white} />
                  <Text style={styles.primaryButtonText}>Entrar</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity activeOpacity={0.9} onPress={() => router.push("/auth/register")}>
                <View style={styles.secondaryButton}>
                  <Ionicons name="person-add-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.secondaryButtonText}>Criar conta</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.footer}>© EloDex</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },

  world: {
    height: height * 0.52,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },

  energyAura: {
    position: "absolute",
    width: 460,
    height: 460,
    borderRadius: 230,
    top: "10%",
  },

  core: {
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.65,
    shadowRadius: 45,
    elevation: 28,
  },

  logo: {
    width: 300,
    height: 300,
    marginTop: 50,
  },

  worldText: {
    marginTop: 16,
    alignItems: "center",
  },

  subtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    marginTop: 6,
    fontWeight: "700",
  },

  worldFade: {
    position: "absolute",
    bottom: -2,
    height: 120,
    width: "100%",
  },

  lowerBg: {
    flex: 1,
    width: "100%",
  },

  cardWrapper: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },

  card: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 22,
    elevation: 18,
  },

  gifBox: {
    height: 160,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 16,
    backgroundColor: COLORS.dark,
  },

  gif: { width: "100%", height: "100%" },

  heroTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.dark,
  },

  heroText: {
    color: "#555",
    marginTop: 6,
    fontWeight: "700",
    lineHeight: 20,
  },

  buttons: {
    marginTop: 18,
    gap: 10,
  },

  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
  },

  primaryButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "900",
  },

  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.35)",
  },

  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: "900",
  },

  footer: {
    textAlign: "center",
    marginTop: 18,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
    marginBottom: 60,
  },
});
