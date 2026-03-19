import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { registerWithEmail } from "../../services/firebase/auth.service";
import { upsertPlayerProfile } from "../../../src/services/firebase/players.service";

import {
  formatCPF,
  formatDOB,
  isStrongPassword,
  isValidCPF,
  isValidDOB,
  isValidEmail,
  normalizeDigits,
} from "../../utils/validators";

import { COLORS } from "../../theme/colors";

const TEAL_DARK = "#144552";
const SKY_CARD = "#CDEEFF";
const FIELD_BG = "#F4FBFF";

export default function RegisterForm() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const showSidePanel = isWeb && width >= 960;

  const [nomeJogador, setNomeJogador] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmSenha, setConfirmSenha] = useState("");

  const [showSenha, setShowSenha] = useState(false);
  const [showConfirmSenha, setShowConfirmSenha] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      nomeJogador.trim().length > 0 &&
      dataNascimento.trim().length > 0 &&
      cpf.trim().length > 0 &&
      email.trim().length > 0 &&
      confirmEmail.trim().length > 0 &&
      senha.length > 0 &&
      confirmSenha.length > 0 &&
      !loading
    );
  }, [nomeJogador, dataNascimento, cpf, email, confirmEmail, senha, confirmSenha, loading]);

  const validateAll = () => {
    const nome = nomeJogador.trim();
    const cpfDigits = normalizeDigits(cpf);
    const em = email.trim().toLowerCase();
    const em2 = confirmEmail.trim().toLowerCase();

    if (nome.length < 3) return "Nome do Jogador deve ter pelo menos 3 caracteres.";
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/.test(nome)) return "Nome do Jogador deve conter apenas letras e espacos.";
    if (!isValidDOB(dataNascimento)) return "Data de Nascimento invalida. Use DD/MM/AAAA.";
    if (cpfDigits.length !== 11) return "CPF deve ter exatamente 11 digitos.";
    if (!isValidCPF(cpfDigits)) return "CPF invalido.";
    if (!isValidEmail(em)) return "E-mail invalido.";
    if (!isValidEmail(em2)) return "Confirmacao de e-mail invalida.";
    if (em !== em2) return "E-mail e Confirmar E-mail nao conferem.";

    if (!isStrongPassword(senha)) {
      return "Senha invalida. Regras: minimo 6, 1 maiuscula, 1 minuscula, 1 numero e 1 especial.";
    }
    if (senha !== confirmSenha) return "Senha e Confirmar Senha nao conferem.";
    return null;
  };

  const handleRegister = async () => {
    const err = validateAll();
    if (err) {
      Alert.alert("Validacao", err);
      return;
    }

    try {
      setLoading(true);

      const user = await registerWithEmail(email.trim().toLowerCase(), senha, nomeJogador.trim());

      await upsertPlayerProfile({
        uid: user.uid,
        playerType: "FREE",
        nomeJogador: nomeJogador.trim(),
        dataNascimento,
        cpf: normalizeDigits(cpf),
        email: email.trim().toLowerCase(),
      });

      Alert.alert("Sucesso", "Conta criada com sucesso!");
      router.replace("/auth/login");
    } catch (e: any) {
      const msg =
        e?.message?.includes("auth/email-already-in-use")
          ? "Este e-mail ja esta em uso."
          : e?.message?.includes("auth/invalid-email")
            ? "E-mail invalido."
            : e?.message?.includes("auth/weak-password")
              ? "Senha fraca."
              : e?.message || "Erro ao registrar.";

      Alert.alert("Erro", msg);
    } finally {
      setLoading(false);
    }
  };

  const renderInput = (
    label: string,
    value: string,
    onChangeText: (value: string) => void,
    options?: {
      placeholder?: string;
      keyboardType?: "default" | "number-pad" | "email-address";
      autoCapitalize?: "none" | "words";
      maxLength?: number;
      secureTextEntry?: boolean;
      rightAction?: React.ReactNode;
    }
  ) => (
    <View style={styles.fieldBlock}>
      <Text style={isWeb ? styles.webLabel : styles.label}>{label}</Text>
      <View style={isWeb ? styles.webInputWrap : styles.inputWrap}>
        <TextInput
          style={isWeb ? styles.webInput : styles.input}
          placeholder={options?.placeholder}
          placeholderTextColor={isWeb ? "rgba(20,69,82,0.45)" : "#9aa0a6"}
          keyboardType={options?.keyboardType}
          autoCapitalize={options?.autoCapitalize}
          maxLength={options?.maxLength}
          secureTextEntry={options?.secureTextEntry}
          value={value}
          onChangeText={onChangeText}
          editable={!loading}
        />
        {options?.rightAction}
      </View>
    </View>
  );

  if (isWeb) {
    return (
      <View style={styles.webScreen}>
        <View style={[styles.webColumnLeft, showSidePanel ? styles.webColumnLeftDesktop : styles.webColumnFull]}>
          <KeyboardAvoidingView behavior="padding" style={styles.webKeyboard}>
            <ScrollView
              contentContainerStyle={[
                styles.webScrollContent,
                showSidePanel ? styles.webScrollDesktop : styles.webScrollMobile,
              ]}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.webCard}>
                <View style={styles.webLogoWrap}>
                  <Image
                    source={require("../../../assets/images/EloDexLogo.png")}
                    style={styles.webLogo}
                    resizeMode="contain"
                  />
                </View>

                <Text style={styles.webTitle}>Criar conta</Text>
                <Text style={styles.webSubtitle}>Preencha seus dados para entrar no EloDex.</Text>

                {renderInput("Nome do Jogador", nomeJogador, setNomeJogador, {
                  placeholder: "Digite seu nome",
                  autoCapitalize: "words",
                })}

                {renderInput("Data de Nascimento", dataNascimento, (v) => setDataNascimento(formatDOB(v)), {
                  placeholder: "DD/MM/AAAA",
                  keyboardType: "number-pad",
                  maxLength: 10,
                })}

                {renderInput("CPF", cpf, (v) => setCpf(formatCPF(v)), {
                  placeholder: "Somente numeros",
                  keyboardType: "number-pad",
                  maxLength: 14,
                })}

                {renderInput("E-mail", email, setEmail, {
                  placeholder: "Digite seu e-mail",
                  keyboardType: "email-address",
                  autoCapitalize: "none",
                })}

                {renderInput("Confirmar E-mail", confirmEmail, setConfirmEmail, {
                  placeholder: "Repita seu e-mail",
                  keyboardType: "email-address",
                  autoCapitalize: "none",
                })}

                {renderInput("Criar Senha", senha, setSenha, {
                  placeholder: "Digite sua senha",
                  autoCapitalize: "none",
                  secureTextEntry: !showSenha,
                  rightAction: (
                    <Pressable
                      style={styles.webInlineAction}
                      onPress={() => setShowSenha((s) => !s)}
                      disabled={loading}
                    >
                      <Text style={styles.webInlineActionText}>{showSenha ? "Ocultar" : "Mostrar"}</Text>
                    </Pressable>
                  ),
                })}

                <Text style={styles.webHint}>
                  Use pelo menos 6 caracteres com letra maiuscula, minuscula, numero e simbolo.
                </Text>

                {renderInput("Confirmar Senha", confirmSenha, setConfirmSenha, {
                  placeholder: "Repita sua senha",
                  autoCapitalize: "none",
                  secureTextEntry: !showConfirmSenha,
                  rightAction: (
                    <Pressable
                      style={styles.webInlineAction}
                      onPress={() => setShowConfirmSenha((s) => !s)}
                      disabled={loading}
                    >
                      <Text style={styles.webInlineActionText}>
                        {showConfirmSenha ? "Ocultar" : "Mostrar"}
                      </Text>
                    </Pressable>
                  ),
                })}

                <Pressable
                  onPress={handleRegister}
                  disabled={!canSubmit}
                  style={[styles.webPrimaryButton, !canSubmit && styles.webPrimaryButtonDisabled]}
                >
                  {loading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.webPrimaryButtonText}>Criar conta</Text>
                  )}
                </Pressable>

                <Pressable onPress={() => router.replace("/auth/login")} disabled={loading}>
                  <Text style={styles.webLink}>Ja tenho conta</Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>

        {showSidePanel && (
          <ImageBackground
            source={require("../../../assets/images/fundopokemon.png")}
            resizeMode="cover"
            style={styles.webColumnRight}
          >
            <LinearGradient
              colors={["rgba(255,255,255,0.10)", "rgba(0,0,0,0.28)"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.webHeroContent}>
              <Image
                source={require("../../../assets/images/EloDexLogo.png")}
                style={styles.webHeroLogo}
                resizeMode="contain"
              />
              <Text style={styles.webHeroTitle}>EloDex</Text>
              <Text style={styles.webHeroText}>Modo web de cadastro ajustado para o mesmo clima visual do ConectaFe.</Text>
            </View>
          </ImageBackground>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.topGlow}
      />

      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Criar conta</Text>
            <Text style={styles.subtitle}>Preencha seus dados para entrar no EloDex.</Text>
          </View>

          <View style={styles.card}>
            {renderInput("Nome Jogador", nomeJogador, setNomeJogador, {
              placeholder: "Apenas texto",
              autoCapitalize: "words",
            })}

            {renderInput("Data de Nascimento", dataNascimento, (v) => setDataNascimento(formatDOB(v)), {
              placeholder: "DD/MM/AAAA",
              keyboardType: "number-pad",
              maxLength: 10,
            })}

            {renderInput("CPF", cpf, (v) => setCpf(formatCPF(v)), {
              placeholder: "Somente numeros (11 digitos)",
              keyboardType: "number-pad",
              maxLength: 14,
            })}

            {renderInput("Email", email, setEmail, {
              placeholder: "email@exemplo.com",
              keyboardType: "email-address",
              autoCapitalize: "none",
            })}

            {renderInput("Confirmar Email", confirmEmail, setConfirmEmail, {
              placeholder: "Repita o e-mail",
              keyboardType: "email-address",
              autoCapitalize: "none",
            })}

            <Text style={styles.label}>Criar Senha</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Ex: Aa@123"
                placeholderTextColor="#9aa0a6"
                secureTextEntry={!showSenha}
                value={senha}
                onChangeText={setSenha}
                autoCapitalize="none"
                editable={!loading}
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowSenha((s) => !s)}
                disabled={loading}
              >
                <Ionicons
                  name={showSenha ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={COLORS.primary}
                />
              </Pressable>
            </View>
            <Text style={styles.hint}>Use pelo menos 6 caracteres com letra, numero e simbolo.</Text>

            <Text style={styles.label}>Confirmar Senha</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Repita a senha"
                placeholderTextColor="#9aa0a6"
                secureTextEntry={!showConfirmSenha}
                value={confirmSenha}
                onChangeText={setConfirmSenha}
                autoCapitalize="none"
                editable={!loading}
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowConfirmSenha((s) => !s)}
                disabled={loading}
              >
                <Ionicons
                  name={showConfirmSenha ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={COLORS.primary}
                />
              </Pressable>
            </View>

            <Pressable onPress={handleRegister} disabled={!canSubmit}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.gradientButton, !canSubmit && styles.buttonDisabled]}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.gradientButtonText}>Criar conta</Text>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable onPress={() => router.replace("/auth/login")} disabled={loading}>
              <Text style={styles.link}>Ja tenho conta</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  topGlow: {
    position: "absolute",
    top: -140,
    left: -120,
    right: -120,
    height: 280,
    borderBottomLeftRadius: 140,
    borderBottomRightRadius: 140,
    opacity: 0.18,
  },

  container: { padding: 24, paddingTop: 36, paddingBottom: 40 },
  header: { marginBottom: 16 },
  title: { color: COLORS.dark, fontSize: 28, fontWeight: "900" },
  subtitle: { color: "rgba(45,45,45,0.75)", marginTop: 4, fontWeight: "600" },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(45,45,45,0.08)",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },

  fieldBlock: { marginTop: 12 },
  label: { color: "#555", fontSize: 12, marginBottom: 6, fontWeight: "800" },
  hint: { color: "rgba(45,45,45,0.65)", marginTop: 8, fontSize: 12, fontWeight: "600" },

  inputWrap: {
    backgroundColor: "rgba(167,139,250,0.20)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(45,45,45,0.08)",
  },
  input: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: COLORS.dark,
    fontSize: 14,
  },

  gradientButton: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 14,
    alignItems: "center",
  },
  gradientButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "900" },
  buttonDisabled: { opacity: 0.55 },
  link: { color: COLORS.primary, marginTop: 14, textAlign: "center", fontWeight: "900" },

  passwordRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  passwordInput: { flex: 1 },
  eyeButton: {
    marginLeft: 10,
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: "rgba(9, 9, 9, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  webScreen: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: COLORS.white,
  },
  webColumnLeft: {
    backgroundColor: TEAL_DARK,
  },
  webColumnLeftDesktop: {
    width: "44%",
    minWidth: 420,
  },
  webColumnFull: {
    width: "100%",
  },
  webKeyboard: {
    flex: 1,
  },
  webScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  webScrollDesktop: {
    paddingTop: 40,
    paddingBottom: 40,
  },
  webScrollMobile: {
    paddingTop: 24,
    paddingBottom: 24,
  },
  webCard: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    backgroundColor: SKY_CARD,
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 24,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 12,
  },
  webLogoWrap: {
    alignItems: "center",
    marginBottom: 8,
  },
  webLogo: {
    width: 220,
    height: 120,
  },
  webTitle: {
    color: "#000",
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
  },
  webSubtitle: {
    marginTop: 6,
    marginBottom: 10,
    textAlign: "center",
    color: "rgba(20,69,82,0.80)",
    fontSize: 14,
    fontWeight: "700",
  },
  webLabel: {
    color: TEAL_DARK,
    fontSize: 13,
    marginBottom: 6,
    fontWeight: "800",
  },
  webInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: FIELD_BG,
    borderWidth: 1,
    borderColor: "rgba(20,69,82,0.16)",
    paddingHorizontal: 14,
  },
  webInput: {
    flex: 1,
    color: "#111",
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: "600",
  },
  webInlineAction: {
    paddingLeft: 12,
    paddingVertical: 10,
  },
  webInlineActionText: {
    color: TEAL_DARK,
    textDecorationLine: "underline",
    fontWeight: "800",
    fontSize: 12,
  },
  webHint: {
    marginTop: 8,
    color: "rgba(20,69,82,0.75)",
    fontSize: 12,
    fontWeight: "600",
  },
  webPrimaryButton: {
    marginTop: 18,
    backgroundColor: TEAL_DARK,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  webPrimaryButtonDisabled: {
    opacity: 0.55,
  },
  webPrimaryButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
  },
  webLink: {
    marginTop: 16,
    textAlign: "center",
    color: TEAL_DARK,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  webColumnRight: {
    flex: 1,
    position: "relative",
  },
  webHeroContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  webHeroLogo: {
    width: 320,
    height: 180,
  },
  webHeroTitle: {
    marginTop: 8,
    color: COLORS.white,
    fontSize: 52,
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  webHeroText: {
    marginTop: 12,
    maxWidth: 360,
    textAlign: "center",
    color: "rgba(255,255,255,0.92)",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 24,
  },
});
