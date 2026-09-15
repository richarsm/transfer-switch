import type { Opening, Profile, Province, Snapshot } from "../domain/types";
import { havanaDateISO } from "../lib/havana";
import { CUBA_PROVINCES } from "../lib/provinces";

const today = havanaDateISO();

const admin: Profile = {
  id: "usr_admin",
  email: "admin@transferswitch.local",
  displayName: "Administrador",
  phone: "+592 600 0000",
  role: "admin",
  active: true,
};

const operator: Profile = {
  id: "usr_op1",
  email: "asesor@transferswitch.local",
  displayName: "Asesor Georgetown",
  phone: "+592 650 1122",
  role: "operator",
  active: true,
};

const SAMPLE_STOCK: Record<string, { cup: number; usd: number }> = {
  HAB: { cup: 800000, usd: 2500 },
  SCU: { cup: 220000, usd: 800 },
  CMG: { cup: 150000, usd: 500 },
  HOL: { cup: 120000, usd: 400 },
};

export function seedProvinces(): Province[] {
  return CUBA_PROVINCES.map((p) => {
    const stock = SAMPLE_STOCK[p.code] ?? { cup: 0, usd: 0 };
    return {
      id: `prv_${p.code.toLowerCase()}`,
      code: p.code,
      name: p.name,
      cashCup: stock.cup,
      cashUsd: stock.usd,
      notes: "",
    };
  });
}

const opening: Opening = {
  id: "opn_today",
  kind: "day",
  startsOn: today,
  endsOn: today,
  cupPer1000Gyn: 165000,
  cashCupPer1000Gyn: 158000,
  cashUsdPer1000Gyn: 4.7,
  notes: "Tasa de arranque. Ajústala a la cotización real del día.",
  status: "open",
  openedBy: admin.id,
  openedAt: new Date().toISOString(),
  closedAt: null,
};

export function seedSnapshot(): Snapshot {
  return {
    profiles: [admin, operator],
    sessionUserId: null,
    openings: [opening],
    cards: [
      {
        id: "crd_bandec",
        alias: "BANDEC Principal",
        bank: "BANDEC",
        last4: "4412",
        holder: "Casa Georgetown",
        balanceCup: 450000,
        dailyLimit: 80000,
        monthlyLimit: 1200000,
        active: true,
        notes: "",
      },
      {
        id: "crd_bpa",
        alias: "BPA Operativa",
        bank: "BPA",
        last4: "7781",
        holder: "Casa Georgetown",
        balanceCup: 210000,
        dailyLimit: 50000,
        monthlyLimit: 800000,
        active: true,
        notes: "",
      },
      {
        id: "crd_metro",
        alias: "Metropolitano Reserva",
        bank: "Metropolitano",
        last4: "0193",
        holder: "Casa Georgetown",
        balanceCup: 980000,
        dailyLimit: 120000,
        monthlyLimit: 1500000,
        active: true,
        notes: "",
      },
    ],
    operations: [],
    legs: [],
    movements: [],
    travels: [
      {
        id: "trv_geo_hav",
        kind: "flight",
        title: "Georgetown — La Habana",
        origin: "GEO",
        destination: "HAV",
        priceGyn: 185000,
        priceCup: 0,
        priceUsdt: 420,
        seats: 4,
        status: "published",
        notes: "Salida semanal. Equipaje 23 kg.",
      },
    ],
    itineraries: [
      {
        id: "leg_geo",
        offerId: "trv_geo_hav",
        order: 1,
        origin: "Cheddi Jagan (GEO)",
        destination: "Panamá (PTY)",
        departsAt: `${today}T08:40`,
        vehicle: "CM 307",
        notes: "Conexión 3 h",
      },
      {
        id: "leg_hav",
        offerId: "trv_geo_hav",
        order: 2,
        origin: "Panamá (PTY)",
        destination: "La Habana (HAV)",
        departsAt: `${today}T14:10`,
        vehicle: "CM 120",
        notes: "",
      },
    ],
    provinces: seedProvinces(),
    provinceMovements: [],
    beneficiaries: [],
  };
}
