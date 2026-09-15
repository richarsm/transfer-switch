import type {
  DeliveryStatus,
  Operation,
  OperationKind,
  OperationMode,
  OperationStatus,
  Profile,
  Role,
  TransferLeg,
} from "../domain/types";
import { round2 } from "./money";

export function kindLabel(kind: OperationKind): string {
  if (kind === "mobile_recharge") return "Recarga móvil";
  if (kind === "cash_cup") return "Efectivo CUP";
  if (kind === "cash_usd") return "Efectivo USD";
  return "Transferencia a tarjeta";
}

export function isCashKind(kind: OperationKind): boolean {
  return kind === "cash_cup" || kind === "cash_usd";
}

export function isDeliveryKind(kind: OperationKind): boolean {
  return kind === "mobile_recharge" || isCashKind(kind);
}

export function modeLabel(mode: OperationMode, kind: OperationKind = "transfer"): string {
  if (mode === "collect_then_transfer") {
    if (kind === "mobile_recharge") return "Recoger → recargar";
    if (isCashKind(kind)) return "Recoger → entregar";
    return "Recoger → enviar";
  }
  if (kind === "mobile_recharge") return "Recargar → recoger";
  if (isCashKind(kind)) return "Entregar → recoger";
  return "Enviar → recoger";
}

export function statusLabel(status: OperationStatus): string {
  if (status === "confirmed") return "Confirmada";
  if (status === "cancelled") return "Cancelada";
  if (status === "processing") return "En proceso";
  return "Pendiente";
}

export function statusTone(status: OperationStatus): "ok" | "warn" | "bad" {
  if (status === "confirmed") return "ok";
  if (status === "cancelled") return "bad";
  if (status === "processing") return "warn";
  return "warn";
}

export function assignedCup(legs: TransferLeg[], operationId: string): number {
  return round2(
    legs
      .filter((l) => l.operationId === operationId && l.status !== "failed")
      .reduce((sum, l) => sum + l.amountCup, 0),
  );
}

export function sentCup(legs: TransferLeg[], operationId: string): number {
  return round2(
    legs
      .filter((l) => l.operationId === operationId && l.status === "sent")
      .reduce((sum, l) => sum + l.amountCup, 0),
  );
}

export function isDeliveryComplete(op: Operation, legs: TransferLeg[]): boolean {
  if (isDeliveryKind(op.kind)) return op.deliveryStatus === "sent";
  const assigned = assignedCup(legs, op.id);
  const sent = sentCup(legs, op.id);
  return assigned > 0 && sent >= op.amountCup - 0.001 && assigned >= op.amountCup - 0.001;
}

export function isTerminalStatus(status: OperationStatus): boolean {
  return status === "confirmed" || status === "cancelled";
}

export function hasFulfillmentStarted(
  op: Pick<Operation, "id" | "deliveryStatus">,
  legs: TransferLeg[],
): boolean {
  if (op.deliveryStatus === "sent") return true;
  return legs.some((l) => l.operationId === op.id && l.status !== "failed");
}

export function workflowStatus(
  op: Pick<Operation, "id" | "status" | "deliveryStatus">,
  legs: TransferLeg[],
): OperationStatus {
  if (op.status === "confirmed" || op.status === "cancelled") return op.status;
  return hasFulfillmentStarted(op, legs) ? "processing" : "open";
}

export function cubaPayoutDone(op: Operation, legs: TransferLeg[]): boolean {
  if (isDeliveryKind(op.kind)) return op.deliveryStatus === "sent";
  return legs.some((l) => l.operationId === op.id && l.status === "sent");
}

export function cancelBlockReason(
  op: Operation,
  legs: TransferLeg[],
  user: { id: string; role: Role },
): string | null {
  if (op.status === "cancelled") return "Esta operación ya está cancelada.";
  if (op.status === "confirmed") return "La operación confirmada no se puede cancelar.";
  if (op.collectStatus === "collected") {
    return "El cobro ya fue recogido. El administrador debe editar la operación si hay un problema.";
  }
  if (cubaPayoutDone(op, legs)) {
    return "Ya se realizó el envío a Cuba. El administrador debe editar la operación si hay un problema.";
  }
  if (user.role === "admin") return null;
  if (op.createdBy !== user.id) {
    return "Solo puedes cancelar las operaciones que creaste.";
  }
  if (hasFulfillmentStarted(op, legs) || op.status === "processing") {
    return "El administrador ya está procesando esta operación.";
  }
  return null;
}

export function confirmBlockReason(op: Operation, legs: TransferLeg[]): string | null {
  if (op.status === "cancelled") return "Esta operación está cancelada.";
  if (op.status === "confirmed") return "Esta operación ya está confirmada.";
  if (op.collectStatus !== "collected") {
    return "Confirma primero la recogida del GYN.";
  }
  if (!isDeliveryComplete(op, legs)) {
    if (op.kind === "mobile_recharge") {
      return "Marca la recarga como enviada (con referencia) antes de confirmar.";
    }
    if (isCashKind(op.kind)) {
      return "Marca la entrega de efectivo como hecha (con referencia) antes de confirmar.";
    }
    return "Envía el CUP completo desde las tarjetas antes de confirmar.";
  }
  return null;
}

export function deliveryLabel(status: DeliveryStatus): string {
  if (status === "sent") return "Hecha";
  if (status === "failed") return "Fallida";
  return "Pendiente";
}

export function awaitingAdminProcess(op: Operation): boolean {
  return op.status === "open" || op.status === "processing";
}

export function operationQueue(op: Operation): "pending" | "done" | "cancelled" {
  if (op.status === "cancelled") return "cancelled";
  if (op.status === "confirmed") return "done";
  return "pending";
}

export function operationMatchesQuery(
  op: Operation,
  query: string,
  profiles: Profile[],
  provinceName: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = query.replace(/\D/g, "");
  const advisor = profiles.find((p) => p.id === op.createdBy);
  const hay = [
    op.contactName,
    op.contactPhone,
    op.address,
    op.cubaRecipientName,
    op.cubaPhone,
    op.cubaCardNumber,
    op.cubaAddress,
    op.notes,
    kindLabel(op.kind),
    modeLabel(op.mode, op.kind),
    statusLabel(op.status),
    advisor?.displayName,
    advisor?.email,
    advisor?.phone,
    provinceName,
  ]
    .join(" ")
    .toLowerCase();
  if (hay.includes(q)) return true;
  if (digits && hay.replace(/\D/g, "").includes(digits)) return true;
  return false;
}

export function cancelledByLabel(op: Operation, profiles: Profile[]): string {
  const who = profiles.find((p) => p.id === op.cancelledBy);
  if (!who) return "Cancelada por Administrador";
  if (who.role === "admin") {
    return who.email ? `Cancelada por Administrador · ${who.email}` : "Cancelada por Administrador";
  }
  return who.email ? `Cancelada por ${who.email}` : `Cancelada por ${who.displayName}`;
}
