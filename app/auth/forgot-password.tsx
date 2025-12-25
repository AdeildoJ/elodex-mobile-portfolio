// app/auth/forgot-password.tsx
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { COLORS } from "../../src/theme/colors";
import { isStrongPassword } from "../../src/utils/validators";
import {
  requestPasswordResetCode,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "../../src/services/firebase/passwordReset.service";

type Step = "EMAIL" | "CODE" | "NEWPASS";

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<Step>("EMAIL");

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [resetToken, setResetToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  async function onSendCode() {
    if (!normalizedEmail) return Alert.alert("Atenção", "Informe seu e-mail.");

    try {
      setLoading(true);
      await requestPasswordResetCode(normalizedEmail);
      Alert.alert("OK", "Enviamos um código de 6 dígitos para seu e-mail.");
      setStep("CODE");
    } catch (e: any) {
      Alert.alert("Erro", e?.message ?? "Falha ao enviar o código.");
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyCode() {
    if (!normalizedEmail) return Alert.alert("Atenção", "Informe seu e-mail.");
    if (!/^\d{6}$/.test(code)) return Alert.alert("Atenção", "Digite um código válido de 6 números.");

    try {
      setLoading(true);
      const token = await verifyPasswordResetCode(normalizedEmail, code);
      setResetToken(token);
      Alert.alert("OK", "Código validado. Agora defina sua nova senha.");
      setStep("NEWPASS");
    } catch (e: any) {
      Alert.alert("Erro", e?.message ?? "Código inválido ou expirado.");
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmNewPassword() {
    if (!resetToken) return Alert.alert("Erro", "Token de validação ausente. Refaça o processo.");
    if (!isStrongPassword(newPass)) {
      return Alert.alert(
        "Atenção",
        "A senha deve conter: 1 maiúscula, 1 minúscula, 1 número, 1 caractere especial e mínimo 6."
      );
    }
    if (newPass !== confirmPass) return Alert.alert("Atenção", "A confirmação de senha não confere.");

    try {
      setLoading(true);
      await confirmPasswordReset(normalizedEmail, resetToken, newPass);
      Alert.alert("OK", "Senha atualizada com sucesso!");
      router.replace("/auth/login");
    } catch (e: any) {
      Alert.alert("Erro", e?.message ?? "Falha ao atualizar a senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.overlay} />

      <KeyboardAvoidingView behavior={Platform.select({ ios: "padding", android: undefined })} style={styles.kav}>
        <View style={styles.card}>
          <Text style={styles.title}>Recuperar senha</Text>
          <Text style={styles.subtitle}>
            {step === "EMAIL" && "Informe seu e-mail para receber um código de 6 dígitos."}
            {step === "CODE" && "Digite o código de 6 dígitos que enviamos no seu e-mail."}
            {step === "NEWPASS" && "Defina sua nova senha (com validação forte)."}
          </Text>

          <Text style={styles.label}>E-mail</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={18} color={COLORS.white} style={styles.leftIcon} />
            <TextInput
              placeholder="seuemail@dominio.com"
              placeholderTextColor="rgba(255,255,255,0.55)"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              editable={!loading}
            />
          </View>

          {step !== "EMAIL" && (
            <>
              <Text style={[styles.label, { marginTop: 14 }]}>Código (6 dígitos)</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="key-outline" size={18} color={COLORS.white} style={styles.leftIcon} />
                <TextInput
                  placeholder="123456"
                  placeholderTextColor="rgba(255,255,255,0.55)"
                  keyboardType="number-pad"
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
                  style={styles.input}
                  editable={!loading && step !== "NEWPASS"}
                />
              </View>
            </>
          )}

          {step === "NEWPASS" && (
            <>
              <Text style={[styles.label, { marginTop: 14 }]}>Nova senha</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color={COLORS.white} style={styles.leftIcon} />
                <TextInput
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255,255,255,0.55)"
                  secureTextEntry={!showNew}
                  value={newPass}
                  onChangeText={setNewPass}
                  style={styles.input}
                  editable={!loading}
                />
                <Pressable onPress={() => setShowNew((v) => !v)} style={styles.eyeBtn} disabled={loading}>
                  <Ionicons name={showNew ? "eye-off-outline" : "eye-outline"} size={20} color={COLORS.white} />
                </Pressable>
              </View>

              <Text style={[styles.label, { marginTop: 14 }]}>Confirmar nova senha</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.white} style={styles.leftIcon} />
                <TextInput
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255,255,255,0.55)"
                  secureTextEntry={!showConfirm}
                  value={confirmPass}
                  onChangeText={setConfirmPass}
                  style={styles.input}
                  editable={!loading}
                />
                <Pressable onPress={() => setShowConfirm((v) => !v)} style={styles.eyeBtn} disabled={loading}>
                  <Ionicons name={showConfirm ? "eye-off-outline" : "eye-outline"} size={20} color={COLORS.white} />
                </Pressable>
              </View>
            </>
          )}

          <Pressable
            onPress={step === "EMAIL" ? onSendCode : step === "CODE" ? onVerifyCode : onConfirmNewPassword}
            disabled={loading}
            style={{ marginTop: 16 }}
          >
            <LinearGradient
              colors={[COLORS.white, "rgba(255,255,255,0.80)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryBtn}
            >
              {loading ? <ActivityIndicator /> : <Text style={styles.primaryText}>
                {step === "EMAIL" && "Enviar código"}
                {step === "CODE" && "Validar código"}
                {step === "NEWPASS" && "Atualizar senha"}
              </Text>}
            </LinearGradient>
          </Pressable>

          {step !== "EMAIL" && (
            <Pressable onPress={onSendCode} disabled={loading} style={{ marginTop: 10, alignSelf: "center" }}>
              <Text style={styles.linkText}>Reenviar código</Text>
            </Pressable>
          )}

          <Link href="/auth/login" asChild>
            <Pressable style={{ marginTop: 18, alignSelf: "center" }} disabled={loading}>
              <Text style={styles.linkText}>Voltar para o login</Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.white },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.06)" },
  kav: { flex: 1, justifyContent: "center", padding: 18 },
  card: {
    borderRadius: 22,
    backgroundColor: "rgba(45,45,45,0.62)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    padding: 18,
  },
  title: { color: COLORS.white, fontSize: 24, fontWeight: "900" },
  subtitle: { color: "rgba(255,255,255,0.75)", marginTop: 6, marginBottom: 14, fontSize: 14 },
  label: { color: "rgba(255,255,255,0.82)", fontSize: 13, marginBottom: 6 },
  inputWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  leftIcon: { marginRight: 8, opacity: 0.95 },
  input: { flex: 1, color: COLORS.white, paddingVertical: 12, fontSize: 15 },
  eyeBtn: { paddingLeft: 10, paddingVertical: 10 },
  primaryBtn: { borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: COLORS.dark, fontWeight: "900", letterSpacing: 0.3, fontSize: 14 },
  linkText: { color: COLORS.white, textDecorationLine: "underline", opacity: 0.9 },
});
