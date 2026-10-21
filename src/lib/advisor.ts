import type { AppSettings, Currency, Operation, OperationKind, Profile, Snapshot, TransferLeg } from "../domain/types";
import { brandedEmailHtml } from "./email-template";
import { havanaDateISO } from "./havana";
import { formatMoney, round2 } from "./money";
import { kindLabel } from "./operations";

export const DEFAULT_COMMISSION_PERCENT = 6;

const KINDS: OperationKind[] = ["transfer", "mobile_recharge", "cash_cup", "cash_usd"];

export function commissionPercent(settings?: AppSettings | null): number {
  const n = Number(settings?.advisorCommissionPercent);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : DEFAULT_COMMISSION_PERCENT;
}

export function operationDay(op: Pick<Operation, "createdAt">): string {
  return havanaDateISO(new Date(op.createdAt));
}

export function opsOnDay(operations: Operation[], day: string): Operation[] {
  return operations.filter((op) => op.status !== "cancelled" && operationDay(op) === day);
}

export function completedTransfers(
  operations: Operation[],
  legs: TransferLeg[],
  day: string,
  createdBy?: string,
): { count: number; gyn: number; cup: number } {
  const sent = new Set(legs.filter((l) => l.status === "sent").map((l) => l.operationId));
  const rows = opsOnDay(operations, day).filter((op) => {
    if (op.kind !== "transfer") return false;
    if (createdBy && op.createdBy !== createdBy) return false;
    return op.status === "confirmed" || sent.has(op.id);
  });
  return {
    count: rows.length,
    gyn: round2(rows.reduce((s, o) => s + o.amountGyn, 0)),
    cup: round2(rows.reduce((s, o) => s + o.amountCup, 0)),
  };
}

export type KindSlice = {
  kind: OperationKind;
  count: number;
  totalGyn: number;
  collectedGyn: number;
  amount: number;
  currency: Currency;
  commissionGyn: number;
};

export type AdvisorDayRow = {
  profile: Profile;
  count: number;
  totalGyn: number;
  collectedGyn: number;
  commissionGyn: number;
  byKind: KindSlice[];
};

export function advisorVolume(
  operations: Operation[],
  profileId: string,
  day: string,
): { count: number; totalGyn: number; collectedGyn: number } {
  const rows = opsOnDay(operations, day).filter((op) => op.createdBy === profileId);
  return {
    count: rows.length,
    totalGyn: round2(rows.reduce((s, o) => s + o.amountGyn, 0)),
    collectedGyn: round2(
      rows.filter((o) => o.collectStatus === "collected").reduce((s, o) => s + o.amountGyn, 0),
    ),
  };
}

export function advisorCommission(gyn: number, percent: number): number {
  return round2(gyn * (percent / 100));
}

function kindSlice(ops: Operation[], kind: OperationKind, percent: number): KindSlice {
  const rows = ops.filter((op) => op.kind === kind);
  const totalGyn = round2(rows.reduce((s, o) => s + o.amountGyn, 0));
  const cashUsd = kind === "cash_usd";
  return {
    kind,
    count: rows.length,
    totalGyn,
    collectedGyn: round2(
      rows.filter((o) => o.collectStatus === "collected").reduce((s, o) => s + o.amountGyn, 0),
    ),
    amount: round2(rows.reduce((s, o) => s + (cashUsd ? o.amountUsd : o.amountCup), 0)),
    currency: cashUsd ? "USD" : "CUP",
    commissionGyn: advisorCommission(totalGyn, percent),
  };
}

export function advisorDayRows(snapshot: Snapshot, day: string): AdvisorDayRow[] {
  const percent = commissionPercent(snapshot.settings);
  const people = snapshot.profiles.filter((p) => p.role !== "cuba");
  return people
    .map((profile) => {
      const ops = opsOnDay(snapshot.operations, day).filter((op) => op.createdBy === profile.id);
      const totalGyn = round2(ops.reduce((s, o) => s + o.amountGyn, 0));
      return {
        profile,
        count: ops.length,
        totalGyn,
        collectedGyn: round2(
          ops.filter((o) => o.collectStatus === "collected").reduce((s, o) => s + o.amountGyn, 0),
        ),
        commissionGyn: advisorCommission(totalGyn, percent),
        byKind: KINDS.map((kind) => kindSlice(ops, kind, percent)).filter((s) => s.count > 0),
      };
    })
    .filter((row) => row.profile.active || row.count > 0)
    .sort((a, b) => b.totalGyn - a.totalGyn || a.profile.displayName.localeCompare(b.profile.displayName));
}

export function advisorSummaryTable(rows: AdvisorDayRow[], percent: number) {
  const tableRows: Array<{ cells: string[]; tone: "section" | "normal" | "total" }> = [];
  for (const row of rows) {
    if (!row.count) continue;
    tableRows.push({
      tone: "section",
      cells: [row.profile.displayName, row.profile.email, "", "", "", "", ""],
    });
    for (const slice of row.byKind) {
      tableRows.push({
        tone: "normal",
        cells: [
          "",
          kindLabel(slice.kind),
          String(slice.count),
          formatMoney(slice.totalGyn, "GYN"),
          formatMoney(slice.collectedGyn, "GYN"),
          formatMoney(slice.amount, slice.currency),
          formatMoney(slice.commissionGyn, "GYN"),
        ],
      });
    }
    tableRows.push({
      tone: "total",
      cells: [
        "",
        "Total asesor",
        String(row.count),
        formatMoney(row.totalGyn, "GYN"),
        formatMoney(row.collectedGyn, "GYN"),
        "",
        `${percent}%  ${formatMoney(row.commissionGyn, "GYN")}`,
      ],
    });
  }
  const totalOps = rows.reduce((s, r) => s + r.count, 0);
  const totalGyn = round2(rows.reduce((s, r) => s + r.totalGyn, 0));
  const collected = round2(rows.reduce((s, r) => s + r.collectedGyn, 0));
  const commission = round2(rows.reduce((s, r) => s + r.commissionGyn, 0));
  if (totalOps) {
    tableRows.push({
      tone: "total",
      cells: [
        "TOTAL",
        "",
        String(totalOps),
        formatMoney(totalGyn, "GYN"),
        formatMoney(collected, "GYN"),
        "",
        formatMoney(commission, "GYN"),
      ],
    });
  }
  return tableRows;
}

export function advisorEmailText(row: AdvisorDayRow, day: string, percent: number): string {
  const kinds = row.byKind.map(
    (slice) =>
      `- ${kindLabel(slice.kind)}: ${slice.count} ops, ${formatMoney(slice.totalGyn, "GYN")}, ${formatMoney(slice.amount, slice.currency)}, comision ${formatMoney(slice.commissionGyn, "GYN")}`,
  );
  return [
    `Hola ${row.profile.displayName},`,
    "",
    `Resumen T-Transfer del ${day} (reloj de Cuba).`,
    "",
    `Operaciones: ${row.count}`,
    `Volumen: ${formatMoney(row.totalGyn, "GYN")}`,
    `Recolectado: ${formatMoney(row.collectedGyn, "GYN")}`,
    `Tu saldo (${percent}%): ${formatMoney(row.commissionGyn, "GYN")}`,
    "",
    "Por tipo:",
    ...(kinds.length ? kinds : ["- Sin operaciones"]),
    "",
    "T-Transfer",
  ].join("\n");
}

export function advisorEmailHtml(row: AdvisorDayRow, day: string, percent: number): string {
  const fields = [
    { label: "Asesor", value: row.profile.displayName },
    { label: "Correo", value: row.profile.email },
    { label: "Día", value: day },
    { label: "Operaciones", value: String(row.count) },
    { label: "Volumen GYN", value: formatMoney(row.totalGyn, "GYN") },
    { label: "Recolectado", value: formatMoney(row.collectedGyn, "GYN") },
    { label: `Tu saldo (${percent}%)`, value: formatMoney(row.commissionGyn, "GYN") },
    ...row.byKind.map((slice) => ({
      label: kindLabel(slice.kind),
      value: `${slice.count} ops · ${formatMoney(slice.totalGyn, "GYN")} · ${formatMoney(slice.amount, slice.currency)} · comisión ${formatMoney(slice.commissionGyn, "GYN")}`,
    })),
  ];
  return brandedEmailHtml({
    heading: `Tu saldo del ${day}`,
    intro: `Hola ${row.profile.displayName}. Resumen de tus operaciones en T-Transfer (reloj de Cuba).`,
    fields,
    note: "Este resumen se envía solo cuando el administrador lo solicita.",
    helpTitle: "",
  });
}
