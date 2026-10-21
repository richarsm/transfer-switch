export type Role = "admin" | "operator" | "cuba";
export type Currency = "GYN" | "CUP" | "USDT" | "USD";
export type PeriodKind = "day" | "week";
export type OpeningStatus = "open" | "closed";
export type OperationKind =
  | "transfer"
  | "mobile_recharge"
  | "cash_cup"
  | "cash_usd";
export type OperationMode = "collect_then_transfer" | "transfer_then_collect";
export type OperationStatus = "open" | "processing" | "confirmed" | "cancelled";
export type CollectStatus = "pending" | "collected" | "cancelled";
export type DeliveryStatus = "pending" | "sent" | "failed";
export type TransferLegStatus = "pending" | "sent" | "failed";
export type TravelKind = "flight" | "ground";
export type TravelStatus = "draft" | "published" | "sold_out" | "archived";

export type Profile = {
  id: string;
  email: string;
  displayName: string;
  phone: string;
  role: Role;
  active: boolean;
};

export type AccessRequestStatus = "pending" | "approved" | "rejected";
export type AccessDesk = "guyana" | "cuba";

export type AccessRequest = {
  id: string;
  email: string;
  displayName: string;
  phone: string;
  note: string;
  desk: AccessDesk | "";
  status: AccessRequestStatus;
  decidedRole: Role | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export type Opening = {
  id: string;
  kind: PeriodKind;
  startsOn: string;
  endsOn: string;
  cupPer1000Gyn: number;
  cashCupPer1000Gyn: number;
  cashUsdPer1000Gyn: number;
  notes: string;
  status: OpeningStatus;
  openedBy: string;
  openedAt: string;
  closedAt: string | null;
};

export type CardAccount = {
  id: string;
  alias: string;
  bank: string;
  last4: string;
  holder: string;
  balanceCup: number;
  dailyLimit: number;
  monthlyLimit: number;
  active: boolean;
  notes: string;
};

export type CardMovement = {
  id: string;
  cardId: string;
  operationId: string;
  legId: string;
  amountCup: number;
  businessDate: string;
  kind: "consume" | "release";
};

export type TransferLeg = {
  id: string;
  operationId: string;
  cardId: string;
  amountCup: number;
  status: TransferLegStatus;
  reference: string;
  sentAt: string | null;
};

export type Beneficiary = {
  id: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
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
  notes: string;
};

export type Operation = {
  id: string;
  openingId: string;
  kind: OperationKind;
  mode: OperationMode;
  status: OperationStatus;
  createdBy: string;
  createdAt: string;
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
  rateCupPer1000Gyn: number;
  rateCashCupPer1000Gyn: number;
  rateCashUsdPer1000Gyn: number;
  collectStatus: CollectStatus;
  collectedAt: string | null;
  deliveryStatus: DeliveryStatus;
  deliveryReference: string;
  deliveredAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  notes: string;
  trackingCode: string;
  cubaOperatorId: string;
};

export type Province = {
  id: string;
  code: string;
  name: string;
  cashCup: number;
  cashUsd: number;
  notes: string;
};

export type CashCourier = {
  id: string;
  provinceId: string;
  name: string;
  phone: string;
  active: boolean;
};

export type CubaOperatorKind = "transfer" | "mobile_recharge";
export type MessageChannel = "whatsapp" | "email" | "wa_me";
export type MessageDirection = "out" | "in";
export type CubaThreadStatus =
  | "queued"
  | "sent"
  | "awaiting_reply"
  | "auto_matched"
  | "needs_review"
  | "timed_out"
  | "failed";

export type CubaOperator = {
  id: string;
  name: string;
  phone: string;
  email: string;
  profileId: string;
  active: boolean;
  kinds: CubaOperatorKind[];
};

export type CubaThread = {
  id: string;
  operationId: string;
  operatorId: string;
  code: string;
  status: CubaThreadStatus;
  channel: MessageChannel;
  assignedAt: string;
  sentAt: string | null;
  repliedAt: string | null;
  timeoutAt: string | null;
  parsedReference: string;
  lastError: string;
};

export type CubaMessage = {
  id: string;
  threadId: string;
  operationId: string;
  operatorId: string;
  channel: MessageChannel;
  direction: MessageDirection;
  body: string;
  mediaUrl: string;
  externalId: string;
  createdAt: string;
};

export type ProvinceMovement = {
  id: string;
  provinceId: string;
  operationId: string;
  currency: "CUP" | "USD";
  amount: number;
  kind: "consume" | "release";
};

export type TravelOffer = {
  id: string;
  kind: TravelKind;
  title: string;
  origin: string;
  destination: string;
  priceGyn: number;
  priceCup: number;
  priceUsdt: number;
  seats: number;
  status: TravelStatus;
  notes: string;
};

export type ItineraryLeg = {
  id: string;
  offerId: string;
  order: number;
  origin: string;
  destination: string;
  departsAt: string;
  vehicle: string;
  notes: string;
};

export type AppSettings = {
  advisorCommissionPercent: number;
};

export type Snapshot = {
  profiles: Profile[];
  accessRequests: AccessRequest[];
  settings: AppSettings;
  sessionUserId: string | null;
  openings: Opening[];
  cards: CardAccount[];
  operations: Operation[];
  legs: TransferLeg[];
  movements: CardMovement[];
  travels: TravelOffer[];
  itineraries: ItineraryLeg[];
  provinces: Province[];
  provinceMovements: ProvinceMovement[];
  beneficiaries: Beneficiary[];
  couriers: CashCourier[];
  cubaOperators: CubaOperator[];
  cubaThreads: CubaThread[];
  cubaMessages: CubaMessage[];
};
