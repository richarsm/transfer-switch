import type {
  Beneficiary,
  CardAccount,
  CardMovement,
  ItineraryLeg,
  Opening,
  Operation,
  Profile,
  Province,
  ProvinceMovement,
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
  };
}

export async function pullSnapshot(): Promise<Omit<Snapshot, "sessionUserId">> {
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
  };
}

export async function pushSnapshot(snapshot: Snapshot) {
  await deleteGone("province_movements", snapshot.provinceMovements);
  await deleteGone("card_movements", snapshot.movements);
  await deleteGone("transfer_legs", snapshot.legs);
  await deleteGone("itinerary_legs", snapshot.itineraries);
  await deleteGone("beneficiaries", snapshot.beneficiaries);
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
  await upsertRows(
    "operations",
    snapshot.operations.map((op) => ({
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
    })),
  );
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

async function upsertRows(table: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const { error } = await getSupabase().from(table).upsert(rows);
  if (error) throw new Error(`${table} upsert: ${error.message}`);
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
    role: row.role === "admin" ? "admin" : "operator",
    active: Boolean(row.active),
  };
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

export { empty as emptyCloudSnapshot };
