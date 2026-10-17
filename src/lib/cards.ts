export function formatCardNumber(raw: string, maxDigits = 16): string {
  const digits = raw.replace(/\D/g, "").slice(0, maxDigits);
  return digits.replace(/(\d{4})(?=\d)/g, "$1-");
}
