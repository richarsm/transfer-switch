import type {
  Beneficiary,
  CardAccount,
  CollectStatus,
  ItineraryLeg,
  Opening,
  OperationKind,
  OperationMode,
  PeriodKind,
  Profile,
  Province,
  Role,
  Snapshot,
  TravelOffer,
} from "../domain/types";

export type CardHeadroom = {
  card: CardAccount;
  usedToday: number;
  usedMonth: number;
  dailyLeft: number;
  monthlyLeft: number;
  balanceLeft: number;
  maxThisMove: number;
};

export type ProvinceHeadroom = {
  province: Province;
  cashCupLeft: number;
  cashUsdLeft: number;
};

export type OperationPatch = {
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
};

export type DashboardTotals = {
  transferredCup: number;
  rechargeCup: number;
  cashCup: number;
  cashUsd: number;
  pendingGyn: number;
  collectedGyn: number;
  assignedCup: number;
  sentCup: number;
  confirmedCount: number;
};

export type StoreApi = {
  snapshot: Snapshot;
  session: Profile | null;
  currentOpening: Opening | null;
  login: (userId: string) => void;
  logout: () => void;
  upsertProfile: (input: {
    id?: string;
    email: string;
    displayName: string;
    phone: string;
    role: Role;
    active: boolean;
  }) => void;
  openPeriod: (input: {
    kind: PeriodKind;
    startsOn: string;
    endsOn: string;
    cupPer1000Gyn: number;
    cashCupPer1000Gyn: number;
    cashUsdPer1000Gyn: number;
    notes: string;
  }) => void;
  closePeriod: (openingId: string) => void;
  upsertCard: (input: Omit<CardAccount, "id"> & { id?: string }) => void;
  upsertProvince: (input: {
    id: string;
    cashCup: number;
    cashUsd: number;
    notes: string;
  }) => void;
  provinceHeadroom: (provinceId: string) => ProvinceHeadroom;
  createOperation: (input: {
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
  }) => string;
  upsertBeneficiary: (input: Omit<Beneficiary, "id" | "createdBy" | "createdAt" | "updatedAt" | "lastUsedAt"> & {
    id?: string;
  }) => string;
    deleteBeneficiary: (id: string) => void;
    updateTransferDestination: (
      operationId: string,
      input: { cubaCardNumber: string; cubaRecipientName: string; cubaPhone: string },
    ) => void;
    updateOperation: (operationId: string, input: OperationPatch) => void;
    setCollectStatus: (operationId: string, status: CollectStatus) => void;
  addLeg: (operationId: string, cardId: string, amountCup: number) => void;
  markLegSent: (legId: string, reference: string) => void;
  failLeg: (legId: string) => void;
  markDeliverySent: (operationId: string, reference: string) => void;
    failDelivery: (operationId: string) => void;
    confirmOperation: (operationId: string) => void;
    cancelOperation: (operationId: string) => "removed" | "recorded";
  cardHeadroom: (cardId: string, businessDate: string) => CardHeadroom;
  dashboard: (from: string, to: string) => DashboardTotals;
  upsertTravel: (input: Omit<TravelOffer, "id"> & { id?: string }) => string;
  replaceItinerary: (offerId: string, legs: Omit<ItineraryLeg, "id" | "offerId" | "order">[]) => void;
};
