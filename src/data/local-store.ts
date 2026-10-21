import type {
  AccessDesk,
  AccessRequest,
  Beneficiary,
  CashCourier,
  CardAccount,
  CardMovement,
  CollectStatus,
  CubaMessage,
  CubaOperator,
  CubaOperatorKind,
  CubaThread,
  ItineraryLeg,
  MessageChannel,
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
import { makeTrackingCode } from "../lib/tracking";
import {
  CUBA_TIMEOUT_MS,
  expectedAmount,
  matchInboundThread,
  parseCubaReply,
  pickCubaOperator,
  profileOwnsCubaOperator,
  timedOut,
} from "../lib/cuba-inbox";
import { havanaDateISO, inRange, rangesOverlap } from "../lib/havana";
import { round2 } from "../lib/money";
import { beneficiariesFromOperations, upsertBeneficiaryList } from "../lib/beneficiaries";
import { assignedCup, cancelBlockReason, confirmBlockReason, isCashKind, isDeliveryKind, workflowStatus } from "../lib/operations";
import { seedProvinces, seedSnapshot } from "./seed";
import { emptyCloudSnapshot, insertAccessRequest, pullSnapshot, pushSnapshot, subscribeCloud } from "./cloud-store";
import { appRedirectUrl, getSupabase, isCloudConfigured } from "./supabase";
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
  const cubaThreads = snapshot.cubaThreads ?? [];
  const cubaDone = new Map(
    cubaThreads
      .filter((t) => t.status === "auto_matched")
      .map((t) => [t.operationId, t] as const),
  );
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
      trackingCode: op.trackingCode ?? "",
      cubaOperatorId: op.cubaOperatorId ?? "",
    };
    const thread = cubaDone.get(next.id);
    if (
      thread &&
      isDeliveryKind(next.kind) &&
      next.deliveryStatus !== "sent" &&
      next.deliveryStatus !== "failed"
    ) {
      next.deliveryStatus = "sent";
      next.deliveryReference = next.deliveryReference || thread.parsedReference;
      next.deliveredAt = next.deliveredAt || thread.repliedAt;
    }
    return { ...next, status: workflowStatus(next, legs) };
  });
  const taken = new Set(operations.map((op) => op.trackingCode).filter(Boolean));
  for (const op of operations) {
    if (!op.trackingCode) {
      op.trackingCode = makeTrackingCode(taken);
      taken.add(op.trackingCode);
    }
  }
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
    couriers: snapshot.couriers ?? [],
    cubaOperators: (snapshot.cubaOperators ?? []).map((o) => ({
      ...o,
      profileId: o.profileId ?? "",
    })),
    cubaThreads,
    cubaMessages: snapshot.cubaMessages ?? [],
    accessRequests: snapshot.accessRequests ?? [],
    settings: {
      advisorCommissionPercent:
        snapshot.settings?.advisorCommissionPercent ?? 6,
    },
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
let authNotice: string | null = null;
let pendingAuth: { email: string; googleName: string } | null = null;
let authListening = false;
const queuingAccess = new Set<string>();

function notify() {
  listeners.forEach((fn) => fn());
}

function persist(next: Snapshot) {
  writeSession(next.sessionUserId);
  state = next;
  notify();
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  if (!isCloudConfigured()) return;
  const snapshot = next;
  saveChain = saveChain
    .then(() => pushSnapshot(snapshot))
    .catch((err) => {
      console.error(err);
    });
}

function applyCloudPull(pull: Awaited<ReturnType<typeof pullSnapshot>>, overlay: Snapshot): Snapshot {
  const { missingCubaInbox, missingCouriers, missingAccessRequests, missingSettings, ...data } = pull;
  const prevOps = overlay.operations ?? [];
  return migrateSnapshot({
    ...data,
    sessionUserId: overlay.sessionUserId ?? readSession(),
    operations: data.operations.map((op) => {
      const prev = prevOps.find((o) => o.id === op.id);
      return {
        ...op,
        trackingCode: op.trackingCode || prev?.trackingCode || "",
        cubaOperatorId: op.cubaOperatorId || prev?.cubaOperatorId || "",
      };
    }),
    couriers: missingCouriers ? overlay.couriers ?? [] : data.couriers,
    cubaOperators: missingCubaInbox ? overlay.cubaOperators ?? [] : data.cubaOperators,
    cubaThreads: missingCubaInbox ? overlay.cubaThreads ?? [] : data.cubaThreads,
    cubaMessages: missingCubaInbox ? overlay.cubaMessages ?? [] : data.cubaMessages,
    accessRequests: missingAccessRequests ? overlay.accessRequests ?? [] : data.accessRequests,
    settings: missingSettings
      ? overlay.settings ?? { advisorCommissionPercent: 6 }
      : data.settings,
  });
}

function profileForEmail(email: string | undefined | null) {
  if (!email) return null;
  const needle = email.trim().toLowerCase();
  return state.profiles.find((p) => p.email.trim().toLowerCase() === needle) ?? null;
}

function googleDisplayName(user: { email?: string | null; user_metadata?: Record<string, unknown> }) {
  const meta = user.user_metadata ?? {};
  const name = String(meta.full_name ?? meta.name ?? meta.display_name ?? "").trim();
  if (name) return name;
  return user.email?.split("@")[0] ?? "";
}

function setSessionUser(userId: string | null) {
  writeSession(userId);
  if (state.sessionUserId === userId) return;
  state = { ...state, sessionUserId: userId };
  notify();
}

async function applyAuthSession(
  session: { user?: { email?: string | null; user_metadata?: Record<string, unknown> } } | null,
) {
  if (!session?.user) {
    pendingAuth = null;
    setSessionUser(null);
    return;
  }
  const email = session.user.email?.trim().toLowerCase() ?? "";
  const profile = profileForEmail(email);
  if (profile?.active) {
    pendingAuth = null;
    authNotice = null;
    setSessionUser(profile.id);
    return;
  }
  if (profile && !profile.active) {
    pendingAuth = null;
    authNotice = email
      ? `El usuario ${email} está desactivado.`
      : "Ese usuario está desactivado.";
    setSessionUser(null);
    state = { ...state };
    notify();
    try {
      await getSupabase().auth.signOut();
    } catch {
      /* already signed out */
    }
    return;
  }
  pendingAuth = {
    email,
    googleName: googleDisplayName(session.user),
  };
  authNotice = null;
  setSessionUser(null);
  state = { ...state };
  notify();
  void queueAccessRequest(email, pendingAuth.googleName);
}

async function queueAccessRequest(email: string, displayName: string) {
  const needle = email.trim().toLowerCase();
  if (!needle.includes("@")) return;
  if ((state.accessRequests ?? []).some((r) => r.status === "pending" && r.email === needle)) return;
  if (queuingAccess.has(needle)) return;
  queuingAccess.add(needle);
  const request: AccessRequest = {
    id: createId(),
    email: needle,
    displayName: displayName.trim() || needle.split("@")[0],
    phone: "",
    note: "",
    desk: "",
    status: "pending",
    decidedRole: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: new Date().toISOString(),
  };
  try {
    if (isCloudConfigured()) {
      try {
        await insertAccessRequest(request);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/pendiente con ese correo|duplicate|unique/i.test(message)) return;
        throw err;
      }
    }
    if ((state.accessRequests ?? []).some((r) => r.status === "pending" && r.email === needle)) return;
    const next: Snapshot = {
      ...state,
      accessRequests: [...(state.accessRequests ?? []), request],
    };
    if (isCloudConfigured()) {
      state = next;
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      notify();
      return;
    }
    persist(next);
  } catch (err) {
    console.error(err);
  } finally {
    queuingAccess.delete(needle);
  }
}

export async function bootStore() {
  if (booting) return booting;
  booting = (async () => {
    if (!isCloudConfigured()) {
      state = load();
      notify();
      return;
    }
    const sb = getSupabase();
    const [data, auth] = await Promise.all([pullSnapshot(), sb.auth.getSession()]);
    state = applyCloudPull(data, { ...load(), sessionUserId: null });
    await applyAuthSession(auth.data.session);
    if (!authListening) {
      authListening = true;
      sb.auth.onAuthStateChange((_event, session) => {
        void applyAuthSession(session);
      });
    }
    if (cloudUnsub) return;
    try {
      cloudUnsub = subscribeCloud(() => {
        void pullSnapshot()
          .then(async (next) => {
            state = applyCloudPull(next, { ...state, sessionUserId: state.sessionUserId });
            const auth = await getSupabase().auth.getSession();
            await applyAuthSession(auth.data.session);
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

function normalizeCubaKinds(kinds: CubaOperatorKind[] | undefined): CubaOperatorKind[] {
  const allowed: CubaOperatorKind[] = ["transfer", "mobile_recharge"];
  return allowed.filter((k) => (kinds ?? []).includes(k));
}

function stampTracking(
  snapshot: Snapshot,
  operation: Operation,
): { operations: Operation[]; operation: Operation } {
  if (operation.trackingCode) {
    return { operations: snapshot.operations, operation };
  }
  const trackingCode = makeTrackingCode(snapshot.operations.map((o) => o.trackingCode));
  return {
    operations: snapshot.operations.map((op) => (op.id === operation.id ? { ...op, trackingCode } : op)),
    operation: { ...operation, trackingCode },
  };
}

function applyCubaVerdict(
  snapshot: Snapshot,
  thread: CubaThread,
  verdict: "success" | "failure" | "unclear",
  reference: string,
  now: string,
  force = false,
): Snapshot {
  const operation = snapshot.operations.find((o) => o.id === thread.operationId);
  if (!operation) return snapshot;
  const cubaThreads = snapshot.cubaThreads ?? [];
  if (verdict === "unclear") {
    return {
      ...snapshot,
      cubaThreads: cubaThreads.map((t) =>
        t.id === thread.id
          ? { ...t, status: "needs_review", repliedAt: now, parsedReference: reference, lastError: "" }
          : t,
      ),
    };
  }
  if (verdict === "failure") {
    let next: Snapshot = {
      ...snapshot,
      cubaThreads: cubaThreads.map((t) =>
        t.id === thread.id
          ? { ...t, status: "failed", repliedAt: now, parsedReference: reference, lastError: "El operador reportó un fallo." }
          : t,
      ),
    };
    if (isDeliveryKind(operation.kind) && operation.deliveryStatus !== "failed") {
      const releases: ProvinceMovement[] = [];
      if (isCashKind(operation.kind) && operation.provinceId) {
        const currency = operation.kind === "cash_usd" ? "USD" : "CUP";
        releases.push({
          id: createId("pmv"),
          provinceId: operation.provinceId,
          operationId: operation.id,
          currency,
          amount: currency === "USD" ? operation.amountUsd : operation.amountCup,
          kind: "release",
        });
      }
      next = {
        ...next,
        operations: next.operations.map((op) =>
          op.id === operation.id
            ? {
                ...op,
                deliveryStatus: "failed",
                deliveredAt: null,
                status: workflowStatus({ ...op, deliveryStatus: "failed" }, next.legs),
              }
            : op,
        ),
        provinceMovements: [...next.provinceMovements, ...releases],
      };
    }
    return next;
  }

  const ref = reference.trim() || thread.code;
  let next: Snapshot = {
    ...snapshot,
    cubaThreads: cubaThreads.map((t) =>
      t.id === thread.id
        ? { ...t, status: "auto_matched", repliedAt: now, parsedReference: ref, lastError: "" }
        : t,
    ),
  };

  if (isDeliveryKind(operation.kind) && operation.deliveryStatus !== "sent") {
    next = {
      ...next,
      operations: next.operations.map((op) =>
        op.id === operation.id
          ? {
              ...op,
              deliveryStatus: "sent",
              deliveryReference: ref,
              deliveredAt: now,
              status: workflowStatus({ ...op, deliveryStatus: "sent" }, next.legs),
            }
          : op,
      ),
    };
  } else if (operation.kind === "transfer") {
    const pending = next.legs.filter((l) => l.operationId === operation.id && l.status === "pending");
    if (pending.length === 1) {
      next = {
        ...next,
        legs: next.legs.map((l) =>
          l.id === pending[0].id ? { ...l, status: "sent" as const, reference: ref, sentAt: now } : l,
        ),
        operations: next.operations.map((op) =>
          op.id === operation.id
            ? {
                ...op,
                status: workflowStatus(op, next.legs.map((l) =>
                  l.id === pending[0].id ? { ...l, status: "sent" as const } : l,
                )),
              }
            : op,
        ),
      };
    } else if (!force) {
      next = {
        ...next,
        cubaThreads: next.cubaThreads.map((t) =>
          t.id === thread.id
            ? {
                ...t,
                status: "needs_review",
                parsedReference: ref,
                lastError:
                  pending.length > 1
                    ? "Hay que revisar las patas CUP."
                    : "No hay una pata CUP pendiente para marcar.",
              }
            : t,
        ),
      };
    }
  }
  return next;
}

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
      if (isCloudConfigured()) {
        throw new Error("Entra con Google. El listado local ya no se usa en la nube.");
      }
      const user = snapshot.profiles.find((p) => p.id === userId);
      if (!user?.active) throw new Error("Ese usuario no está activo.");
      writeSession(userId);
      state = { ...snapshot, sessionUserId: userId };
      localStorage.setItem(KEY, JSON.stringify(state));
      notify();
    },
    async signInWithGoogle() {
      if (!isCloudConfigured()) throw new Error("Falta la conexión a Supabase.");
      authNotice = null;
      state = { ...state };
      notify();
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: appRedirectUrl(),
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        throw new Error(
          /provider is not enabled|Unsupported provider/i.test(error.message)
            ? "Activa Google en Supabase (Authentication → Providers) y añade en Google Cloud el URI https://obyvfrrwmsqhlgmnoqfr.supabase.co/auth/v1/callback"
            : error.message,
        );
      }
    },
    logout() {
      pendingAuth = null;
      authNotice = null;
      writeSession(null);
      state = { ...snapshot, sessionUserId: null };
      if (!isCloudConfigured()) localStorage.setItem(KEY, JSON.stringify(state));
      notify();
      if (isCloudConfigured()) void getSupabase().auth.signOut();
    },
    cloudAuth: isCloudConfigured(),
    authNotice,
    pendingAuth,
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
      if (input.role !== "admin" && input.role !== "operator" && input.role !== "cuba") {
        throw new Error("El rol no es válido.");
      }
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
    async requestAccess(input: {
      displayName: string;
      phone: string;
      note: string;
      desk: AccessDesk | "";
    }) {
      const displayName = input.displayName.trim();
      if (!displayName) throw new Error("El nombre es obligatorio.");
      const email = (
        isCloudConfigured()
          ? (await getSupabase().auth.getUser()).data.user?.email
          : pendingAuth?.email
      )
        ?.trim()
        .toLowerCase();
      if (!email || !email.includes("@")) {
        throw new Error("Entra primero con Google para pedir acceso.");
      }
      if (profileForEmail(email)?.active) {
        throw new Error("Ese correo ya tiene un perfil activo.");
      }
      const open = (state.accessRequests ?? []).find(
        (r) => r.status === "pending" && r.email === email,
      );
      if (open) throw new Error("Ya hay una solicitud pendiente con ese correo.");
      const request: AccessRequest = {
        id: createId(),
        email,
        displayName,
        phone: input.phone.trim(),
        note: input.note.trim(),
        desk: input.desk === "cuba" || input.desk === "guyana" ? input.desk : "",
        status: "pending",
        decidedRole: null,
        decidedBy: null,
        decidedAt: null,
        createdAt: new Date().toISOString(),
      };
      if (isCloudConfigured()) {
        await insertAccessRequest(request);
        state = {
          ...state,
          accessRequests: [...(state.accessRequests ?? []).filter((r) => r.id !== request.id), request],
        };
        notify();
        return;
      }
      persist({
        ...snapshot,
        accessRequests: [...(snapshot.accessRequests ?? []), request],
      });
    },
    approveAccessRequest(id: string, role: Role) {
      const admin = requireAdmin();
      if (role !== "admin" && role !== "operator" && role !== "cuba") {
        throw new Error("El rol no es válido.");
      }
      const request = (snapshot.accessRequests ?? []).find((r) => r.id === id);
      if (!request || request.status !== "pending") {
        throw new Error("Esa solicitud ya no está pendiente.");
      }
      const existing = snapshot.profiles.find(
        (p) => p.email.trim().toLowerCase() === request.email,
      );
      const profile: Profile = {
        id: existing?.id ?? createId("usr"),
        email: request.email,
        displayName: request.displayName,
        phone: request.phone,
        role,
        active: true,
      };
      const now = new Date().toISOString();
      persist({
        ...snapshot,
        profiles: [...snapshot.profiles.filter((p) => p.id !== profile.id), profile],
        accessRequests: (snapshot.accessRequests ?? []).map((r) =>
          r.id === id
            ? {
                ...r,
                status: "approved",
                decidedRole: role,
                decidedBy: admin.id,
                decidedAt: now,
              }
            : r,
        ),
      });
    },
    rejectAccessRequest(id: string) {
      const admin = requireAdmin();
      const request = (snapshot.accessRequests ?? []).find((r) => r.id === id);
      if (!request || request.status !== "pending") {
        throw new Error("Esa solicitud ya no está pendiente.");
      }
      persist({
        ...snapshot,
        accessRequests: (snapshot.accessRequests ?? []).map((r) =>
          r.id === id
            ? {
                ...r,
                status: "rejected",
                decidedBy: admin.id,
                decidedAt: new Date().toISOString(),
              }
            : r,
        ),
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
    upsertSettings(input: { advisorCommissionPercent: number }) {
      requireAdmin();
      const percent = Number(input.advisorCommissionPercent);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new Error("El porcentaje de comisión debe estar entre 0 y 100.");
      }
      persist({
        ...snapshot,
        settings: { advisorCommissionPercent: round2(percent) },
      });
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
    upsertCourier(input: Omit<CashCourier, "id"> & { id?: string }) {
      requireSession();
      const name = input.name.trim();
      if (!name) throw new Error("El nombre del repartidor es obligatorio.");
      if (!input.provinceId) throw new Error("El repartidor necesita una provincia.");
      const courier: CashCourier = {
        id: input.id ?? createId("crr"),
        provinceId: input.provinceId,
        name,
        phone: input.phone.trim(),
        active: input.active,
      };
      persist({
        ...snapshot,
        couriers: [...(snapshot.couriers ?? []).filter((c) => c.id !== courier.id), courier],
      });
      return courier.id;
    },
    deleteCourier(id: string) {
      requireAdmin();
      persist({
        ...snapshot,
        couriers: (snapshot.couriers ?? []).filter((c) => c.id !== id),
      });
    },
    upsertCubaOperator(input: Omit<CubaOperator, "id"> & { id?: string }) {
      requireSession();
      const name = input.name.trim();
      if (!name) throw new Error("El nombre del operador en Cuba es obligatorio.");
      if (!input.phone.trim() && !input.email.trim()) {
        throw new Error("Indica WhatsApp o correo del operador.");
      }
      const kinds = normalizeCubaKinds(input.kinds);
      if (!kinds.length) throw new Error("Elige si hace transferencias, recargas o ambas.");
      const linked = input.profileId
        ? snapshot.profiles.find((p) => p.id === input.profileId)
        : undefined;
      const operator: CubaOperator = {
        id: input.id ?? createId("cop"),
        name,
        phone: input.phone.trim() || linked?.phone.trim() || "",
        email: input.email.trim() || linked?.email.trim() || "",
        profileId: input.profileId?.trim() ?? "",
        active: input.active,
        kinds,
      };
      persist({
        ...snapshot,
        cubaOperators: [...(snapshot.cubaOperators ?? []).filter((o) => o.id !== operator.id), operator],
      });
      return operator.id;
    },
    deleteCubaOperator(id: string) {
      requireAdmin();
      const busy = (snapshot.cubaThreads ?? []).some(
        (t) =>
          t.operatorId === id &&
          (t.status === "queued" || t.status === "sent" || t.status === "awaiting_reply"),
      );
      if (busy) throw new Error("Ese operador tiene envíos pendientes. Reasigna o cierra la bandeja primero.");
      persist({
        ...snapshot,
        cubaOperators: (snapshot.cubaOperators ?? []).filter((o) => o.id !== id),
      });
    },
    assignCubaOperator(operationId: string, operatorId: string) {
      requireAdmin();
      const raw = assertActiveOperation(snapshot.operations.find((o) => o.id === operationId));
      const { operations, operation } = stampTracking(snapshot, raw);
      const chosen =
        (operatorId && snapshot.cubaOperators.find((o) => o.id === operatorId && o.active)) ||
        pickCubaOperator(snapshot.cubaOperators ?? [], snapshot.cubaThreads ?? [], operation.kind);
      if (!chosen) throw new Error("No hay un operador de Cuba activo para este tipo de envío.");
      const existing = (snapshot.cubaThreads ?? []).find(
        (t) =>
          t.operationId === operationId &&
          (t.status === "queued" ||
            t.status === "sent" ||
            t.status === "awaiting_reply" ||
            t.status === "needs_review" ||
            t.status === "timed_out"),
      );
      const now = new Date().toISOString();
      const thread: CubaThread = existing
        ? { ...existing, operatorId: chosen.id, code: operation.trackingCode, assignedAt: now, status: "queued" }
        : {
            id: createId("cth"),
            operationId,
            operatorId: chosen.id,
            code: operation.trackingCode,
            status: "queued",
            channel: "wa_me",
            assignedAt: now,
            sentAt: null,
            repliedAt: null,
            timeoutAt: null,
            parsedReference: "",
            lastError: "",
          };
      persist({
        ...snapshot,
        operations: operations.map((op) =>
          op.id === operationId ? { ...op, cubaOperatorId: chosen.id } : op,
        ),
        cubaThreads: [
          ...(snapshot.cubaThreads ?? []).filter((t) => t.id !== thread.id),
          thread,
        ],
      });
      return chosen.id;
    },
    logCubaOutbound(input: {
      operationId: string;
      operatorId: string;
      channel: MessageChannel;
      body: string;
      cloudSent?: boolean;
    }) {
      requireAdmin();
      const raw = assertActiveOperation(snapshot.operations.find((o) => o.id === input.operationId));
      const { operations, operation } = stampTracking(snapshot, raw);
      const operator = snapshot.cubaOperators.find((o) => o.id === input.operatorId);
      if (!operator) throw new Error("Operador de Cuba no encontrado.");
      const now = new Date().toISOString();
      let threads = snapshot.cubaThreads ?? [];
      let thread = threads.find(
        (t) =>
          t.operationId === input.operationId &&
          (t.status === "queued" ||
            t.status === "sent" ||
            t.status === "awaiting_reply" ||
            t.status === "needs_review" ||
            t.status === "timed_out"),
      );
      if (!thread) {
        thread = {
          id: createId("cth"),
          operationId: input.operationId,
          operatorId: input.operatorId,
          code: operation.trackingCode,
          status: "queued",
          channel: input.channel,
          assignedAt: now,
          sentAt: null,
          repliedAt: null,
          timeoutAt: null,
          parsedReference: "",
          lastError: "",
        };
        threads = [...threads, thread];
      }
      const timeoutAt = new Date(Date.now() + CUBA_TIMEOUT_MS).toISOString();
      const nextThread: CubaThread = {
        ...thread,
        operatorId: input.operatorId,
        channel: input.channel,
        status: "awaiting_reply",
        sentAt: now,
        timeoutAt,
        lastError: "",
      };
      const message: CubaMessage = {
        id: createId("cmsg"),
        threadId: nextThread.id,
        operationId: input.operationId,
        operatorId: input.operatorId,
        channel: input.channel,
        direction: "out",
        body: input.body,
        mediaUrl: "",
        externalId: "",
        createdAt: now,
      };
      persist({
        ...snapshot,
        operations: operations.map((op) =>
          op.id === input.operationId ? { ...op, cubaOperatorId: input.operatorId } : op,
        ),
        cubaThreads: threads.map((t) => (t.id === nextThread.id ? nextThread : t)),
        cubaMessages: [...(snapshot.cubaMessages ?? []), message],
      });
    },
    ingestCubaReply(input: {
      body: string;
      fromPhone?: string;
      fromEmail?: string;
      channel?: MessageChannel;
      mediaUrl?: string;
      externalId?: string;
      threadId?: string;
    }) {
      requireSession();
      const body = input.body.trim();
      const mediaUrl = input.mediaUrl?.trim() ?? "";
      if (!body && !mediaUrl) throw new Error("La respuesta está vacía.");
      const thread =
        (input.threadId
          ? snapshot.cubaThreads.find((t) => t.id === input.threadId)
          : undefined) ??
        matchInboundThread(snapshot, {
          body,
          fromPhone: input.fromPhone,
          fromEmail: input.fromEmail,
        });
      if (!thread) throw new Error("No se pudo emparejar la respuesta con una operación.");
      const operation = snapshot.operations.find((o) => o.id === thread.operationId);
      if (!operation) throw new Error("Operación no encontrada.");
      const now = new Date().toISOString();
      const message: CubaMessage = {
        id: createId("cmsg"),
        threadId: thread.id,
        operationId: thread.operationId,
        operatorId: thread.operatorId,
        channel: input.channel ?? "whatsapp",
        direction: "in",
        body,
        mediaUrl,
        externalId: input.externalId ?? "",
        createdAt: now,
      };
      const verdict =
        !body && mediaUrl
          ? { verdict: "unclear" as const, reference: "" }
          : parseCubaReply(body, expectedAmount(operation));
      const next = applyCubaVerdict(snapshot, thread, verdict.verdict, verdict.reference || thread.code, now);
      persist({
        ...next,
        cubaMessages: [...(next.cubaMessages ?? []), message],
      });
      return next.cubaThreads.find((t) => t.id === thread.id);
    },
    reviewCubaThread(threadId: string, action: "confirm" | "fail" | "reopen", reference?: string) {
      const user = requireSession();
      const thread = snapshot.cubaThreads.find((t) => t.id === threadId);
      if (!thread) throw new Error("Hilo no encontrado.");
      const operator = snapshot.cubaOperators.find((o) => o.id === thread.operatorId);
      const assigned = profileOwnsCubaOperator(user, operator);
      if (action === "confirm") {
        if (!assigned) {
          throw new Error("Solo el operador asignado a esta operación puede poner la referencia.");
        }
        const ref = (reference ?? "").trim() || thread.parsedReference.trim();
        if (!ref) throw new Error("Indica la referencia de confirmación.");
      } else if (user.role !== "admin" && !assigned) {
        throw new Error("No puedes cambiar este hilo.");
      }
      const now = new Date().toISOString();
      if (action === "reopen") {
        persist({
          ...snapshot,
          cubaThreads: snapshot.cubaThreads.map((t) =>
            t.id === threadId
              ? { ...t, status: "awaiting_reply", timeoutAt: new Date(Date.now() + CUBA_TIMEOUT_MS).toISOString() }
              : t,
          ),
        });
        return;
      }
      const verdict = action === "confirm" ? "success" : "failure";
      persist(
        applyCubaVerdict(
          snapshot,
          thread,
          verdict,
          action === "confirm"
            ? (reference ?? "").trim() || thread.parsedReference
            : reference?.trim() || thread.parsedReference || thread.code,
          now,
          true,
        ),
      );
    },
    tickCubaTimeouts() {
      const now = Date.now();
      const stamp = new Date(now).toISOString();
      let n = 0;
      const cubaThreads = (snapshot.cubaThreads ?? []).map((t) => {
        if (!timedOut(t, now)) return t;
        n += 1;
        return { ...t, status: "timed_out" as const, timeoutAt: stamp };
      });
      if (n) persist({ ...snapshot, cubaThreads });
      return n;
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
      if (isCashKind(input.kind) && !input.cubaRecipientName.trim()) {
        throw new Error("Selecciona quién va a entregar el efectivo.");
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
        trackingCode: makeTrackingCode(snapshot.operations.map((o) => o.trackingCode)),
        cubaOperatorId: "",
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
      if (isCashKind(current.kind) && !cubaRecipientName) {
        throw new Error("Selecciona quién va a entregar el efectivo.");
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
      const user = requireSession();
      const operation = snapshot.operations.find((o) => o.id === operationId);
      if (!operation) throw new Error("Operación no encontrada.");
      if (user.role !== "admin" && operation.createdBy !== user.id) {
        throw new Error("Solo el asesor de la ficha o el administrador pueden cerrar la operación.");
      }
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
          cubaThreads: (snapshot.cubaThreads ?? []).filter((t) => t.operationId !== operationId),
          cubaMessages: (snapshot.cubaMessages ?? []).filter((m) => m.operationId !== operationId),
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
        cubaThreads: (snapshot.cubaThreads ?? []).map((t) =>
          t.operationId === operationId && t.status !== "auto_matched" && t.status !== "failed"
            ? { ...t, status: "failed" as const, lastError: "Operación cancelada." }
            : t,
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
