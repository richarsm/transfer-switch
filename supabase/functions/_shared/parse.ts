export type Verdict = "success" | "failure" | "unclear";

export function extractTrackingCode(text: string): string | null {
  const match = text.toUpperCase().match(/\bTT-[A-Z0-9]{4}\b/);
  return match ? match[0] : null;
}

export function parseCubaReply(
  text: string,
  expectedAmount?: number,
): { verdict: Verdict; reference: string } {
  const raw = text.trim();
  const folded = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const reference = extractReference(raw);
  if (/(saldo insuficiente|no pude|no se pudo|rechazad|fallo|falló|error\b)/i.test(folded)) {
    return { verdict: "failure", reference };
  }
  if (expectedAmount && amountLooksWrong(raw, expectedAmount)) {
    return { verdict: "unclear", reference };
  }
  if (reference || /(listo|hecho|enviado|realizado|\bok\b|confirmad)/i.test(folded)) {
    return { verdict: "success", reference };
  }
  return { verdict: "unclear", reference };
}

export function whatsappDigits(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8 && digits.startsWith("5")) return `53${digits}`;
  return digits;
}

function extractReference(text: string): string {
  const ticket = text.match(/\b(?:ref|ticket|sms|id)[:\s#-]*([A-Z0-9-]{5,})\b/i);
  if (ticket) return ticket[1];
  const digits = text.match(/\b\d{6,14}\b/);
  return digits ? digits[0] : "";
}

function amountLooksWrong(text: string, expected: number): boolean {
  const stripped = text.replace(/\b(?:ref|ticket|sms|id)[:\s#-]*[A-Z0-9-]{5,}\b/gi, "");
  const found = stripped.match(/\b(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})(?:[.,]\d{2})?\b/);
  if (!found) return false;
  const n = Number(found[1].replace(/[.\s]/g, ""));
  if (!Number.isFinite(n) || n < 100) return false;
  if (n < expected * 0.5 || n > expected * 1.5) return false;
  return Math.abs(n - expected) > Math.max(1, expected * 0.05);
}
