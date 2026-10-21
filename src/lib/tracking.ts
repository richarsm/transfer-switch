const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeTrackingCode(taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (c) => c.toUpperCase()));
  const cryptoObj = globalThis.crypto;
  for (let attempt = 0; attempt < 40; attempt++) {
    const bytes = new Uint8Array(4);
    if (typeof cryptoObj?.getRandomValues === "function") cryptoObj.getRandomValues(bytes);
    else for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
    const body = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    const code = `TT-${body}`;
    if (!used.has(code)) return code;
  }
  return `TT-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export function extractTrackingCode(text: string): string | null {
  const match = text.toUpperCase().match(/\bTT-[A-Z0-9]{4}\b/);
  return match ? match[0] : null;
}

export function isTrackingCode(value: string): boolean {
  return /^TT-[A-Z0-9]{4}$/i.test(value.trim());
}
