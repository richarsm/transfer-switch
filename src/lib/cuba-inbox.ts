import type {
  CubaMessage,
  CubaOperator,
  CubaOperatorKind,
  CubaThread,
  CubaThreadStatus,
  MessageChannel,
  Operation,
  OperationKind,
  Profile,
  Snapshot,
} from "../domain/types";
import { extractTrackingCode } from "./tracking";
import { whatsappDigits } from "./whatsapp";

export const CUBA_TIMEOUT_MS = 45 * 60 * 1000;

export type CubaVerdict = "success" | "failure" | "unclear";

export function parseCubaReply(
  text: string,
  expectedAmount?: number,
): { verdict: CubaVerdict; reference: string } {
  const raw = text.trim();
  const folded = fold(raw);
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

export function pickCubaOperator(
  operators: CubaOperator[],
  threads: CubaThread[],
  kind: OperationKind,
): CubaOperator | undefined {
  const cover: CubaOperatorKind | null =
    kind === "transfer" || kind === "mobile_recharge" ? kind : null;
  if (!cover) return undefined;
  const open = new Set(
    threads
      .filter((t) => t.status === "queued" || t.status === "sent" || t.status === "awaiting_reply")
      .map((t) => t.operatorId),
  );
  const eligible = operators.filter((o) => o.active && o.kinds.includes(cover) && (o.phone || o.email));
  return (
    eligible.find((o) => !open.has(o.id)) ??
    eligible.slice().sort((a, b) => loadOf(threads, a.id) - loadOf(threads, b.id))[0]
  );
}

export function inboxOpenCount(threads: CubaThread[]): number {
  return threads.filter((t) =>
    t.status === "awaiting_reply" ||
    t.status === "sent" ||
    t.status === "needs_review" ||
    t.status === "timed_out" ||
    t.status === "queued",
  ).length;
}

export function inboxActionCount(threads: CubaThread[]): number {
  return threads.filter((t) => t.status === "needs_review" || t.status === "timed_out").length;
}

export function profileOwnsCubaOperator(
  profile: Pick<Profile, "id" | "email" | "phone"> | null | undefined,
  operator: Pick<CubaOperator, "profileId" | "email" | "phone"> | null | undefined,
): boolean {
  if (!profile || !operator) return false;
  if (operator.profileId && operator.profileId === profile.id) return true;
  const email = profile.email.trim().toLowerCase();
  const opEmail = operator.email.trim().toLowerCase();
  if (email && opEmail && email === opEmail) return true;
  const phone = whatsappDigits(profile.phone);
  const opPhone = whatsappDigits(operator.phone);
  if (phone.length >= 8 && opPhone.length >= 8 && (phone.endsWith(opPhone) || opPhone.endsWith(phone))) {
    return true;
  }
  return false;
}

export function cubaOperatorForProfile(
  profile: Profile | null | undefined,
  operators: CubaOperator[],
): CubaOperator | undefined {
  if (!profile) return undefined;
  return operators.find((o) => profileOwnsCubaOperator(profile, o));
}

export function canSeeOperation(
  profile: Profile | null | undefined,
  operation: Pick<Operation, "createdBy" | "cubaOperatorId">,
  operators: CubaOperator[],
): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  const mine = cubaOperatorForProfile(profile, operators);
  if (profile.role === "cuba") {
    return Boolean(mine && operation.cubaOperatorId === mine.id);
  }
  if (operation.createdBy === profile.id) return true;
  return Boolean(mine && operation.cubaOperatorId === mine.id);
}

export function canEnterCubaReference(
  profile: Profile | null | undefined,
  thread: Pick<CubaThread, "operatorId">,
  operators: CubaOperator[],
): boolean {
  const operator = operators.find((o) => o.id === thread.operatorId);
  return profileOwnsCubaOperator(profile, operator);
}

export function threadsForProfile(
  profile: Profile | null | undefined,
  threads: CubaThread[],
  operators: CubaOperator[],
): CubaThread[] {
  if (!profile) return [];
  if (profile.role === "admin") return threads;
  return threads.filter((t) => canEnterCubaReference(profile, t, operators));
}

export function threadStatusLabel(status: CubaThreadStatus): string {
  if (status === "queued") return "En cola";
  if (status === "sent") return "Enviado";
  if (status === "awaiting_reply") return "Esperando respuesta";
  if (status === "auto_matched") return "Confirmado";
  if (status === "needs_review") return "Revisar";
  if (status === "timed_out") return "Sin respuesta";
  return "Falló";
}

export function threadStatusTone(status: CubaThreadStatus): string {
  if (status === "auto_matched") return "ok";
  if (status === "failed" || status === "timed_out") return "bad";
  return "warn";
}

export function matchInboundThread(
  snapshot: Pick<Snapshot, "cubaThreads" | "cubaOperators" | "operations">,
  input: { body: string; fromPhone?: string; fromEmail?: string },
): CubaThread | undefined {
  const code = extractTrackingCode(input.body);
  if (code) {
    const byCode = snapshot.cubaThreads.find(
      (t) => t.code.toUpperCase() === code && isOpenThread(t),
    );
    if (byCode) return byCode;
  }
  const phone = input.fromPhone ? whatsappDigits(input.fromPhone) : "";
  const email = input.fromEmail?.trim().toLowerCase() ?? "";
  const operator = snapshot.cubaOperators.find((o) => {
    if (phone && digitsTail(whatsappDigits(o.phone), 8) === digitsTail(phone, 8)) return true;
    if (email && o.email.trim().toLowerCase() === email) return true;
    return false;
  });
  if (!operator) return undefined;
  const open = snapshot.cubaThreads
    .filter((t) => t.operatorId === operator.id && isOpenThread(t))
    .sort((a, b) => (b.sentAt ?? b.assignedAt).localeCompare(a.sentAt ?? a.assignedAt));
  if (open.length === 1) return open[0];
  return undefined;
}

export function latestMessage(
  messages: CubaMessage[],
  threadId: string,
): CubaMessage | undefined {
  return messages
    .filter((m) => m.threadId === threadId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function instructionKind(kind: OperationKind): CubaOperatorKind | null {
  if (kind === "transfer" || kind === "mobile_recharge") return kind;
  return null;
}

export function expectedAmount(op: Operation): number | undefined {
  if (op.kind === "cash_usd") return op.amountUsd;
  return op.amountCup > 0 ? op.amountCup : undefined;
}

export function timedOut(thread: CubaThread, now = Date.now()): boolean {
  if (thread.status !== "sent" && thread.status !== "awaiting_reply") return false;
  const start = Date.parse(thread.sentAt ?? thread.assignedAt);
  if (!Number.isFinite(start)) return false;
  return now - start >= CUBA_TIMEOUT_MS;
}

function isOpenThread(t: CubaThread): boolean {
  return (
    t.status === "queued" ||
    t.status === "sent" ||
    t.status === "awaiting_reply" ||
    t.status === "needs_review" ||
    t.status === "timed_out"
  );
}

function loadOf(threads: CubaThread[], operatorId: string): number {
  return threads.filter(
    (t) =>
      t.operatorId === operatorId &&
      (t.status === "queued" || t.status === "sent" || t.status === "awaiting_reply"),
  ).length;
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function digitsTail(value: string, n: number): string {
  return value.slice(-n);
}

export function channelLabel(channel: MessageChannel): string {
  if (channel === "email") return "Correo";
  if (channel === "wa_me") return "WhatsApp (manual)";
  return "WhatsApp";
}
