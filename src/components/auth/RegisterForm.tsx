import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
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

export default function RegisterForm() {
  const router = useRouter();

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
            <Text style={styles.label}>Nome Jogador</Text>
            <TextInput
              style={styles.input}
              placeholder="Apenas texto"
              placeholderTextColor="#9aa0a6"
              value={nomeJogador}
              onChangeText={setNomeJogador}
              autoCapitalize="words"
              editable={!loading}
            />

            <Text style={styles.label}>Data de Nascimento</Text>
            <TextInput
              style={styles.input}
              placeholder="DD/MM/AAAA"
              placeholderTextColor="#9aa0a6"
              keyboardType="number-pad"
              value={dataNascimento}
              onChangeText={(v) => setDataNascimento(formatDOB(v))}
              maxLength={10}
              editable={!loading}
            />

            <Text style={styles.label}>CPF</Text>
            <TextInput
              style={styles.input}
              placeholder="Somente numeros (11 digitos)"
              placeholderTextColor="#9aa0a6"
              keyboardType="number-pad"
              value={cpf}
              onChangeText={(v) => setCpf(formatCPF(v))}
              maxLength={11}
              editable={!loading}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="email@exemplo.com"
              placeholderTextColor="#9aa0a6"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />

            <Text style={styles.label}>Confirmar Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Repita o e-mail"
              placeholderTextColor="#9aa0a6"
              keyboardType="email-address"
              autoCapitalize="none"
              value={confirmEmail}
              onChangeText={setConfirmEmail}
              editable={!loading}
            />

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
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowSenha((s) => !s)}
                activeOpacity={0.85}
                disabled={loading}
              >
                <Ionicons
                  name={showSenha ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={COLORS.primary}
                />
              </TouchableOpacity>
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
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmSenha((s) => !s)}
                activeOpacity={0.85}
                disabled={loading}
              >
                <Ionicons
                  name={showConfirmSenha ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={COLORS.primary}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleRegister} disabled={!canSubmit} activeOpacity={0.9}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.gradientButton, !canSubmit && styles.buttonDisabled]}
              >
                <Text style={styles.gradientButtonText}>{loading ? "Criando..." : "Criar conta"}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.replace("/auth/login")} disabled={loading}>
              <Text style={styles.link}>Ja tenho conta</Text>
            </TouchableOpacity>
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

  label: { color: "#555", fontSize: 12, marginBottom: 6, marginTop: 12, fontWeight: "800" },
  hint: { color: "rgba(45,45,45,0.65)", marginTop: 8, fontSize: 12, fontWeight: "600" },

  input: {
    backgroundColor: "rgba(167,139,250,0.20)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: COLORS.dark,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(45,45,45,0.08)",
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

  passwordRow: { flexDirection: "row", alignItems: "center" },
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
});
