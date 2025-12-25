import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
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

  const validateAll = () => {
    const nome = nomeJogador.trim();
    const cpfDigits = normalizeDigits(cpf);
    const em = email.trim().toLowerCase();
    const em2 = confirmEmail.trim().toLowerCase();

    if (nome.length < 3) return "Nome do Jogador deve ter pelo menos 3 caracteres.";
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/.test(nome)) return "Nome do Jogador deve conter apenas letras e espaços.";

    if (!isValidDOB(dataNascimento)) return "Data de Nascimento inválida. Use DD/MM/AAAA (data real e não futura).";

    if (cpfDigits.length !== 11) return "CPF deve ter exatamente 11 dígitos.";
    if (!isValidCPF(cpfDigits)) return "CPF inválido.";

    if (!isValidEmail(em)) return "E-mail inválido.";
    if (!isValidEmail(em2)) return "Confirmação de e-mail inválida.";
    if (em !== em2) return "E-mail e Confirmar E-mail não conferem.";

    if (!isStrongPassword(senha)) {
      return "Senha inválida. Regras: mínimo 6, 1 maiúscula, 1 minúscula, 1 número e 1 caractere especial.";
    }
    if (senha !== confirmSenha) return "Senha e Confirmar Senha não conferem.";

    return null;
  };

  const handleRegister = async () => {
    const err = validateAll();
    if (err) {
      Alert.alert("Validação", err);
      return;
    }

    try {
      setLoading(true);

      const user = await registerWithEmail(email.trim(), senha, nomeJogador.trim());

      // ✅ Agora: TODO mundo do mobile começa como FREE
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
          ? "Este e-mail já está em uso."
          : e?.message?.includes("auth/invalid-email")
          ? "E-mail inválido."
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

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Registrar-se</Text>
          <Text style={styles.subtitle}>Minimalista • Tech • EloDex</Text>
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
          />

          <Text style={styles.label}>CPF</Text>
          <TextInput
            style={styles.input}
            placeholder="Somente números (11 dígitos)"
            placeholderTextColor="#9aa0a6"
            keyboardType="number-pad"
            value={cpf}
            onChangeText={(v) => setCpf(formatCPF(v))}
            maxLength={11}
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
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowSenha((s) => !s)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={showSenha ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={COLORS.primary}
              />
            </TouchableOpacity>
          </View>

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
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowConfirmSenha((s) => !s)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={showConfirmSenha ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={COLORS.primary}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={handleRegister} disabled={loading} activeOpacity={0.9}>
            <LinearGradient
              colors={[COLORS.primary, COLORS.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.gradientButton, loading && styles.buttonDisabled]}
            >
              <Text style={styles.gradientButtonText}>
                {loading ? "Criando..." : "Criar conta"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace("/auth/login")}>
            <Text style={styles.link}>Já tenho conta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    // opacity: 0.22,
  },

  container: { padding: 24, paddingTop: 36, paddingBottom: 40 },
  header: { marginBottom: 16 },
  title: { color: COLORS.dark, fontSize: 28, fontWeight: "900" },
  subtitle: { color: "#f7f4f4ff", marginTop: 4, fontWeight: "600" },

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
    marginTop: 10,
    alignItems: "center",
  },
  gradientButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "900" },
  buttonDisabled: { opacity: 0.65 },

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
