import type { Currency } from "../domain/types";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function gynToAmount(gyn: number, per1000: number): number {
  return round2((gyn / 1000) * per1000);
}

export function amountToGyn(amount: number, per1000: number): number {
  if (per1000 === 0) return 0;
  return round2((amount / per1000) * 1000);
}

export function gynToCup(gyn: number, cupPer1000: number): number {
  return gynToAmount(gyn, cupPer1000);
}

export function cupToGyn(cup: number, cupPer1000: number): number {
  return amountToGyn(cup, cupPer1000);
}

export function formatMoney(amount: number, currency: Currency): string {
  const decimals = currency === "USDT" || currency === "USD" ? 2 : 0;
  const formatted = new Intl.NumberFormat("es-CU", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted} ${currency}`;
}

export function formatRate(per1000: number, currency: Currency = "CUP"): string {
  return `1 000 GYN = ${formatMoney(per1000, currency)}`;
}

export function parseAmount(raw: string): number {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
