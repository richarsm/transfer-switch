import type { Beneficiary, Operation } from "../domain/types";
import { createId } from "./ids";

export type BeneficiaryDraft = {
  id?: string;
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

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export function beneficiaryTitle(b: Pick<Beneficiary, "contactName" | "cubaRecipientName" | "cubaPhone">): string {
  const cuba = [b.cubaRecipientName, b.cubaPhone].filter(Boolean).join(" · ");
  return cuba ? `${b.contactName} → ${cuba}` : b.contactName;
}

export function beneficiaryKey(
  b: Pick<BeneficiaryDraft, "contactPhone" | "cubaPhone" | "cubaRecipientName" | "cubaCardNumber">,
): string {
  return [
    normalizePhone(b.contactPhone),
    normalizePhone(b.cubaPhone),
    b.cubaRecipientName.trim().toLowerCase(),
    b.cubaCardNumber.replace(/\D/g, ""),
  ].join("|");
}

export function searchBeneficiaries(list: Beneficiary[], query: string): Beneficiary[] {
  const sorted = [...list].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  const q = query.trim().toLowerCase();
  const digits = query.replace(/\D/g, "");
  if (!q) return sorted;
  return sorted.filter((b) => {
    const hay = [
      b.contactName,
      b.contactPhone,
      b.cubaRecipientName,
      b.cubaPhone,
      b.cubaCardNumber,
      b.address,
      b.cubaAddress,
    ]
      .join(" ")
      .toLowerCase();
    if (hay.includes(q)) return true;
    if (!digits) return false;
    return (
      normalizePhone(b.contactPhone).includes(digits) ||
      normalizePhone(b.cubaPhone).includes(digits) ||
      b.cubaCardNumber.replace(/\D/g, "").includes(digits)
    );
  });
}

export function matchBeneficiary(list: Beneficiary[], input: BeneficiaryDraft): Beneficiary | undefined {
  const key = beneficiaryKey(input);
  if (input.id) {
    const byId = list.find((b) => b.id === input.id);
    if (byId) return byId;
  }
  return list.find((b) => beneficiaryKey(b) === key);
}

export function upsertBeneficiaryList(
  list: Beneficiary[],
  createdBy: string,
  input: BeneficiaryDraft,
): Beneficiary[] {
  if (!input.contactName.trim() || !input.contactPhone.trim()) return list;
  const now = new Date().toISOString();
  const data = {
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
    notes: input.notes.trim(),
  };
  const existing = matchBeneficiary(list, input);
  if (existing) {
    return list.map((b) =>
      b.id === existing.id
        ? { ...existing, ...data, updatedAt: now, lastUsedAt: now }
        : b,
    );
  }
  const created: Beneficiary = {
    id: createId("bnf"),
    createdBy,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
    ...data,
  };
  return [created, ...list];
}

export function beneficiariesFromOperations(operations: Operation[]): Beneficiary[] {
  const map = new Map<string, Beneficiary>();
  for (const op of operations) {
    if (!op.contactName?.trim() || !op.contactPhone?.trim()) continue;
    const draft: BeneficiaryDraft = {
      contactName: op.contactName,
      contactPhone: op.contactPhone,
      address: op.address ?? "",
      lat: op.lat ?? null,
      lng: op.lng ?? null,
      cubaPhone: op.cubaPhone ?? "",
      cubaRecipientName: op.cubaRecipientName ?? "",
      cubaCardNumber: op.cubaCardNumber ?? "",
      cubaAddress: op.cubaAddress ?? "",
      provinceId: op.provinceId ?? "",
      notes: "",
    };
    const key = beneficiaryKey(draft);
    const prev = map.get(key);
    if (prev && prev.lastUsedAt >= op.createdAt) continue;
    map.set(key, {
      id: prev?.id ?? createId("bnf"),
      createdBy: op.createdBy,
      createdAt: prev?.createdAt ?? op.createdAt,
      updatedAt: op.createdAt,
      lastUsedAt: op.createdAt,
      ...draft,
    });
  }
  return [...map.values()].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}
