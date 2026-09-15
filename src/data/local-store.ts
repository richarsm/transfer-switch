import type {
  Beneficiary,
  CardAccount,
  CardMovement,
  CollectStatus,
  ItineraryLeg,
  Opening,
  Operation,
  OperationKind,
  OperationMode,
  PeriodKind,
  Profile,
  ProvinceMovement,
  Role,
  Snapshot,
  TransferLeg,
  TravelOffer,
} from "../domain/types";
import { createId } from "../lib/ids";
import { havanaDateISO, inRange, rangesOverlap } from "../lib/havana";
import { round2 } from "../lib/money";
import { beneficiariesFromOperations, upsertBeneficiaryList } from "../lib/beneficiaries";
import { assignedCup, cancelBlockReason, confirmBlockReason, isCashKind, isDeliveryKind, workflowStatus } from "../lib/operations";
import { seedProvinces, seedSnapshot } from "./seed";
import { emptyCloudSnapshot, pullSnapshot, pushSnapshot, subscribeCloud } from "./cloud-store";
import { isCloudConfigured } from "./supabase";
import type { CardHeadroom, DashboardTotals, OperationPatch, ProvinceHeadroom, StoreApi } from "./store";

const KEY = "transfer-switch.v1";
const SESSION_KEY = "transfer-switch.session";

function load(): Snapshot {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seedSnapshot();
    const parsed = migrateSnapshot(JSON.parse(raw) as Snapshot);
    const cleaned = ensureSingleOpen(parsed);
    if (JSON.stringify(cleaned) !== raw) {
      localStorage.setItem(KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return seedSnapshot();
  }
}

function migrateSnapshot(snapshot: Snapshot): Snapshot {
  const seeded = seedProvinces();
  const existing = snapshot.provinces ?? [];
  const provinces =
    existing.length > 0
      ? seeded.map((seed) => existing.find((p) => p.code === seed.code) ?? seed)
      : seeded;
  const legs = snapshot.legs ?? [];
  const operations = snapshot.operations.map((op) => {
    const next = {
      ...op,
      kind: op.kind ?? "transfer",
      status: op.status ?? "open",
      cubaPhone: op.cubaPhone ?? "",
      cubaRecipientName: op.cubaRecipientName ?? "",
      cubaCardNumber: op.cubaCardNumber ?? "",
      cubaAddress: op.cubaAddress ?? "",
      provinceId: op.provinceId ?? "",
      amountUsd: op.amountUsd ?? 0,
      rateCashCupPer1000Gyn: op.rateCashCupPer1000Gyn ?? 0,
      rateCashUsdPer1000Gyn: op.rateCashUsdPer1000Gyn ?? 0,
      deliveryStatus: op.deliveryStatus ?? "pending",
      deliveryReference: op.deliveryReference ?? "",
      deliveredAt: op.deliveredAt ?? null,
      confirmedAt: op.confirmedAt ?? null,
      cancelledAt: op.cancelledAt ?? null,
      cancelledBy: op.cancelledBy ?? null,
    };
    return { ...next, status: workflowStatus(next, legs) };
  });
  return {
    ...snapshot,
    openings: snapshot.openings.map((o) => ({
      ...o,
      cashCupPer1000Gyn: o.cashCupPer1000Gyn ?? o.cupPer1000Gyn ?? 0,
      cashUsdPer1000Gyn: o.cashUsdPer1000Gyn ?? 4.7,
    })),
    operations,
    provinces,
    provinceMovements: snapshot.provinceMovements ?? [],
    beneficiaries: Array.isArray(snapshot.beneficiaries)
      ? snapshot.beneficiaries.map((b) => ({
          ...b,
          cubaCardNumber: b.cubaCardNumber ?? "",
          lastUsedAt: b.lastUsedAt ?? b.updatedAt ?? b.createdAt ?? "",
          updatedAt: b.updatedAt ?? b.createdAt ?? "",
        }))
      : beneficiariesFromOperations(snapshot.operations ?? []),
  };
}

function ensureSingleOpen(snapshot: Snapshot): Snapshot {
  const opened = snapshot.openings
    .filter((o) => o.status === "open")
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  if (opened.length <= 1) return snapshot;
  const keeperId = opened[0].id;
  const closedAt = new Date().toISOString();
  return {
    ...snapshot,
    openings: snapshot.openings.map((o) =>
      o.status === "open" && o.id !== keeperId
        ? { ...o, status: "closed", closedAt }
        : o,
    ),
  };
}

function readSession() {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSession(userId: string | null) {
  try {
    if (userId) localStorage.setItem(SESSION_KEY, userId);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode */
  }
}

let state: Snapshot = { ...emptyCloudSnapshot(), sessionUserId: readSession() };
const listeners = new Set<() => void>();
let saveChain = Promise.resolve();
let cloudUnsub: (() => void) | null = null;
let booting: Promise<void> | null = null;

function notify() {
  listeners.forEach((fn) => fn());
}

function persist(next: Snapshot) {
  writeSession(next.sessionUserId);
  state = next;
  notify();
  if (!isCloudConfigured()) {
    localStorage.setItem(KEY, JSON.stringify(next));
    return;
  }
  const snapshot = next;
  saveChain = saveChain
    .then(() => pushSnapshot(snapshot))
    .catch((err) => {
      console.error(err);
    });
}

export async function bootStore() {
  if (booting) return booting;
  booting = (async () => {
    if (!isCloudConfigured()) {
      state = load();
      notify();
      return;
    }
    const data = await pullSnapshot();
    state = { ...data, sessionUserId: readSession() };
    notify();
    if (cloudUnsub) return;
    try {
      cloudUnsub = subscribeCloud(() => {
        void pullSnapshot()
          .then((next) => {
            state = { ...next, sessionUserId: readSession() };
            notify();
          })
          .catch((err) => console.error(err));
      });
    } catch (err) {
      console.error(err);
    }
  })();
  return booting;
}

function requireSession(): Profile {
  const user = state.profiles.find((p) => p.id === state.sessionUserId);
  if (!user || !user.active) throw new Error("No hay sesión activa.");
  return user;
}

function requireAdmin(): Profile {
  const user = requireSession();
  if (user.role !== "admin") throw new Error("Solo el administrador puede hacer esto.");
  return user;
}

function assertNotCancelled(operation: Operation | undefined): Operation {
  if (!operation) throw new Error("Operación no encontrada.");
  if (operation.status === "cancelled") {
    throw new Error("La operación cancelada ya no se puede editar.");
  }
  return operation;
}

function assertActiveOperation(operation: Operation | undefined): Operation {
  const current = assertNotCancelled(operation);
  if (current.status === "confirmed") {
    throw new Error("La operación confirmada ya no se puede editar.");
  }
  return current;
}

function netConsumed(
  movements: CardMovement[],
  cardId: string,
  predicate: (m: CardMovement) => boolean,
): number {
  return movements
    .filter((m) => m.cardId === cardId && predicate(m))
    .reduce((sum, m) => sum + (m.kind === "consume" ? m.amountCup : -m.amountCup), 0);
}

function headroom(snapshot: Snapshot, cardId: string, businessDate: string): CardHeadroom {
  const card = snapshot.cards.find((c) => c.id === cardId);
  if (!card) throw new Error("Tarjeta no encontrada.");
  const month = businessDate.slice(0, 7);
  const usedToday = netConsumed(
    snapshot.movements,
    cardId,
    (m) => m.businessDate === businessDate,
  );
  const usedMonth = netConsumed(
    snapshot.movements,
    cardId,
    (m) => m.businessDate.startsWith(month),
  );
  const dailyLeft = round2(card.dailyLimit - usedToday);
  const monthlyLeft = round2(card.monthlyLimit - usedMonth);
  const consumeNet = netConsumed(snapshot.movements, cardId, () => true);
  const balanceLeft = round2(card.balanceCup - consumeNet);
  return {
    card,
    usedToday,
    usedMonth,
    dailyLeft,
    monthlyLeft,
    balanceLeft,
    maxThisMove: round2(Math.max(0, Math.min(dailyLeft, monthlyLeft, balanceLeft))),
  };
}

function provinceNet(
  movements: ProvinceMovement[],
  provinceId: string,
  currency: "CUP" | "USD",
): number {
  return movements
    .filter((m) => m.provinceId === provinceId && m.currency === currency)
    .reduce((sum, m) => sum + (m.kind === "consume" ? m.amount : -m.amount), 0);
}

function provinceRoom(snapshot: Snapshot, provinceId: string): ProvinceHeadroom {
  const province = snapshot.provinces.find((p) => p.id === provinceId);
  if (!province) throw new Error("Provincia no encontrada.");
  return {
    province,
    cashCupLeft: round2(province.cashCup - provinceNet(snapshot.provinceMovements, provinceId, "CUP")),
    cashUsdLeft: round2(province.cashUsd - provinceNet(snapshot.provinceMovements, provinceId, "USD")),
  };
}

export const localRepo = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot(): Snapshot {
    return state;
  },
  resetDemo() {
    persist(seedSnapshot());
  },
};

function apiFrom(snapshot: Snapshot): StoreApi {
  const session = snapshot.profiles.find((p) => p.id === snapshot.sessionUserId) ?? null;
  const today = havanaDateISO();
  const currentOpening =
    snapshot.openings.find(
      (o) => o.status === "open" && inRange(today, o.startsOn, o.endsOn),
    ) ?? null;

  return {
    snapshot,
    session,
    currentOpening,
    login(userId: string) {
      const user = snapshot.profiles.find((p) => p.id === userId);
      if (!user?.active) throw new Error("Ese usuario no está activo.");
      writeSession(userId);
      state = { ...snapshot, sessionUserId: userId };
      if (!isCloudConfigured()) localStorage.setItem(KEY, JSON.stringify(state));
      notify();
    },
    logout() {
      writeSession(null);
      state = { ...snapshot, sessionUserId: null };
      if (!isCloudConfigured()) localStorage.setItem(KEY, JSON.stringify(state));
      notify();
    },
    upsertProfile(input: {
      id?: string;
      email: string;
      displayName: string;
      phone: string;
      role: Role;
      active: boolean;
    }) {
      requireAdmin();
      const email = input.email.trim().toLowerCase();
      if (!email.includes("@")) throw new Error("El email no es válido.");
      const existing = snapshot.profiles.find(
        (p) => p.id === input.id || p.email === email,
      );
      const profile: Profile = {
        id: existing?.id ?? createId("usr"),
        email,
        displayName: input.displayName.trim(),
        phone: input.phone.trim(),
        role: input.role,
        active: input.active,
      };
      persist({
        ...snapshot,
        profiles: [
          ...snapshot.profiles.filter((p) => p.id !== profile.id),
          profile,
        ],
      });
    },
    openPeriod(input: {
      kind: PeriodKind;
      startsOn: string;
      endsOn: string;
      cupPer1000Gyn: number;
      cashCupPer1000Gyn: number;
      cashUsdPer1000Gyn: number;
      notes: string;
    }) {
      const admin = requireAdmin();
      if (input.cupPer1000Gyn <= 0 || input.cashCupPer1000Gyn <= 0 || input.cashUsdPer1000Gyn <= 0) {
        throw new Error("Las tres tarifas deben ser mayores que cero.");
      }
      if (input.endsOn < input.startsOn) {
        throw new Error("La fecha final no puede ser anterior al inicio.");
      }
      const alreadyOpen = snapshot.openings.find((o) => o.status === "open");
      if (alreadyOpen) {
        throw new Error(
          `Ya hay un periodo abierto (${alreadyOpen.startsOn} → ${alreadyOpen.endsOn}). Ciérralo antes de abrir otro.`,
        );
      }
      const overlap = snapshot.openings.find((o) =>
        rangesOverlap(input.startsOn, input.endsOn, o.startsOn, o.endsOn),
      );
      if (overlap) {
        throw new Error(
          `Esas fechas ya están usadas (${overlap.startsOn} → ${overlap.endsOn}). Los periodos no se repiten.`,
        );
      }
      const opening: Opening = {
        id: createId("opn"),
        kind: input.kind,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        cupPer1000Gyn: input.cupPer1000Gyn,
        cashCupPer1000Gyn: input.cashCupPer1000Gyn,
        cashUsdPer1000Gyn: input.cashUsdPer1000Gyn,
        notes: input.notes.trim(),
        status: "open",
        openedBy: admin.id,
        openedAt: new Date().toISOString(),
        closedAt: null,
      };
      persist({ ...snapshot, openings: [...snapshot.openings, opening] });
    },
    closePeriod(openingId: string) {
      requireAdmin();
      persist({
        ...snapshot,
        openings: snapshot.openings.map((o) =>
          o.id === openingId
            ? { ...o, status: "closed", closedAt: new Date().toISOString() }
            : o,
        ),
      });
    },
    upsertCard(input: Omit<CardAccount, "id"> & { id?: string }) {
      requireAdmin();
      if (input.dailyLimit <= 0 || input.monthlyLimit <= 0) {
        throw new Error("Los límites diario y mensual deben ser mayores que cero.");
      }
      const card: CardAccount = {
        ...input,
        id: input.id ?? createId("crd"),
        alias: input.alias.trim(),
        bank: input.bank.trim(),
        last4: input.last4.replace(/\D/g, "").slice(-4),
        holder: input.holder.trim(),
      };
      persist({
        ...snapshot,
        cards: [...snapshot.cards.filter((c) => c.id !== card.id), card],
      });
    },
    upsertProvince(input: { id: string; cashCup: number; cashUsd: number; notes: string }) {
      requireSession();
      if (input.cashCup < 0 || input.cashUsd < 0) {
        throw new Error("La disponibilidad no puede ser negativa.");
      }
      persist({
        ...snapshot,
        provinces: snapshot.provinces.map((p) =>
          p.id === input.id
            ? { ...p, cashCup: round2(input.cashCup), cashUsd: round2(input.cashUsd), notes: input.notes.trim() }
            : p,
        ),
      });
    },
    provinceHeadroom(provinceId: string) {
      return provinceRoom(snapshot, provinceId);
    },
    createOperation(input: {
      kind: OperationKind;
      mode: OperationMode;
      contactName: string;
      contactPhone: string;
      address: string;
      lat: number | null;
      lng: number | null;
      cubaPhone: string;
      cubaRecipientName: string;
      cubaCardNumber: string;
      cubaAddress: string;
      provinceId: string;
      amountGyn: number;
      amountCup: number;
      amountUsd: number;
      notes: string;
      saveBeneficiary?: boolean;
      beneficiaryId?: string;
    }) {
      const user = requireSession();
      const opening = currentOpening;
      if (!opening) {
        throw new Error("No hay un periodo abierto para hoy (reloj de Cuba).");
      }
      if (!input.contactName.trim() || !input.contactPhone.trim() || !input.address.trim()) {
        throw new Error("Contacto, teléfono y dirección son obligatorios.");
      }
      if (input.kind === "mobile_recharge" && !input.cubaPhone.trim()) {
        throw new Error("La recarga móvil necesita el número cubano a recargar.");
      }
      if (
        input.kind === "transfer" &&
        (!input.cubaCardNumber.trim() || !input.cubaRecipientName.trim() || !input.cubaPhone.trim())
      ) {
        throw new Error("La transferencia necesita tarjeta, nombre y móvil del beneficiario en Cuba.");
      }
      if (isCashKind(input.kind) && !input.provinceId) {
        throw new Error("La entrega de efectivo necesita una provincia con disponibilidad.");
      }
      if (input.amountGyn <= 0) {
        throw new Error("El monto GYN debe ser mayor que cero.");
      }
      if (input.kind === "cash_usd") {
        if (input.amountUsd <= 0) throw new Error("El monto USD debe ser mayor que cero.");
      } else if (input.amountCup <= 0) {
        throw new Error("El monto CUP debe ser mayor que cero.");
      }
      if (opening.cashCupPer1000Gyn <= 0 && input.kind === "cash_cup") {
        throw new Error("Este periodo no tiene tarifa de efectivo CUP.");
      }
      if (opening.cashUsdPer1000Gyn <= 0 && input.kind === "cash_usd") {
        throw new Error("Este periodo no tiene tarifa de efectivo USD.");
      }

      const operation: Operation = {
        id: createId("ops"),
        openingId: opening.id,
        kind: input.kind,
        mode: input.mode,
        status: "open",
        createdBy: user.id,
        createdAt: new Date().toISOString(),
        contactName: input.contactName.trim(),
        contactPhone: input.contactPhone.trim(),
        address: input.address.trim(),
        lat: input.lat,
        lng: input.lng,
        cubaPhone: input.cubaPhone.trim(),
        cubaRecipientName: input.cubaRecipientName.trim(),
        cubaCardNumber: input.cubaCardNumber.trim(),
        cubaAddress: input.cubaAddress.trim(),
        provinceId: input.provinceId,
        amountGyn: round2(input.amountGyn),
        amountCup: round2(input.kind === "cash_usd" ? 0 : input.amountCup),
        amountUsd: round2(input.kind === "cash_usd" ? input.amountUsd : 0),
        rateCupPer1000Gyn: opening.cupPer1000Gyn,
        rateCashCupPer1000Gyn: opening.cashCupPer1000Gyn,
        rateCashUsdPer1000Gyn: opening.cashUsdPer1000Gyn,
        collectStatus: "pending",
        collectedAt: null,
        deliveryStatus: "pending",
        deliveryReference: "",
        deliveredAt: null,
        confirmedAt: null,
        cancelledAt: null,
        cancelledBy: null,
        notes: input.notes.trim(),
      };

      const nextMovements = [...snapshot.provinceMovements];
      if (isCashKind(input.kind)) {
        const room = provinceRoom(snapshot, input.provinceId);
        const currency = input.kind === "cash_usd" ? "USD" : "CUP";
        const need = currency === "USD" ? operation.amountUsd : operation.amountCup;
        const left = currency === "USD" ? room.cashUsdLeft : room.cashCupLeft;
        if (need > left + 0.001) {
          throw new Error(
            `No hay disponibilidad de ${currency} en ${room.province.name}. Disponible: ${left}.`,
          );
        }
        nextMovements.push({
          id: createId("pmv"),
          provinceId: input.provinceId,
          operationId: operation.id,
          currency,
          amount: need,
          kind: "consume",
        });
      }

      persist({
        ...snapshot,
        operations: [operation, ...snapshot.operations],
        provinceMovements: nextMovements,
        beneficiaries:
          input.saveBeneficiary === false
            ? snapshot.beneficiaries ?? []
            : upsertBeneficiaryList(snapshot.beneficiaries ?? [], user.id, {
                id: input.beneficiaryId,
                contactName: operation.contactName,
                contactPhone: operation.contactPhone,
                address: operation.address,
                lat: operation.lat,
                lng: operation.lng,
                cubaPhone: operation.cubaPhone,
                cubaRecipientName: operation.cubaRecipientName,
                cubaCardNumber: operation.cubaCardNumber,
                cubaAddress: operation.cubaAddress,
                provinceId: operation.provinceId,
                notes: operation.notes,
              }),
      });
      return operation.id;
    },
    upsertBeneficiary(input: Omit<Beneficiary, "id" | "createdBy" | "createdAt" | "updatedAt" | "lastUsedAt"> & {
      id?: string;
    }) {
      const user = requireSession();
      if (!input.contactName.trim() || !input.contactPhone.trim()) {
        throw new Error("Nombre y teléfono del cliente son obligatorios.");
      }
      const next = upsertBeneficiaryList(snapshot.beneficiaries ?? [], user.id, input);
      persist({ ...snapshot, beneficiaries: next });
      const saved =
        next.find((b) => b.id === input.id) ??
        next.find(
          (b) =>
            b.contactPhone === input.contactPhone.trim() &&
            b.cubaPhone === input.cubaPhone.trim() &&
            b.cubaRecipientName === input.cubaRecipientName.trim(),
        );
      return saved?.id ?? next[0].id;
    },
    deleteBeneficiary(id: string) {
      requireSession();
      persist({
        ...snapshot,
        beneficiaries: (snapshot.beneficiaries ?? []).filter((b) => b.id !== id),
      });
    },
    updateTransferDestination(
      operationId: string,
      input: { cubaCardNumber: string; cubaRecipientName: string; cubaPhone: string },
    ) {
      const user = requireSession();
      const current = assertNotCancelled(snapshot.operations.find((o) => o.id === operationId));
      if (current.kind !== "transfer") {
        throw new Error("Solo las transferencias a tarjeta usan estos datos.");
      }
      const sent = snapshot.legs.some((l) => l.operationId === operationId && l.status === "sent");
      if (
        user.role !== "admin" &&
        (current.status === "confirmed" || current.collectStatus === "collected" || sent)
      ) {
        throw new Error("Solo el administrador puede ajustar esta operación.");
      }
      const cubaCardNumber = input.cubaCardNumber.trim();
      const cubaRecipientName = input.cubaRecipientName.trim();
      const cubaPhone = input.cubaPhone.trim();
      if (!cubaCardNumber || !cubaRecipientName || !cubaPhone) {
        throw new Error("Tarjeta, nombre y móvil son obligatorios.");
      }
      persist({
        ...snapshot,
        operations: snapshot.operations.map((op) =>
          op.id === operationId ? { ...op, cubaCardNumber, cubaRecipientName, cubaPhone } : op,
        ),
        beneficiaries: upsertBeneficiaryList(snapshot.beneficiaries ?? [], user.id, {
          contactName: current.contactName,
          contactPhone: current.contactPhone,
          address: current.address,
          lat: current.lat,
          lng: current.lng,
          cubaPhone,
          cubaRecipientName,
          cubaCardNumber,
          cubaAddress: current.cubaAddress,
          provinceId: current.provinceId,
          notes: current.notes,
        }),
      });
    },
    updateOperation(operationId: string, input: OperationPatch) {
      const user = requireAdmin();
      const current = assertNotCancelled(snapshot.operations.find((o) => o.id === operationId));
      const contactName = input.contactName.trim();
      const contactPhone = input.contactPhone.trim();
      const address = input.address.trim();
      const cubaPhone = input.cubaPhone.trim();
      const cubaRecipientName = input.cubaRecipientName.trim();
      const cubaCardNumber = input.cubaCardNumber.trim();
      const cubaAddress = input.cubaAddress.trim();
      const notes = input.notes.trim();
      const provinceId = input.provinceId;
      const amountGyn = round2(input.amountGyn);
      const amountCup = round2(current.kind === "cash_usd" ? 0 : input.amountCup);
      const amountUsd = round2(current.kind === "cash_usd" ? input.amountUsd : 0);

      if (!contactName || !contactPhone || !address) {
        throw new Error("Contacto, teléfono y dirección son obligatorios.");
      }
      if (amountGyn <= 0) throw new Error("El monto GYN debe ser mayor que cero.");
      if (current.kind === "cash_usd") {
        if (amountUsd <= 0) throw new Error("El monto USD debe ser mayor que cero.");
      } else if (amountCup <= 0) {
        throw new Error("El monto CUP debe ser mayor que cero.");
      }
      if (current.kind === "transfer" && (!cubaCardNumber || !cubaRecipientName || !cubaPhone)) {
        throw new Error("La transferencia necesita tarjeta, nombre y móvil del beneficiario en Cuba.");
      }
      if (current.kind === "mobile_recharge" && !cubaPhone) {
        throw new Error("La recarga móvil necesita el número cubano a recargar.");
      }
      if (isCashKind(current.kind) && !provinceId) {
        throw new Error("La entrega de efectivo necesita una provincia.");
      }
      const assigned = assignedCup(snapshot.legs, operationId);
      if (current.kind === "transfer" && amountCup + 0.001 < assigned) {
        throw new Error(`El CUP no puede ser menor que lo ya asignado (${assigned}).`);
      }

      let nextProvinceMovements = snapshot.provinceMovements;
      if (
        isCashKind(current.kind) &&
        current.deliveryStatus !== "sent" &&
        current.deliveryStatus !== "failed"
      ) {
        const currency = current.kind === "cash_usd" ? "USD" : "CUP";
        const oldAmount = currency === "USD" ? current.amountUsd : current.amountCup;
        const newAmount = currency === "USD" ? amountUsd : amountCup;
        if (current.provinceId !== provinceId || oldAmount !== newAmount) {
          const working = [...snapshot.provinceMovements];
          working.push({
            id: createId("pmv"),
            provinceId: current.provinceId,
            operationId: current.id,
            currency,
            amount: oldAmount,
            kind: "release",
          });
          const room = provinceRoom({ ...snapshot, provinceMovements: working }, provinceId);
          const left = currency === "USD" ? room.cashUsdLeft : room.cashCupLeft;
          if (newAmount > left + 0.001) {
            throw new Error(
              `No hay disponibilidad de ${currency} en ${room.province.name}. Disponible: ${left}.`,
            );
          }
          working.push({
            id: createId("pmv"),
            provinceId,
            operationId: current.id,
            currency,
            amount: newAmount,
            kind: "consume",
          });
          nextProvinceMovements = working;
        }
      }

      persist({
        ...snapshot,
        provinceMovements: nextProvinceMovements,
        operations: snapshot.operations.map((op) =>
          op.id === operationId
            ? {
                ...op,
                contactName,
                contactPhone,
                address,
                lat: input.lat,
                lng: input.lng,
                cubaPhone,
                cubaRecipientName,
                cubaCardNumber,
                cubaAddress,
                provinceId: isCashKind(current.kind) ? provinceId : op.provinceId,
                amountGyn,
                amountCup,
                amountUsd,
                notes,
              }
            : op,
        ),
        beneficiaries: upsertBeneficiaryList(snapshot.beneficiaries ?? [], user.id, {
          contactName,
          contactPhone,
          address,
          lat: input.lat,
          lng: input.lng,
          cubaPhone,
          cubaRecipientName,
          cubaCardNumber,
          cubaAddress,
          provinceId: isCashKind(current.kind) ? provinceId : current.provinceId,
          notes,
        }),
      });
    },
    setCollectStatus(operationId: string, status: CollectStatus) {
      requireSession();
      assertActiveOperation(snapshot.operations.find((o) => o.id === operationId));
      persist({
        ...snapshot,
        operations: snapshot.operations.map((op) =>
          op.id === operationId
            ? {
                ...op,
                collectStatus: status,
                collectedAt:
                  status === "collected" ? new Date().toISOString() : op.collectedAt,
              }
            : op,
        ),
      });
    },
    addLeg(operationId: string, cardId: string, amountCup: number) {
      requireAdmin();
      const operation = assertActiveOperation(snapshot.operations.find((o) => o.id === operationId));
      if (operation.kind !== "transfer") {
        throw new Error("Las recargas móviles no usan orígenes de tarjeta.");
      }
      if (operation.mode === "collect_then_transfer" && operation.collectStatus !== "collected") {
        throw new Error("En modo recoger-luego-enviar, primero confirma la recogida.");
      }
      if (amountCup <= 0) throw new Error("El monto del origen debe ser mayor que cero.");
      const today = havanaDateISO();
      const room = headroom(snapshot, cardId, today);
      if (!room.card.active) throw new Error("Esa tarjeta está bloqueada.");
      if (amountCup > room.maxThisMove + 0.001) {
        throw new Error(
          `Cupo insuficiente en ${room.card.alias}. Máximo ahora: ${room.maxThisMove} CUP.`,
        );
      }
      const assigned = snapshot.legs
        .filter((l) => l.operationId === operationId && l.status !== "failed")
        .reduce((sum, l) => sum + l.amountCup, 0);
      if (round2(assigned + amountCup) > operation.amountCup + 0.001) {
        throw new Error("La suma de orígenes no puede superar el CUP de la operación.");
      }
      const leg: TransferLeg = {
        id: createId("leg"),
        operationId,
        cardId,
        amountCup: round2(amountCup),
        status: "pending",
        reference: "",
        sentAt: null,
      };
      const movement: CardMovement = {
        id: createId("mov"),
        cardId,
        operationId,
        legId: leg.id,
        amountCup: leg.amountCup,
        businessDate: today,
        kind: "consume",
      };
      persist({
        ...snapshot,
        legs: [...snapshot.legs, leg],
        movements: [...snapshot.movements, movement],
        operations: snapshot.operations.map((op) =>
          op.id === operationId ? { ...op, status: workflowStatus(op, [...snapshot.legs, leg]) } : op,
        ),
      });
    },
    markLegSent(legId: string, reference: string) {
      requireAdmin();
      const leg = snapshot.legs.find((l) => l.id === legId);
      if (!leg) throw new Error("Origen no encontrado.");
      const operation = assertActiveOperation(snapshot.operations.find((o) => o.id === leg.operationId));
      const ref = reference.trim();
      if (!ref) throw new Error("La referencia bancaria es obligatoria.");
      persist({
        ...snapshot,
        legs: snapshot.legs.map((l) =>
          l.id === legId
            ? { ...l, status: "sent", reference: ref, sentAt: new Date().toISOString() }
            : l,
        ),
        operations: snapshot.operations.map((op) =>
          op.id === operation.id
            ? {
                ...op,
                status: workflowStatus(op, snapshot.legs.map((l) =>
                  l.id === legId ? { ...l, status: "sent" as const } : l,
                )),
              }
            : op,
        ),
      });
    },
    failLeg(legId: string) {
      requireAdmin();
      const leg = snapshot.legs.find((l) => l.id === legId);
      if (!leg) throw new Error("Origen no encontrado.");
      const operation = assertActiveOperation(snapshot.operations.find((o) => o.id === leg.operationId));
      if (leg.status === "failed") return;
      const release: CardMovement = {
        id: createId("mov"),
        cardId: leg.cardId,
        operationId: leg.operationId,
        legId: leg.id,
        amountCup: leg.amountCup,
        businessDate: havanaDateISO(),
        kind: "release",
      };
      persist({
        ...snapshot,
        legs: snapshot.legs.map((l) =>
          l.id === legId ? { ...l, status: "failed" } : l,
        ),
        movements: [...snapshot.movements, release],
        operations: snapshot.operations.map((op) =>
          op.id === operation.id
            ? {
                ...op,
                status: workflowStatus(
                  op,
                  snapshot.legs.map((l) => (l.id === legId ? { ...l, status: "failed" as const } : l)),
                ),
              }
            : op,
        ),
      });
    },
    markDeliverySent(operationId: string, reference: string) {
      requireAdmin();
      const operation = assertActiveOperation(snapshot.operations.find((o) => o.id === operationId));
      if (!isDeliveryKind(operation.kind)) {
        throw new Error("Esa ficha no es recarga ni entrega de efectivo.");
      }
      if (operation.mode === "collect_then_transfer" && operation.collectStatus !== "collected") {
        throw new Error("En modo recoger-luego-enviar, primero confirma la recogida.");
      }
      const ref = reference.trim();
      if (!ref) throw new Error("La referencia es obligatoria.");
      persist({
        ...snapshot,
        operations: snapshot.operations.map((op) =>
          op.id === operationId
            ? {
                ...op,
                deliveryStatus: "sent",
                deliveryReference: ref,
                deliveredAt: new Date().toISOString(),
                status: workflowStatus({ ...op, deliveryStatus: "sent" }, snapshot.legs),
              }
            : op,
        ),
      });
    },
    failDelivery(operationId: string) {
      requireAdmin();
      const operation = assertActiveOperation(snapshot.operations.find((o) => o.id === operationId));
      if (operation.deliveryStatus === "failed") return;
      const releases: ProvinceMovement[] = [];
      if (isCashKind(operation.kind) && operation.provinceId) {
        const currency = operation.kind === "cash_usd" ? "USD" : "CUP";
        const amount = currency === "USD" ? operation.amountUsd : operation.amountCup;
        releases.push({
          id: createId("pmv"),
          provinceId: operation.provinceId,
          operationId: operation.id,
          currency,
          amount,
          kind: "release",
        });
      }
      persist({
        ...snapshot,
        operations: snapshot.operations.map((op) =>
          op.id === operationId
            ? {
                ...op,
                deliveryStatus: "failed",
                deliveredAt: null,
                status: workflowStatus({ ...op, deliveryStatus: "failed" }, snapshot.legs),
              }
            : op,
        ),
        provinceMovements: [...snapshot.provinceMovements, ...releases],
      });
    },
    confirmOperation(operationId: string) {
      requireAdmin();
      const operation = snapshot.operations.find((o) => o.id === operationId);
      if (!operation) throw new Error("Operación no encontrada.");
      const blocked = confirmBlockReason(operation, snapshot.legs);
      if (blocked) throw new Error(blocked);
      persist({
        ...snapshot,
        operations: snapshot.operations.map((op) =>
          op.id === operationId
            ? { ...op, status: "confirmed", confirmedAt: new Date().toISOString() }
            : op,
        ),
      });
    },
    cancelOperation(operationId: string) {
      const user = requireSession();
      const operation = snapshot.operations.find((o) => o.id === operationId);
      if (!operation) throw new Error("Operación no encontrada.");
      const blocked = cancelBlockReason(operation, snapshot.legs, user);
      if (blocked) throw new Error(blocked);

      if (user.role !== "admin") {
        persist({
          ...snapshot,
          operations: snapshot.operations.filter((op) => op.id !== operationId),
          legs: snapshot.legs.filter((leg) => leg.operationId !== operationId),
          movements: snapshot.movements.filter((m) => m.operationId !== operationId),
          provinceMovements: snapshot.provinceMovements.filter((m) => m.operationId !== operationId),
        });
        return "removed";
      }

      const now = new Date().toISOString();
      const nextLegs = snapshot.legs.map((leg) =>
        leg.operationId === operationId && leg.status !== "failed" && leg.status !== "sent"
          ? { ...leg, status: "failed" as const }
          : leg,
      );
      const releases: CardMovement[] = snapshot.legs
        .filter((leg) => leg.operationId === operationId && leg.status !== "failed" && leg.status !== "sent")
        .map((leg) => ({
          id: createId("mov"),
          cardId: leg.cardId,
          operationId: leg.operationId,
          legId: leg.id,
          amountCup: leg.amountCup,
          businessDate: havanaDateISO(),
          kind: "release" as const,
        }));
      const provinceReleases: ProvinceMovement[] = [];
      if (
        isCashKind(operation.kind) &&
        operation.provinceId &&
        operation.deliveryStatus !== "failed"
      ) {
        const currency = operation.kind === "cash_usd" ? "USD" : "CUP";
        provinceReleases.push({
          id: createId("pmv"),
          provinceId: operation.provinceId,
          operationId: operation.id,
          currency,
          amount: currency === "USD" ? operation.amountUsd : operation.amountCup,
          kind: "release",
        });
      }
      persist({
        ...snapshot,
        legs: nextLegs,
        movements: [...snapshot.movements, ...releases],
        provinceMovements: [...snapshot.provinceMovements, ...provinceReleases],
        operations: snapshot.operations.map((op) =>
          op.id === operationId
            ? {
                ...op,
                status: "cancelled",
                cancelledAt: now,
                cancelledBy: user.id,
                collectStatus: op.collectStatus === "pending" ? "cancelled" : op.collectStatus,
              }
            : op,
        ),
      });
      return "recorded";
    },
    cardHeadroom(cardId: string, businessDate: string) {
      return headroom(snapshot, cardId, businessDate);
    },
    dashboard(from: string, to: string): DashboardTotals {
      const ops = snapshot.operations.filter((op) => {
        const day = op.createdAt.slice(0, 10);
        const havanaDay = havanaDateISO(new Date(op.createdAt));
        const key = havanaDay || day;
        return key >= from && key <= to;
      });
      const opIds = new Set(ops.map((o) => o.id));
      const legs = snapshot.legs.filter((l) => opIds.has(l.operationId));
      const rechargeCup = round2(
        ops
          .filter((o) => o.kind === "mobile_recharge" && o.deliveryStatus === "sent")
          .reduce((s, o) => s + o.amountCup, 0),
      );
      const cashCup = round2(
        ops
          .filter((o) => o.kind === "cash_cup" && o.deliveryStatus === "sent")
          .reduce((s, o) => s + o.amountCup, 0),
      );
      const cashUsd = round2(
        ops
          .filter((o) => o.kind === "cash_usd" && o.deliveryStatus === "sent")
          .reduce((s, o) => s + o.amountUsd, 0),
      );
      const transferredCup = round2(
        legs.filter((l) => l.status === "sent").reduce((s, l) => s + l.amountCup, 0),
      );
      return {
        transferredCup,
        rechargeCup,
        cashCup,
        cashUsd,
        pendingGyn: round2(
          ops
            .filter((o) => o.status !== "cancelled" && o.collectStatus === "pending")
            .reduce((s, o) => s + o.amountGyn, 0),
        ),
        collectedGyn: round2(
          ops
            .filter((o) => o.status !== "cancelled" && o.collectStatus === "collected")
            .reduce((s, o) => s + o.amountGyn, 0),
        ),
        assignedCup: round2(
          legs.filter((l) => l.status !== "failed").reduce((s, l) => s + l.amountCup, 0),
        ),
        sentCup: round2(transferredCup + rechargeCup + cashCup),
        confirmedCount: ops.filter((o) => o.status === "confirmed").length,
      };
    },
    upsertTravel(input: Omit<TravelOffer, "id"> & { id?: string }) {
      requireSession();
      const offer: TravelOffer = {
        ...input,
        id: input.id ?? createId("trv"),
        title: input.title.trim(),
        origin: input.origin.trim(),
        destination: input.destination.trim(),
      };
      persist({
        ...snapshot,
        travels: [...snapshot.travels.filter((t) => t.id !== offer.id), offer],
      });
      return offer.id;
    },
    replaceItinerary(offerId: string, legs: Omit<ItineraryLeg, "id" | "offerId" | "order">[]) {
      requireSession();
      persist({
        ...snapshot,
        itineraries: [
          ...snapshot.itineraries.filter((l) => l.offerId !== offerId),
          ...legs.map((l, i) => ({
            ...l,
            id: createId("itn"),
            offerId,
            order: i + 1,
          })),
        ],
      });
    },
  };
}

export function getStoreApi(): StoreApi {
  return apiFrom(localRepo.getSnapshot());
}
