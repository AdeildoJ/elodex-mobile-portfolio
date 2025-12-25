import { httpsCallable } from "firebase/functions";
import { functions } from "./firebaseConfig";

// 1) envia o código
export async function requestPasswordResetCode(email: string): Promise<void> {
  const fn = httpsCallable(functions, "requestPasswordResetCode");
  await fn({ email });
}

// 2) valida código e retorna resetToken
export async function verifyPasswordResetCode(email: string, code: string): Promise<string> {
  const fn = httpsCallable(functions, "verifyPasswordResetCode");
  const res: any = await fn({ email, code });
  return res?.data?.resetToken as string;
}

// 3) confirma e atualiza senha
export async function confirmPasswordReset(email: string, resetToken: string, newPassword: string): Promise<void> {
  const fn = httpsCallable(functions, "confirmPasswordReset");
  await fn({ email, resetToken, newPassword });
}
