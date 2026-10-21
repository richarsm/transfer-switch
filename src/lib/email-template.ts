import type { CubaOperator, Operation, OperationKind } from "../domain/types";
import { formatHavanaDateTime } from "./havana";
import { formatMoney } from "./money";
import { kindLabel } from "./operations";

export type EmailField = { label: string; value: string };

export const EMAIL_LOGO_CID = "logo@t-transfer";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function brandedEmailHtml(input: {
  heading: string;
  intro?: string;
  fields?: EmailField[];
  note?: string;
  helpTitle?: string;
}): string {
  const fields = (input.fields ?? []).filter((f) => f.value.trim());
  const fieldRows = fields
    .map(
      (f, i) => `
        <tr>
          <td style="padding:${i === 0 ? "22px" : "8px"} 24px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.04em;color:#d7b56a;">
            ${esc(f.label)}
          </td>
        </tr>
        <tr>
          <td style="padding:4px 24px ${i === fields.length - 1 ? "22px" : "10px"} 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:600;color:#fffaf3;line-height:1.4;">
            ${esc(f.value).replace(/\n/g, "<br>")}
          </td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>T-Transfer</title>
</head>
<body style="margin:0;padding:0;background:#e7e0d2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e7e0d2;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background:#f3eee4;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="44" height="44" style="width:44px;height:44px;">
                    <img src="cid:${EMAIL_LOGO_CID}" width="44" height="44" alt="T-Transfer" style="display:block;border:0;width:44px;height:44px;border-radius:12px;">
                  </td>
                  <td style="padding-left:12px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#16362c;">T-Transfer</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px 28px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:700;color:#16362c;">
              ${esc(input.heading)}
            </td>
          </tr>
          ${
            input.intro
              ? `<tr><td style="padding:8px 28px 20px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#3d5248;">${esc(input.intro)}</td></tr>`
              : ""
          }
          ${
            fieldRows
              ? `<tr><td style="padding:0 28px 8px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#16362c;border-radius:16px;">
              ${fieldRows}
            </table>
          </td></tr>`
              : ""
          }
          ${
            input.note
              ? `${
                  input.helpTitle === ""
                    ? ""
                    : `<tr><td style="padding:18px 28px 4px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#16362c;">${esc(input.helpTitle || "¿Algún problema con esta operación?")}</td></tr>`
                }
          <tr><td style="padding:${input.helpTitle === "" ? "18px" : "4px"} 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#3d5248;">${esc(input.note)}</td></tr>`
              : ""
          }
          <tr>
            <td style="padding:20px 28px 28px 28px;border-top:1px solid #cfc4b0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#3d5248;">
              Correo generado por el administrador del sistema, no responder<br>
              T-Transfer @ 2026
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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

function formatCard(card: string): string {
  const digits = card.replace(/\D/g, "");
  if (digits.length === 16) return digits.replace(/(\d{4})(?=\d)/g, "$1-");
  return card.trim();
}

function add(fields: EmailField[], label: string, value?: string | number | null) {
  const text = typeof value === "number" ? String(value) : (value ?? "").trim();
  if (text) fields.push({ label, value: text });
}

export function closeCycleEmailHtml(input: {
  advisorName: string;
  operation: Operation;
  provinceName?: string;
  references: string[];
}): string {
  const op = input.operation;
  const who = input.advisorName.trim() || "asesor";
  const contact = op.contactName.trim() || "el contacto";
  const fields: EmailField[] = [];
  add(fields, "Código", op.trackingCode);
  add(fields, "Tipo", kindLabel(op.kind));
  add(fields, "Contacto Guyana", op.contactName);
  add(fields, "WhatsApp Guyana", op.contactPhone);
  if (op.kind === "cash_usd" && op.amountUsd) {
    add(fields, "Monto", formatMoney(op.amountUsd, "USD"));
  } else if (op.amountCup) {
    add(fields, "Monto", formatMoney(op.amountCup, "CUP"));
  }
  if (op.amountGyn) add(fields, "Cobro", formatMoney(op.amountGyn, "GYN"));
  if (op.kind === "mobile_recharge") {
    add(fields, "Número recargado", op.cubaPhone);
  } else if (op.kind === "transfer") {
    add(fields, "Beneficiario", op.cubaRecipientName);
    add(fields, "Tarjeta", cardHint(op.cubaCardNumber));
  } else {
    add(fields, "Provincia", input.provinceName);
    add(fields, "Quién recibe", op.cubaRecipientName);
    add(fields, "WhatsApp Cuba", op.cubaPhone);
    add(fields, "Dirección", op.cubaAddress);
  }
  const refs = input.references.map((r) => r.trim()).filter(Boolean);
  add(fields, "Confirmación", refs.join(", ") || op.trackingCode);
  add(fields, "Asesor", input.advisorName);
  add(fields, "Fecha", formatHavanaDateTime(op.deliveredAt || op.confirmedAt || op.createdAt));
  return brandedEmailHtml({
    heading: `Se completó ${kindPhrase(op.kind)} ${op.trackingCode}`.trim(),
    intro: `Hola ${who}. El contacto ${contact} ya tiene su ${kindPhrase(op.kind)} realizada. Este correo cierra el ciclo.`,
    fields,
    note: "Responde este correo o revisa la ficha en T-Transfer si hace falta ajustar algún dato.",
  });
}

export function cubaInstructionEmailHtml(operation: Operation, operator?: CubaOperator): string {
  const fields: EmailField[] = [];
  add(fields, "Código", operation.trackingCode);
  add(fields, "Tipo", kindLabel(operation.kind));
  if (operation.kind === "mobile_recharge") {
    if (operation.amountCup) add(fields, "Recarga", formatMoney(operation.amountCup, "CUP"));
    add(fields, "Móvil", operation.cubaPhone);
  } else if (operation.kind === "transfer") {
    add(fields, "Tarjeta", formatCard(operation.cubaCardNumber));
    add(fields, "Nombre", operation.cubaRecipientName);
    add(fields, "Móvil", operation.cubaPhone);
    if (operation.amountCup) add(fields, "Monto", formatMoney(operation.amountCup, "CUP"));
  } else {
    const amount =
      operation.kind === "cash_usd" && operation.amountUsd
        ? formatMoney(operation.amountUsd, "USD")
        : operation.amountCup
          ? formatMoney(operation.amountCup, "CUP")
          : "";
    add(fields, "Entrega", amount);
    add(fields, "Nombre", operation.cubaRecipientName);
    add(fields, "Móvil", operation.cubaPhone);
    add(fields, "Dirección", operation.cubaAddress);
  }
  add(fields, "Fecha", formatHavanaDateTime(operation.createdAt));
  const who = operator?.name.trim();
  return brandedEmailHtml({
    heading: `Envío ${operation.trackingCode} para procesar`,
    intro: who
      ? `Hola ${who}. Tienes un envío en la bandeja T-Transfer. Procesa estos datos y responde con la referencia.`
      : "Hola. Tienes un envío en la bandeja T-Transfer. Procesa estos datos y responde con la referencia.",
    fields,
    note: "Cuando lo completes, responde con la referencia de confirmación.",
  });
}
