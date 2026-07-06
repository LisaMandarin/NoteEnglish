export const PASSWORD_RULES_TEXT =
  "密碼只能使用英文字母和數字，且至少需要 6 個字元。";

export function validatePassword(password: string): boolean {
  return /^[A-Za-z0-9]{6,}$/.test(password);
}
