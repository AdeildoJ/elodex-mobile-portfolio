import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";

import { COLORS } from "../../theme/colors";
import { loginWithEmail } from "../../services/firebase/auth.service";

const { height } = Dimensions.get("window");

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length > 0 && !loading;
  }, [email, password, loading]);

  async function onLogin() {
    const e = email.trim().toLowerCase();

    if (!e) return Alert.alert("Atenção", "Informe seu e-mail.");
    if (!password) return Alert.alert("Atenção", "Informe sua senha.");

    try {
      setLoading(true);
      await loginWithEmail(e, password);

      // ✅ vai direto para HOME após confirmar o login
      router.replace("/home");
    } catch (err: any) {
      const msg = (err?.message ?? "").toString();

      if (
        msg.includes("auth/invalid-credential") ||
        msg.includes("auth/wrong-password")
      ) {
        return Alert.alert("Erro", "E-mail ou senha inválidos.");
      }
      if (msg.includes("auth/user-not-found")) {
        return Alert.alert("Erro", "Usuário não encontrado.");
      }
      if (msg.includes("auth/too-many-requests")) {
        return Alert.alert(
          "Atenção",
          "Muitas tentativas. Tente novamente em alguns minutos."
        );
      }

      Alert.alert("Erro", msg || "Falha no login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      {/* ===== TOPO: MUNDO ELODEX (IGUAL À TELA PRINCIPAL) ===== */}
      <View style={styles.world}>
        <LinearGradient
          colors={[
            "#050B1E",
            "#0A1440",
            "rgba(59,130,246,0.55)",
            "rgba(167,139,250,0.50)",
          ]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <LinearGradient
          colors={[
            "rgba(59,130,246,0.50)",
            "rgba(167,139,250,0.35)",
            "rgba(0,0,0,0)",
          ]}
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

          {/* ✅ Nova logo (mesma da tela principal) */}
          <Image
            source={require("../../../assets/images/EloDexLogo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.worldText}>
          <Text style={styles.subtitle}>Acesse sua conta</Text>
        </View>

        <LinearGradient
          colors={[
            "rgba(0,0,0,0)",
            "rgba(0,0,0,0.35)",
            "rgba(0,0,0,0.70)",
          ]}
          style={styles.worldFade}
        />
      </View>

      {/* ===== BASE: FUNDO POKÉMON ATRÁS DO CARD ===== */}
      <ImageBackground
        source={require("../../../assets/images/fundopokemon.png")}
        resizeMode="cover"
        style={styles.lowerBg}
      >
        <LinearGradient
          colors={[
            "rgba(0,0,0,0.55)",
            "rgba(0,0,0,0.35)",
            "rgba(0,0,0,0.18)",
          ]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* ===== CARD: FORMULÁRIO DE LOGIN ===== */}
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: "padding", android: undefined })}
          style={styles.kav}
        >
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Entrar</Text>
            <Text style={styles.cardSub}>
              Informe seu e-mail e senha para continuar.
            </Text>

            <View style={styles.form}>
              <Text style={styles.label}>E-mail</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={COLORS.dark}
                  style={styles.leftIcon}
                />
                <TextInput
                  placeholder="seuemail@dominio.com"
                  placeholderTextColor="rgba(45,45,45,0.45)"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  style={styles.input}
                  editable={!loading}
                />
              </View>

              <Text style={[styles.label, { marginTop: 14 }]}>Senha</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={COLORS.dark}
                  style={styles.leftIcon}
                />
                <TextInput
                  placeholder="••••••••"
                  placeholderTextColor="rgba(45,45,45,0.45)"
                  secureTextEntry={!showPass}
                  value={password}
                  onChangeText={setPassword}
                  style={styles.input}
                  editable={!loading}
                />
                <Pressable
                  onPress={() => setShowPass((v) => !v)}
                  style={styles.eyeBtn}
                  disabled={loading}
                  hitSlop={10}
                >
                  <Ionicons
                    name={showPass ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={COLORS.dark}
                  />
                </Pressable>
              </View>

              <Link href="/auth/forgot-password" asChild>
                <Pressable style={styles.forgotBtn} disabled={loading}>
                  <Text style={styles.forgotText}>Esqueceu a senha?</Text>
                </Pressable>
              </Link>

              <Pressable
                onPress={onLogin}
                disabled={!canSubmit}
                style={{ marginTop: 10 }}
              >
                <LinearGradient
                  colors={[COLORS.primary, COLORS.secondary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.enterBtn, !canSubmit && styles.enterBtnDisabled]}
                >
                  {loading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.enterText}>Entrar</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </View>

          <Text style={styles.footer}>© EloDex</Text>
        </KeyboardAvoidingView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },

  /* ===== TOPO (MUNDO) ===== */
  world: {
    height: height * 0.46,
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
    top: "8%",
  },
  core: {
    width: 200,
    height: 200,
    borderRadius: 100,
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
  },
  worldText: { marginTop: 14, alignItems: "center" },
  title: {
    color: COLORS.white,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 1,
  },
  subtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    marginTop: 6,
    fontWeight: "800",
  },
  worldFade: {
    position: "absolute",
    bottom: -2,
    height: 110,
    width: "100%",
  },

  /* ===== FUNDO POKÉMON NA BASE ===== */
  lowerBg: { flex: 1, width: "100%" },

  /* ===== CONTEÚDO ===== */
  kav: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 18,
  },

  /* ===== CARD (BRANCO SÓ AQUI) ===== */
  card: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    shadowColor: "#000",
    shadowOpacity: 0.20,
    shadowRadius: 22,
    elevation: 18,
  },

  cardTitle: {
    color: COLORS.dark,
    fontSize: 20,
    fontWeight: "900",
  },
  cardSub: {
    marginTop: 6,
    color: "rgba(45,45,45,0.65)",
    fontWeight: "700",
    lineHeight: 20,
  },

  form: { marginTop: 16 },

  label: {
    color: "rgba(45,45,45,0.75)",
    fontSize: 13,
    marginBottom: 6,
    fontWeight: "800",
  },

  inputWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(45,45,45,0.10)",
    backgroundColor: "rgba(255,255,255,0.92)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  leftIcon: { marginRight: 8, opacity: 0.9 },
  input: {
    flex: 1,
    color: COLORS.dark,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "700",
  },
  eyeBtn: { paddingLeft: 10, paddingVertical: 10 },

  forgotBtn: { alignSelf: "flex-end", paddingVertical: 10, paddingHorizontal: 4 },
  forgotText: {
    color: COLORS.primary,
    textDecorationLine: "underline",
    fontWeight: "900",
  },

  enterBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  enterBtnDisabled: { opacity: 0.55 },
  enterText: {
    color: COLORS.white,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.3,
  },

  footer: {
    textAlign: "center",
    marginTop: 18,
    marginBottom:50,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "800",
  },
});
