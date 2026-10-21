import type { OperationKind } from "../domain/types";
import { formatMoney } from "./money";

export function transferWhatsAppText(input: {
  card: string;
  name: string;
  mobile: string;
  code?: string;
}): string {
  return cubaInstructionText({
    kind: "transfer",
    code: input.code ?? "",
    card: input.card,
    name: input.name,
    mobile: input.mobile,
  });
}

export function cubaInstructionText(input: {
  kind: OperationKind;
  code: string;
  mobile: string;
  card?: string;
  name?: string;
  amountCup?: number;
  amountUsd?: number;
}): string {
  const lines: string[] = [];
  if (input.code) lines.push(input.code);
  if (input.kind === "mobile_recharge") {
    if (input.amountCup) lines.push(`Recarga: ${formatMoney(input.amountCup, "CUP")}`);
    lines.push(`Movil: ${input.mobile.trim()}`);
  } else if (input.kind === "transfer") {
    if (input.card) lines.push(`Tarjeta: ${formatCard(input.card)}`);
    if (input.name) lines.push(`Nombre : ${input.name.trim()}`);
    lines.push(`Movil: ${input.mobile.trim()}`);
  } else {
    const amount =
      input.kind === "cash_usd" && input.amountUsd
        ? formatMoney(input.amountUsd, "USD")
        : input.amountCup
          ? formatMoney(input.amountCup, "CUP")
          : "";
    if (amount) lines.push(`Entrega: ${amount}`);
    if (input.name) lines.push(`Nombre : ${input.name.trim()}`);
    lines.push(`Movil: ${input.mobile.trim()}`);
  }
  return lines.join("\n");
}

export function emailSubjectForCode(code: string): string {
  return `[${code}] T-Transfer Cuba`;
}

export function emailSubjectForClose(code: string): string {
  return `[${code}] Operación completada`;
}

export function advisorCloseEmailText(input: {
  advisorName: string;
  clientText: string;
}): string {
  const who = input.advisorName.trim() || "asesor";
  return [
    "T-Transfer",
    `Hola ${who}.`,
    "La operación quedó completada. Este correo cierra el ciclo.",
    "",
    input.clientText,
  ].join("\n");
}

export function clientConfirmationText(input: {
  kind: OperationKind;
  code: string;
  contactName: string;
  amountGyn: number;
  amountCup: number;
  amountUsd: number;
  cubaPhone: string;
  cubaRecipientName: string;
  cubaCardNumber: string;
  cubaAddress: string;
  provinceName?: string;
  references: string[];
}): string {
  const lines = [
    "T-Transfer",
    input.contactName.trim() ? `Hola ${input.contactName.trim()}.` : "Hola.",
    `Tu ${kindPhrase(input.kind)} ya se realizó.`,
  ];
  if (input.code) lines.push(`Código: ${input.code}`);
  if (input.kind === "cash_usd" && input.amountUsd) {
    lines.push(`Monto: ${formatMoney(input.amountUsd, "USD")}`);
  } else if (input.amountCup) {
    lines.push(`Monto: ${formatMoney(input.amountCup, "CUP")}`);
  }
  if (input.amountGyn) lines.push(`Cobro: ${formatMoney(input.amountGyn, "GYN")}`);

  if (input.kind === "mobile_recharge") {
    if (input.cubaPhone) lines.push(`Número recargado: ${input.cubaPhone.trim()}`);
  } else if (input.kind === "transfer") {
    if (input.cubaRecipientName) lines.push(`Beneficiario: ${input.cubaRecipientName.trim()}`);
    const card = cardHint(input.cubaCardNumber);
    if (card) lines.push(`Tarjeta: ${card}`);
  } else {
    if (input.provinceName) lines.push(`Provincia: ${input.provinceName}`);
    if (input.cubaRecipientName) lines.push(`Quien recibe: ${input.cubaRecipientName.trim()}`);
    if (input.cubaPhone) lines.push(`WhatsApp: ${input.cubaPhone.trim()}`);
    if (input.cubaAddress) lines.push(`Dirección: ${input.cubaAddress.trim()}`);
  }

  const refs = input.references.map((r) => r.trim()).filter(Boolean);
  if (refs.length) lines.push(`Confirmación: ${refs.join(", ")}`);
  else if (input.code) lines.push(`Confirmación: ${input.code}`);
  return lines.join("\n");
}

function kindPhrase(kind: OperationKind): string {
  if (kind === "mobile_recharge") return "recarga móvil";
  if (kind === "cash_cup") return "entrega de efectivo CUP";
  if (kind === "cash_usd") return "entrega de efectivo USD";
  return "transferencia a tarjeta";
}

function cardHint(card: string): string {
  const digits = card.replace(/\D/g, "");
  if (digits.length >= 4) return `**** ${digits.slice(-4)}`;
  return card.trim();
}

export function canSendTransferWhatsApp(input: {
  card: string;
  name: string;
  mobile: string;
}): boolean {
  return Boolean(input.card.replace(/\D/g, "") && input.name.trim() && input.mobile.trim());
}

export function canSendCubaInstruction(input: {
  kind: OperationKind;
  mobile: string;
  card?: string;
  name?: string;
}): boolean {
  if (input.kind === "transfer") {
    return canSendTransferWhatsApp({
      card: input.card ?? "",
      name: input.name ?? "",
      mobile: input.mobile,
    });
  }
  return Boolean(input.mobile.trim());
}

export function whatsappDigits(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8 && digits.startsWith("5")) return `53${digits}`;
  return digits;
}

export function whatsappUrl(text: string, phone = ""): string {
  const digits = whatsappDigits(phone);
  const encoded = encodeURIComponent(text);
  return digits ? `https://wa.me/${digits}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

function formatCard(card: string): string {
  const digits = card.replace(/\D/g, "");
  if (digits.length === 16) return digits.replace(/(\d{4})(?=\d)/g, "$1-");
  return card.trim();
}
