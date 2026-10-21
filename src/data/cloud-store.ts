import type {
  AccessDesk,
  AccessRequest,
  AccessRequestStatus,
  AppSettings,
  Beneficiary,
  CardAccount,
  CardMovement,
  CashCourier,
  CubaMessage,
  CubaOperator,
  CubaOperatorKind,
  CubaThread,
  CubaThreadStatus,
  ItineraryLeg,
  Opening,
  Operation,
  Profile,
  Province,
  ProvinceMovement,
  Role,
  Snapshot,
  TransferLeg,
  TravelOffer,
} from "../domain/types";
import { getSupabase } from "./supabase";

function n(value: unknown) {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function empty(): Omit<Snapshot, "sessionUserId"> {
  return {
    profiles: [],
    accessRequests: [],
    settings: { advisorCommissionPercent: 6 },
    openings: [],
    cards: [],
    operations: [],
    legs: [],
    movements: [],
    travels: [],
    itineraries: [],
    provinces: [],
    provinceMovements: [],
    beneficiaries: [],
    couriers: [],
    cubaOperators: [],
    cubaThreads: [],
    cubaMessages: [],
  };
}

export type CloudPull = Omit<Snapshot, "sessionUserId"> & {
  missingCubaInbox: boolean;
  missingCouriers: boolean;
  missingAccessRequests: boolean;
  missingSettings: boolean;
};

export async function pullSnapshot(): Promise<CloudPull> {
  const sb = getSupabase();
  const [
    profiles,
    openings,
    cards,
    operations,
    legs,
    movements,
    travels,
    itineraries,
    provinces,
    provinceMovements,
    beneficiaries,
    couriers,
    cubaOperators,
    cubaThreads,
    cubaMessages,
    accessRequests,
    settings,
  ] = await Promise.all([
    sb.from("profiles").select("*"),
    sb.from("openings").select("*"),
    sb.from("cards").select("*"),
    sb.from("operations").select("*"),
    sb.from("transfer_legs").select("*"),
    sb.from("card_movements").select("*"),
    sb.from("travel_offers").select("*"),
    sb.from("itinerary_legs").select("*"),
    sb.from("provinces").select("*"),
    sb.from("province_movements").select("*"),
    sb.from("beneficiaries").select("*"),
    sb.from("cash_couriers").select("*"),
    sb.from("cuba_operators").select("*"),
    sb.from("cuba_threads").select("*"),
    sb.from("cuba_messages").select("*"),
    sb.from("access_requests").select("*"),
    sb.from("app_settings").select("*").eq("id", "default").maybeSingle(),
  ]);

  const firstError = [
    profiles,
    openings,
    cards,
    operations,
    legs,
    movements,
    travels,
    itineraries,
    provinces,
    provinceMovements,
    beneficiaries,
  ].find((r) => r.error);
  if (firstError?.error) throw new Error(firstError.error.message);
  if (couriers.error && !missingTable(couriers.error)) {
    throw new Error(couriers.error.message);
  }
  for (const extra of [cubaOperators, cubaThreads, cubaMessages, accessRequests, settings]) {
    if (extra.error && !missingTable(extra.error)) throw new Error(extra.error.message);
  }

  return {
    profiles: (profiles.data ?? []).map(mapProfile),
    openings: (openings.data ?? []).map(mapOpening),
    cards: (cards.data ?? []).map(mapCard),
    operations: (operations.data ?? []).map(mapOperation),
    legs: (legs.data ?? []).map(mapLeg),
    movements: (movements.data ?? []).map(mapMovement),
    travels: (travels.data ?? []).map(mapTravel),
    itineraries: (itineraries.data ?? []).map(mapItinerary),
    provinces: (provinces.data ?? []).map(mapProvince),
    provinceMovements: (provinceMovements.data ?? []).map(mapProvinceMovement),
    beneficiaries: (beneficiaries.data ?? []).map(mapBeneficiary),
    couriers: (couriers.data ?? []).map(mapCourier),
    cubaOperators: (cubaOperators.data ?? []).map(mapCubaOperator),
    cubaThreads: (cubaThreads.data ?? []).map(mapCubaThread),
    cubaMessages: (cubaMessages.data ?? []).map(mapCubaMessage),
    accessRequests: (accessRequests.data ?? []).map(mapAccessRequest),
    settings: mapSettings(settings.data),
    missingCouriers: Boolean(couriers.error && missingTable(couriers.error)),
    missingCubaInbox: [cubaOperators, cubaThreads, cubaMessages].some(
      (r) => r.error && missingTable(r.error),
    ),
    missingAccessRequests: Boolean(accessRequests.error && missingTable(accessRequests.error)),
    missingSettings: Boolean(settings.error && missingTable(settings.error)),
  };
}

export async function pushSnapshot(snapshot: Snapshot) {
  await deleteGone("province_movements", snapshot.provinceMovements);
  await deleteGone("card_movements", snapshot.movements);
  await deleteGone("transfer_legs", snapshot.legs);
  await deleteGone("itinerary_legs", snapshot.itineraries);
  await deleteGone("beneficiaries", snapshot.beneficiaries);
  await deleteGoneOptional("cash_couriers", snapshot.couriers ?? []);
  await deleteGoneOptional("cuba_messages", snapshot.cubaMessages ?? []);
  await deleteGoneOptional("cuba_threads", snapshot.cubaThreads ?? []);
  await deleteGoneOptional("cuba_operators", snapshot.cubaOperators ?? []);
  await deleteGone("operations", snapshot.operations);
  await deleteGone("travel_offers", snapshot.travels);

  await upsertRows(
    "profiles",
    snapshot.profiles.map((p) => ({
      id: p.id,
      email: p.email,
      display_name: p.displayName,
      phone: p.phone,
      role: p.role,
      active: p.active,
    })),
  );
  await upsertRows(
    "provinces",
    snapshot.provinces.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      cash_cup: p.cashCup,
      cash_usd: p.cashUsd,
      notes: p.notes,
    })),
  );
  await upsertRows(
    "cards",
    snapshot.cards.map((c) => ({
      id: c.id,
      alias: c.alias,
      bank: c.bank,
      last4: c.last4,
      holder: c.holder,
      balance_cup: c.balanceCup,
      daily_limit: c.dailyLimit,
      monthly_limit: c.monthlyLimit,
      active: c.active,
      notes: c.notes,
    })),
  );
  await upsertRows(
    "openings",
    snapshot.openings.map((o) => ({
      id: o.id,
      kind: o.kind,
      starts_on: o.startsOn,
      ends_on: o.endsOn,
      cup_per_1000_gyn: o.cupPer1000Gyn,
      cash_cup_per_1000_gyn: o.cashCupPer1000Gyn,
      cash_usd_per_1000_gyn: o.cashUsdPer1000Gyn,
      notes: o.notes,
      status: o.status,
      opened_by: o.openedBy,
      opened_at: o.openedAt,
      closed_at: o.closedAt,
    })),
  );
  const operationRows = snapshot.operations.map((op) => ({
    id: op.id,
    opening_id: op.openingId,
    kind: op.kind,
    mode: op.mode,
    status: op.status,
    created_by: op.createdBy,
    created_at: op.createdAt,
    contact_name: op.contactName,
    contact_phone: op.contactPhone,
    address: op.address,
    lat: op.lat,
    lng: op.lng,
    cuba_phone: op.cubaPhone,
    cuba_recipient_name: op.cubaRecipientName,
    cuba_card_number: op.cubaCardNumber,
    cuba_address: op.cubaAddress,
    province_id: op.provinceId || null,
    amount_gyn: op.amountGyn,
    amount_cup: op.amountCup,
    amount_usd: op.amountUsd,
    rate_cup_per_1000_gyn: op.rateCupPer1000Gyn,
    rate_cash_cup_per_1000_gyn: op.rateCashCupPer1000Gyn,
    rate_cash_usd_per_1000_gyn: op.rateCashUsdPer1000Gyn,
    collect_status: op.collectStatus,
    collected_at: op.collectedAt,
    delivery_status: op.deliveryStatus,
    delivery_reference: op.deliveryReference,
    delivered_at: op.deliveredAt,
    confirmed_at: op.confirmedAt,
    cancelled_at: op.cancelledAt,
    cancelled_by: op.cancelledBy,
    notes: op.notes,
    tracking_code: op.trackingCode ?? "",
    cuba_operator_id: op.cubaOperatorId || null,
  }));
  try {
    await upsertRows("operations", operationRows);
  } catch (err) {
    if (!missingColumn(err)) throw err;
    await upsertRows(
      "operations",
      operationRows.map((row) => ({
        id: row.id,
        opening_id: row.opening_id,
        kind: row.kind,
        mode: row.mode,
        status: row.status,
        created_by: row.created_by,
        created_at: row.created_at,
        contact_name: row.contact_name,
        contact_phone: row.contact_phone,
        address: row.address,
        lat: row.lat,
        lng: row.lng,
        cuba_phone: row.cuba_phone,
        cuba_recipient_name: row.cuba_recipient_name,
        cuba_card_number: row.cuba_card_number,
        cuba_address: row.cuba_address,
        province_id: row.province_id,
        amount_gyn: row.amount_gyn,
        amount_cup: row.amount_cup,
        amount_usd: row.amount_usd,
        rate_cup_per_1000_gyn: row.rate_cup_per_1000_gyn,
        rate_cash_cup_per_1000_gyn: row.rate_cash_cup_per_1000_gyn,
        rate_cash_usd_per_1000_gyn: row.rate_cash_usd_per_1000_gyn,
        collect_status: row.collect_status,
        collected_at: row.collected_at,
        delivery_status: row.delivery_status,
        delivery_reference: row.delivery_reference,
        delivered_at: row.delivered_at,
        confirmed_at: row.confirmed_at,
        cancelled_at: row.cancelled_at,
        cancelled_by: row.cancelled_by,
        notes: row.notes,
      })),
    );
  }
  await upsertRows(
    "transfer_legs",
    snapshot.legs.map((l) => ({
      id: l.id,
      operation_id: l.operationId,
      card_id: l.cardId,
      amount_cup: l.amountCup,
      status: l.status,
      reference: l.reference,
      sent_at: l.sentAt,
    })),
  );
  await upsertRows(
    "card_movements",
    snapshot.movements.map((m) => ({
      id: m.id,
      card_id: m.cardId,
      operation_id: m.operationId,
      leg_id: m.legId,
      amount_cup: m.amountCup,
      business_date: m.businessDate,
      kind: m.kind,
    })),
  );
  await upsertRows(
    "province_movements",
    snapshot.provinceMovements.map((m) => ({
      id: m.id,
      province_id: m.provinceId || null,
      operation_id: m.operationId,
      currency: m.currency,
      amount: m.amount,
      kind: m.kind,
    })),
  );
  await upsertOptional(
    "cash_couriers",
    (snapshot.couriers ?? []).map((c) => ({
      id: c.id,
      province_id: c.provinceId,
      name: c.name,
      phone: c.phone,
      active: c.active,
    })),
  );
  await upsertOptional(
    "cuba_operators",
    (snapshot.cubaOperators ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      phone: o.phone,
      email: o.email,
      profile_id: o.profileId || null,
      active: o.active,
      kinds: o.kinds,
    })),
  );
  await upsertOptional(
    "cuba_threads",
    (snapshot.cubaThreads ?? []).map((t) => ({
      id: t.id,
      operation_id: t.operationId,
      operator_id: t.operatorId,
      code: t.code,
      status: t.status,
      channel: t.channel,
      assigned_at: t.assignedAt,
      sent_at: t.sentAt,
      replied_at: t.repliedAt,
      timeout_at: t.timeoutAt,
      parsed_reference: t.parsedReference,
      last_error: t.lastError,
    })),
  );
  await upsertOptional(
    "cuba_messages",
    (snapshot.cubaMessages ?? []).map((m) => ({
      id: m.id,
      thread_id: m.threadId,
      operation_id: m.operationId,
      operator_id: m.operatorId,
      channel: m.channel,
      direction: m.direction,
      body: m.body,
      media_url: m.mediaUrl,
      external_id: m.externalId,
      created_at: m.createdAt,
    })),
  );
  await upsertRows(
    "beneficiaries",
    snapshot.beneficiaries.map((b) => ({
      id: b.id,
      created_by: b.createdBy,
      created_at: b.createdAt,
      updated_at: b.updatedAt,
      last_used_at: b.lastUsedAt,
      contact_name: b.contactName,
      contact_phone: b.contactPhone,
      address: b.address,
      lat: b.lat,
      lng: b.lng,
      cuba_phone: b.cubaPhone,
      cuba_recipient_name: b.cubaRecipientName,
      cuba_card_number: b.cubaCardNumber,
      cuba_address: b.cubaAddress,
      province_id: b.provinceId || null,
      notes: b.notes,
    })),
  );
  await upsertRows(
    "travel_offers",
    snapshot.travels.map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      origin: t.origin,
      destination: t.destination,
      price_gyn: t.priceGyn,
      price_cup: t.priceCup,
      price_usdt: t.priceUsdt,
      seats: t.seats,
      status: t.status,
      notes: t.notes,
    })),
  );
  await upsertRows(
    "itinerary_legs",
    snapshot.itineraries.map((l) => ({
      id: l.id,
      offer_id: l.offerId,
      sort_order: l.order,
      origin: l.origin,
      destination: l.destination,
      departs_at: l.departsAt,
      vehicle: l.vehicle,
      notes: l.notes,
    })),
  );
  await upsertOptional("app_settings", [
    {
      id: "default",
      advisor_commission_percent: snapshot.settings?.advisorCommissionPercent ?? 6,
      updated_at: new Date().toISOString(),
    },
  ]);
  await upsertOptional(
    "access_requests",
    (snapshot.accessRequests ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      display_name: r.displayName,
      phone: r.phone,
      note: r.note,
      desk: r.desk,
      status: r.status,
      decided_role: r.decidedRole,
      decided_by: r.decidedBy || null,
      decided_at: r.decidedAt,
      created_at: r.createdAt,
    })),
  );
}

async function deleteGone(table: string, rows: Array<{ id: string }>) {
  const sb = getSupabase();
  const { data: existing, error: readError } = await sb.from(table).select("id");
  if (readError) throw new Error(`${table}: ${readError.message}`);
  const keep = new Set(rows.map((r) => r.id));
  const gone = (existing ?? []).map((r) => String(r.id)).filter((id) => !keep.has(id));
  if (!gone.length) return;
  const { error } = await sb.from(table).delete().in("id", gone);
  if (error) throw new Error(`${table} delete: ${error.message}`);
}

async function deleteGoneOptional(table: string, rows: Array<{ id: string }>) {
  try {
    await deleteGone(table, rows);
  } catch (err) {
    if (!missingTable(err)) throw err;
  }
}

async function upsertRows(table: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const { error } = await getSupabase().from(table).upsert(rows);
  if (error) throw new Error(`${table} upsert: ${error.message}`);
}

async function upsertOptional(table: string, rows: Array<Record<string, unknown>>) {
  try {
    await upsertRows(table, rows);
  } catch (err) {
    if (!missingTable(err)) throw err;
  }
}

function errMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: string }).message);
  return String(err);
}

function missingTable(err: unknown): boolean {
  const message = errMessage(err);
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    /could not find the table|does not exist|schema cache/i.test(message)
  );
}

function missingColumn(err: unknown): boolean {
  return /could not find the ['"]?(tracking_code|cuba_operator_id)['"]? column|column .*tracking_code.* does not exist|column .*cuba_operator_id.* does not exist/i.test(
    errMessage(err),
  );
}

const CLOUD_TABLES = [
  "profiles",
  "openings",
  "cards",
  "operations",
  "transfer_legs",
  "card_movements",
  "travel_offers",
  "itinerary_legs",
  "provinces",
  "province_movements",
  "beneficiaries",
  "cash_couriers",
  "cuba_operators",
  "cuba_threads",
  "cuba_messages",
  "access_requests",
  "app_settings",
] as const;

export function subscribeCloud(onChange: () => void) {
  const sb = getSupabase();
  for (const existing of sb.getChannels()) {
    void sb.removeChannel(existing);
  }
  let channel = sb.channel("transfer-switch");
  for (const table of CLOUD_TABLES) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  }
  channel.subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name ?? ""),
    phone: String(row.phone ?? ""),
    role: row.role === "admin" ? "admin" : row.role === "cuba" ? "cuba" : "operator",
    active: Boolean(row.active),
  };
}

function mapRole(value: unknown): Role | null {
  if (value === "admin" || value === "operator" || value === "cuba") return value;
  return null;
}

function mapSettings(row: Record<string, unknown> | null | undefined): AppSettings {
  if (!row) return { advisorCommissionPercent: 6 };
  const percent = Number(row.advisor_commission_percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { advisorCommissionPercent: 6 };
  }
  return { advisorCommissionPercent: percent };
}

function mapAccessRequest(row: Record<string, unknown>): AccessRequest {
  const desk = row.desk === "cuba" || row.desk === "guyana" ? (row.desk as AccessDesk) : "";
  const status: AccessRequestStatus =
    row.status === "approved" || row.status === "rejected" ? row.status : "pending";
  return {
    id: String(row.id),
    email: String(row.email ?? "").trim().toLowerCase(),
    displayName: String(row.display_name ?? ""),
    phone: String(row.phone ?? ""),
    note: String(row.note ?? ""),
    desk,
    status,
    decidedRole: mapRole(row.decided_role),
    decidedBy: row.decided_by ? String(row.decided_by) : null,
    decidedAt: row.decided_at ? String(row.decided_at) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

export async function insertAccessRequest(row: AccessRequest) {
  const { error } = await getSupabase().from("access_requests").upsert({
    id: row.id,
    email: row.email,
    display_name: row.displayName,
    phone: row.phone,
    note: row.note,
    desk: row.desk,
    status: row.status,
    decided_role: row.decidedRole,
    decided_by: row.decidedBy || null,
    decided_at: row.decidedAt,
    created_at: row.createdAt,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error("Ya hay una solicitud pendiente con ese correo.");
    }
    throw new Error(error.message);
  }
}

function mapOpening(row: Record<string, unknown>): Opening {
  return {
    id: String(row.id),
    kind: row.kind === "week" ? "week" : "day",
    startsOn: String(row.starts_on).slice(0, 10),
    endsOn: String(row.ends_on).slice(0, 10),
    cupPer1000Gyn: n(row.cup_per_1000_gyn),
    cashCupPer1000Gyn: n(row.cash_cup_per_1000_gyn),
    cashUsdPer1000Gyn: n(row.cash_usd_per_1000_gyn),
    notes: String(row.notes ?? ""),
    status: row.status === "closed" ? "closed" : "open",
    openedBy: String(row.opened_by),
    openedAt: String(row.opened_at ?? ""),
    closedAt: row.closed_at ? String(row.closed_at) : null,
  };
}

function mapCard(row: Record<string, unknown>): CardAccount {
  return {
    id: String(row.id),
    alias: String(row.alias),
    bank: String(row.bank),
    last4: String(row.last4),
    holder: String(row.holder),
    balanceCup: n(row.balance_cup),
    dailyLimit: n(row.daily_limit),
    monthlyLimit: n(row.monthly_limit),
    active: Boolean(row.active),
    notes: String(row.notes ?? ""),
  };
}

function mapOperation(row: Record<string, unknown>): Operation {
  const status = String(row.status);
  return {
    id: String(row.id),
    openingId: String(row.opening_id),
    kind: (row.kind as Operation["kind"]) ?? "transfer",
    mode: row.mode === "transfer_then_collect" ? "transfer_then_collect" : "collect_then_transfer",
    status:
      status === "processing" || status === "confirmed" || status === "cancelled"
        ? status
        : "open",
    createdBy: String(row.created_by),
    createdAt: String(row.created_at ?? ""),
    contactName: String(row.contact_name ?? ""),
    contactPhone: String(row.contact_phone ?? ""),
    address: String(row.address ?? ""),
    lat: row.lat == null ? null : n(row.lat),
    lng: row.lng == null ? null : n(row.lng),
    cubaPhone: String(row.cuba_phone ?? ""),
    cubaRecipientName: String(row.cuba_recipient_name ?? ""),
    cubaCardNumber: String(row.cuba_card_number ?? ""),
    cubaAddress: String(row.cuba_address ?? ""),
    provinceId: row.province_id ? String(row.province_id) : "",
    amountGyn: n(row.amount_gyn),
    amountCup: n(row.amount_cup),
    amountUsd: n(row.amount_usd),
    rateCupPer1000Gyn: n(row.rate_cup_per_1000_gyn),
    rateCashCupPer1000Gyn: n(row.rate_cash_cup_per_1000_gyn),
    rateCashUsdPer1000Gyn: n(row.rate_cash_usd_per_1000_gyn),
    collectStatus:
      row.collect_status === "collected" || row.collect_status === "cancelled"
        ? row.collect_status
        : "pending",
    collectedAt: row.collected_at ? String(row.collected_at) : null,
    deliveryStatus:
      row.delivery_status === "sent" || row.delivery_status === "failed"
        ? row.delivery_status
        : "pending",
    deliveryReference: String(row.delivery_reference ?? ""),
    deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    cancelledBy: row.cancelled_by ? String(row.cancelled_by) : null,
    notes: String(row.notes ?? ""),
    trackingCode: String(row.tracking_code ?? ""),
    cubaOperatorId: row.cuba_operator_id ? String(row.cuba_operator_id) : "",
  };
}

function mapLeg(row: Record<string, unknown>): TransferLeg {
  const status = String(row.status);
  return {
    id: String(row.id),
    operationId: String(row.operation_id),
    cardId: String(row.card_id),
    amountCup: n(row.amount_cup),
    status: status === "sent" || status === "failed" ? status : "pending",
    reference: String(row.reference ?? ""),
    sentAt: row.sent_at ? String(row.sent_at) : null,
  };
}

function mapMovement(row: Record<string, unknown>): CardMovement {
  return {
    id: String(row.id),
    cardId: String(row.card_id),
    operationId: String(row.operation_id),
    legId: String(row.leg_id),
    amountCup: n(row.amount_cup),
    businessDate: String(row.business_date).slice(0, 10),
    kind: row.kind === "release" ? "release" : "consume",
  };
}

function mapTravel(row: Record<string, unknown>): TravelOffer {
  const status = String(row.status);
  return {
    id: String(row.id),
    kind: row.kind === "ground" ? "ground" : "flight",
    title: String(row.title ?? ""),
    origin: String(row.origin ?? ""),
    destination: String(row.destination ?? ""),
    priceGyn: n(row.price_gyn),
    priceCup: n(row.price_cup),
    priceUsdt: n(row.price_usdt),
    seats: n(row.seats),
    status:
      status === "published" || status === "sold_out" || status === "archived" ? status : "draft",
    notes: String(row.notes ?? ""),
  };
}

function mapItinerary(row: Record<string, unknown>): ItineraryLeg {
  return {
    id: String(row.id),
    offerId: String(row.offer_id),
    order: n(row.sort_order),
    origin: String(row.origin ?? ""),
    destination: String(row.destination ?? ""),
    departsAt: String(row.departs_at ?? ""),
    vehicle: String(row.vehicle ?? ""),
    notes: String(row.notes ?? ""),
  };
}

function mapProvince(row: Record<string, unknown>): Province {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    cashCup: n(row.cash_cup),
    cashUsd: n(row.cash_usd),
    notes: String(row.notes ?? ""),
  };
}

function mapProvinceMovement(row: Record<string, unknown>): ProvinceMovement {
  return {
    id: String(row.id),
    provinceId: String(row.province_id),
    operationId: String(row.operation_id),
    currency: row.currency === "USD" ? "USD" : "CUP",
    amount: n(row.amount),
    kind: row.kind === "release" ? "release" : "consume",
  };
}

function mapBeneficiary(row: Record<string, unknown>): Beneficiary {
  return {
    id: String(row.id),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    lastUsedAt: String(row.last_used_at ?? ""),
    contactName: String(row.contact_name ?? ""),
    contactPhone: String(row.contact_phone ?? ""),
    address: String(row.address ?? ""),
    lat: row.lat == null ? null : n(row.lat),
    lng: row.lng == null ? null : n(row.lng),
    cubaPhone: String(row.cuba_phone ?? ""),
    cubaRecipientName: String(row.cuba_recipient_name ?? ""),
    cubaCardNumber: String(row.cuba_card_number ?? ""),
    cubaAddress: String(row.cuba_address ?? ""),
    provinceId: row.province_id ? String(row.province_id) : "",
    notes: String(row.notes ?? ""),
  };
}

function mapCourier(row: Record<string, unknown>): CashCourier {
  return {
    id: String(row.id),
    provinceId: String(row.province_id),
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    active: row.active !== false,
  };
}

function mapCubaOperator(row: Record<string, unknown>): CubaOperator {
  const kinds = Array.isArray(row.kinds)
    ? (row.kinds as string[]).filter((k): k is CubaOperatorKind => k === "transfer" || k === "mobile_recharge")
    : (["transfer", "mobile_recharge"] as CubaOperatorKind[]);
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    email: String(row.email ?? ""),
    profileId: row.profile_id ? String(row.profile_id) : "",
    active: row.active !== false,
    kinds: kinds.length ? kinds : ["transfer", "mobile_recharge"],
  };
}

function mapCubaThread(row: Record<string, unknown>): CubaThread {
  const status = String(row.status) as CubaThreadStatus;
  const allowed: CubaThreadStatus[] = [
    "queued",
    "sent",
    "awaiting_reply",
    "auto_matched",
    "needs_review",
    "timed_out",
    "failed",
  ];
  const channel = String(row.channel);
  return {
    id: String(row.id),
    operationId: String(row.operation_id),
    operatorId: String(row.operator_id),
    code: String(row.code ?? ""),
    status: allowed.includes(status) ? status : "queued",
    channel: channel === "email" || channel === "whatsapp" ? channel : "wa_me",
    assignedAt: String(row.assigned_at ?? ""),
    sentAt: row.sent_at ? String(row.sent_at) : null,
    repliedAt: row.replied_at ? String(row.replied_at) : null,
    timeoutAt: row.timeout_at ? String(row.timeout_at) : null,
    parsedReference: String(row.parsed_reference ?? ""),
    lastError: String(row.last_error ?? ""),
  };
}

function mapCubaMessage(row: Record<string, unknown>): CubaMessage {
  const channel = String(row.channel);
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    operationId: String(row.operation_id),
    operatorId: String(row.operator_id),
    channel: channel === "email" || channel === "whatsapp" ? channel : "wa_me",
    direction: row.direction === "in" ? "in" : "out",
    body: String(row.body ?? ""),
    mediaUrl: String(row.media_url ?? ""),
    externalId: String(row.external_id ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export { empty as emptyCloudSnapshot };
