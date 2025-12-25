export function isValidEmail(email: string) {
  const v = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function isStrongPassword(password: string) {
  // [Aa@123] => mínimo 6, 1 maiúscula, 1 minúscula, 1 número, 1 especial
  if (password.length < 6) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[!@#$%^&*()_\-+=\[\]{};:'",.<>/?\\|`~]/.test(password)) return false;
  return true;
}

export function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatCPF(value: string) {
  const digits = normalizeDigits(value).slice(0, 11);
  // opcional: manter só dígitos no input (você pediu numérico). Vou devolver só dígitos.
  return digits;
}

export function isValidCPF(cpfRaw: string) {
  const cpf = normalizeDigits(cpfRaw);

  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos iguais

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;

  return d2 === parseInt(cpf.charAt(10), 10);
}

export function formatDOB(value: string) {
  // mantém só números e formata em DD/MM/AAAA enquanto digita
  const digits = normalizeDigits(value).slice(0, 8);
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);

  if (digits.length <= 2) return dd;
  if (digits.length <= 4) return `${dd}/${mm}`;
  return `${dd}/${mm}/${yyyy}`;
}

export function isValidDOB(dob: string) {
  // DD/MM/AAAA
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dob)) return false;

  const [ddS, mmS, yyyyS] = dob.split("/");
  const dd = parseInt(ddS, 10);
  const mm = parseInt(mmS, 10);
  const yyyy = parseInt(yyyyS, 10);

  if (yyyy < 1900 || yyyy > 2100) return false;
  if (mm < 1 || mm > 12) return false;

  const maxDays = new Date(yyyy, mm, 0).getDate();
  if (dd < 1 || dd > maxDays) return false;

  // não permitir datas futuras
  const date = new Date(yyyy, mm - 1, dd);
  const now = new Date();
  if (date.getTime() > now.getTime()) return false;

  return true;
}
