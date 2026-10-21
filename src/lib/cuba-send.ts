import type { CubaOperator, MessageChannel, Operation } from "../domain/types";
import { cubaInstructionEmailHtml } from "./email-template";
import { cubaInstructionText, emailSubjectForClose, emailSubjectForCode, whatsappUrl } from "./whatsapp";

export type CubaSendResult = {
  channel: MessageChannel;
  body: string;
  waMeUrl: string;
  emailed: boolean;
  cloudSent: boolean;
  error: string;
};

export async function sendCubaInstruction(
  operation: Operation,
  operator: CubaOperator,
): Promise<CubaSendResult> {
  const body = cubaInstructionText({
    kind: operation.kind,
    code: operation.trackingCode,
    mobile: operation.cubaPhone,
    card: operation.cubaCardNumber,
    name: operation.cubaRecipientName,
    amountCup: operation.amountCup,
    amountUsd: operation.amountUsd,
  });
  const waMeUrl = whatsappUrl(body, operator.phone);
  const fallback: CubaSendResult = {
    channel: "wa_me",
    body,
    waMeUrl,
    emailed: false,
    cloudSent: false,
    error: "",
  };

  const cloud = await postCubaSend({
    operationId: operation.id,
    operatorId: operator.id,
    code: operation.trackingCode,
    phone: operator.phone,
    email: operator.email,
    text: body,
    subject: emailSubjectForCode(operation.trackingCode),
    heading: `Envío ${operation.trackingCode} para procesar`,
    html: cubaInstructionEmailHtml(operation, operator),
    kind: operation.kind,
  });
  if (!cloud.sent) {
    return { ...fallback, emailed: cloud.emailed, error: cloud.error };
  }
  return {
    channel: cloud.channel === "email" ? "email" : "whatsapp",
    body,
    waMeUrl: "",
    emailed: cloud.emailed,
    cloudSent: true,
    error: "",
  };
}

export async function sendPlainEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  heading?: string;
}): Promise<{ emailed: boolean; error: string }> {
  const cloud = await postCubaSend({
    email: input.to,
    text: input.text,
    emailText: input.text,
    subject: input.subject,
    html: input.html,
    heading: input.heading,
  });
  return { emailed: cloud.emailed, error: cloud.error };
}

export async function sendWhatsAppText(input: {
  phone: string;
  text: string;
  code?: string;
  operationId?: string;
}): Promise<{ cloudSent: boolean; waMeUrl: string; emailed: boolean; error: string }> {
  return sendOperationCloseNotice({ ...input, advisorEmail: "", advisorText: "" });
}

export async function sendOperationCloseNotice(input: {
  phone: string;
  text: string;
  advisorEmail?: string;
  advisorText?: string;
  advisorHtml?: string;
  code?: string;
  operationId?: string;
}): Promise<{ cloudSent: boolean; waMeUrl: string; emailed: boolean; error: string }> {
  const waMeUrl = whatsappUrl(input.text, input.phone);
  const cloud = await postCubaSend({
    operationId: input.operationId,
    code: input.code,
    phone: input.phone,
    email: input.advisorEmail?.trim() || undefined,
    text: input.text,
    emailText: input.advisorText?.trim() || undefined,
    html: input.advisorHtml,
    heading: input.code ? `Se completó ${input.code}` : "Operación completada",
    subject: input.code ? emailSubjectForClose(input.code) : "Operación completada",
  });
  if (cloud.channel === "whatsapp" && cloud.sent) {
    return { cloudSent: true, waMeUrl: "", emailed: cloud.emailed, error: "" };
  }
  return { cloudSent: false, waMeUrl, emailed: cloud.emailed, error: cloud.error };
}

async function postCubaSend(payload: {
  operationId?: string;
  operatorId?: string;
  code?: string;
  phone?: string;
  email?: string;
  text: string;
  emailText?: string;
  html?: string;
  heading?: string;
  subject?: string;
  kind?: string;
}): Promise<{ sent: boolean; emailed: boolean; channel: MessageChannel; error: string }> {
  const empty = { sent: false, emailed: false, channel: "wa_me" as const, error: "" };
  const url = import.meta.env.VITE_SUPABASE_URL ?? "";
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return empty;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/functions/v1/cuba-send`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
          signal: AbortSignal.timeout(15000),
      body: JSON.stringify(payload),
    });
    if (!res.ok) return empty;
    const data = (await res.json()) as {
      channel?: MessageChannel;
      sent?: boolean;
      emailed?: boolean;
      error?: string;
    };
    return {
      sent: Boolean(data.sent),
      emailed: Boolean(data.emailed),
      channel: data.channel === "email" || data.channel === "whatsapp" ? data.channel : "wa_me",
      error: data.error ?? "",
    };
  } catch {
    return empty;
  }
}
