import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { extractTrackingCode, parseCubaReply, whatsappDigits } from "./parse.ts";

type Inbound = {
  body: string;
  fromPhone?: string;
  fromEmail?: string;
  channel: "whatsapp" | "email" | "wa_me";
  mediaUrl?: string;
  externalId?: string;
};

export async function ingestInbound(sb: SupabaseClient, input: Inbound) {
  const body = (input.body ?? "").trim();
  const mediaUrl = input.mediaUrl ?? "";
  if (!body && !mediaUrl) return { matched: false, reason: "empty" };

  const { data: threads, error: threadErr } = await sb
    .from("cuba_threads")
    .select("*")
    .in("status", ["queued", "sent", "awaiting_reply", "needs_review", "timed_out"]);
  if (threadErr) throw threadErr;

  const { data: operators } = await sb.from("cuba_operators").select("*");
  const code = extractTrackingCode(body);
  let thread = code
    ? (threads ?? []).find((t) => String(t.code).toUpperCase() === code)
    : undefined;

  if (!thread && (input.fromPhone || input.fromEmail)) {
    const phone = input.fromPhone ? whatsappDigits(input.fromPhone) : "";
    const email = input.fromEmail?.trim().toLowerCase() ?? "";
    const operator = (operators ?? []).find((o) => {
      const opPhone = whatsappDigits(String(o.phone ?? ""));
      if (phone && opPhone.slice(-8) === phone.slice(-8)) return true;
      if (email && String(o.email ?? "").trim().toLowerCase() === email) return true;
      return false;
    });
    if (operator) {
      const open = (threads ?? [])
        .filter((t) => t.operator_id === operator.id)
        .sort((a, b) => String(b.sent_at ?? b.assigned_at).localeCompare(String(a.sent_at ?? a.assigned_at)));
      if (open.length === 1) thread = open[0];
    }
  }

  if (!thread) return { matched: false, reason: "no_thread" };

  const now = new Date().toISOString();
  const messageId = crypto.randomUUID();
  await sb.from("cuba_messages").insert({
    id: messageId,
    thread_id: thread.id,
    operation_id: thread.operation_id,
    operator_id: thread.operator_id,
    channel: input.channel,
    direction: "in",
    body,
    media_url: mediaUrl,
    external_id: input.externalId ?? "",
    created_at: now,
  });

  const { data: operation } = await sb
    .from("operations")
    .select("id, kind, amount_cup, amount_usd, delivery_status, collect_status, mode")
    .eq("id", thread.operation_id)
    .maybeSingle();

  const expected =
    operation?.kind === "cash_usd"
      ? Number(operation.amount_usd)
      : Number(operation?.amount_cup ?? 0) || undefined;

  const parsed =
    !body && mediaUrl
      ? { verdict: "unclear" as const, reference: "" }
      : parseCubaReply(body, expected);

  const reference = parsed.reference || String(thread.code ?? "");
  let status = "needs_review";
  let lastError = "";
  if (parsed.verdict === "failure") {
    status = "failed";
    lastError = "El operador reportó un fallo.";
    if (
      operation &&
      (operation.kind === "mobile_recharge" || operation.kind === "cash_cup" || operation.kind === "cash_usd") &&
      operation.delivery_status !== "failed"
    ) {
      await sb
        .from("operations")
        .update({ delivery_status: "failed", delivered_at: null })
        .eq("id", operation.id);
    }
  } else if (parsed.verdict === "success") {
    status = "auto_matched";
    if (
      operation &&
      (operation.kind === "mobile_recharge" || operation.kind === "cash_cup" || operation.kind === "cash_usd") &&
      operation.delivery_status !== "sent" &&
      !(operation.mode === "collect_then_transfer" && operation.collect_status !== "collected")
    ) {
      await sb
        .from("operations")
        .update({
          delivery_status: "sent",
          delivery_reference: reference,
          delivered_at: now,
        })
        .eq("id", operation.id);
    }
    if (operation?.kind === "transfer") {
      const { data: legs } = await sb
        .from("transfer_legs")
        .select("id, status")
        .eq("operation_id", operation.id)
        .eq("status", "pending");
      if ((legs ?? []).length === 1) {
        await sb
          .from("transfer_legs")
          .update({ status: "sent", reference, sent_at: now })
          .eq("id", legs![0].id);
      } else {
        status = "needs_review";
        lastError =
          (legs ?? []).length > 1
            ? "Hay que revisar las patas CUP."
            : "No hay una pata CUP pendiente para marcar.";
      }
    }
  }

  await sb
    .from("cuba_threads")
    .update({
      status,
      replied_at: now,
      parsed_reference: reference,
      last_error: lastError,
    })
    .eq("id", thread.id);

  return { matched: true, threadId: thread.id, status, verdict: parsed.verdict };
}
