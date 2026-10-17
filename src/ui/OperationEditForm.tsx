import { useEffect, useState, type FormEvent } from "react";
import { useStore } from "../data/StoreContext";
import type { Operation } from "../domain/types";
import { formatCardNumber } from "../lib/cards";
import { parseAmount } from "../lib/money";
import { cubaPayoutDone } from "../lib/operations";
import { CashDeliveryFields } from "./CashDeliveryFields";

type Props = {
  operation: Operation;
  onSave: (input: {
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
  }) => void;
};

export function OperationEditForm({ operation, onSave }: Props) {
  const store = useStore();
  const payoutDone = cubaPayoutDone(operation, store.snapshot.legs);
  const lockedCancel =
    operation.collectStatus === "collected" || payoutDone || operation.status === "confirmed";
  const [open, setOpen] = useState(lockedCancel);
  const [contactName, setContactName] = useState(operation.contactName);
  const [contactPhone, setContactPhone] = useState(operation.contactPhone);
  const [address, setAddress] = useState(operation.address);
  const [lat, setLat] = useState(operation.lat != null ? String(operation.lat) : "");
  const [lng, setLng] = useState(operation.lng != null ? String(operation.lng) : "");
  const [cubaPhone, setCubaPhone] = useState(operation.cubaPhone);
  const [cubaRecipientName, setCubaRecipientName] = useState(operation.cubaRecipientName);
  const [cubaCardNumber, setCubaCardNumber] = useState(formatCardNumber(operation.cubaCardNumber ?? ""));
  const [cubaAddress, setCubaAddress] = useState(operation.cubaAddress);
  const [provinceId, setProvinceId] = useState(operation.provinceId);
  const [courierId, setCourierId] = useState("");
  const [cubaMapLat, setCubaMapLat] = useState("");
  const [cubaMapLng, setCubaMapLng] = useState("");
  const [gyn, setGyn] = useState(String(operation.amountGyn));
  const [payout, setPayout] = useState(
    String(operation.kind === "cash_usd" ? operation.amountUsd : operation.amountCup),
  );
  const [notes, setNotes] = useState(operation.notes);
  const [error, setError] = useState<string | null>(null);

  function matchCourier(province: string, name: string) {
    const needle = name.trim().toLowerCase();
    if (!province || !needle) return "";
    return (
      (store.snapshot.couriers ?? []).find(
        (c) => c.active && c.provinceId === province && c.name.trim().toLowerCase() === needle,
      )?.id ?? ""
    );
  }

  useEffect(() => {
    setContactName(operation.contactName);
    setContactPhone(operation.contactPhone);
    setAddress(operation.address);
    setLat(operation.lat != null ? String(operation.lat) : "");
    setLng(operation.lng != null ? String(operation.lng) : "");
    setCubaPhone(operation.cubaPhone);
    setCubaRecipientName(operation.cubaRecipientName);
    setCubaCardNumber(formatCardNumber(operation.cubaCardNumber ?? ""));
    setCubaAddress(operation.cubaAddress);
    setProvinceId(operation.provinceId);
    setCourierId(matchCourier(operation.provinceId, operation.cubaRecipientName));
    setGyn(String(operation.amountGyn));
    setPayout(String(operation.kind === "cash_usd" ? operation.amountUsd : operation.amountCup));
    setNotes(operation.notes);
    setError(null);
  }, [operation]);

  const payoutCurrency = operation.kind === "cash_usd" ? "USD" : "CUP";

  function submit(e: FormEvent) {
    e.preventDefault();
    if (
      (operation.kind === "cash_cup" || operation.kind === "cash_usd") &&
      !courierId
    ) {
      setError("Selecciona quién va a entregar el efectivo.");
      return;
    }
    const payoutN = parseAmount(payout);
    setError(null);
    onSave({
      contactName,
      contactPhone,
      address,
      lat: parseCoord(lat),
      lng: parseCoord(lng),
      cubaPhone,
      cubaRecipientName,
      cubaCardNumber,
      cubaAddress,
      provinceId,
      amountGyn: parseAmount(gyn),
      amountCup: operation.kind === "cash_usd" ? 0 : payoutN,
      amountUsd: operation.kind === "cash_usd" ? payoutN : 0,
      notes,
    });
    setOpen(false);
  }

  return (
    <section className="card">
      <div className="page-head">
        <h2>Ajustar operación</h2>
        <button type="button" className="btn ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Cerrar" : "Editar"}
        </button>
      </div>
      {lockedCancel ? (
        <p className="muted">
          No se puede cancelar: el cobro ya se recogió o ya se envió a Cuba. Corrige aquí los
          datos que estén mal.
        </p>
      ) : (
        <p className="muted">El administrador puede corregir contacto, montos y datos de Cuba.</p>
      )}
      {open ? (
        <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 12 }}>
          {error ? <div className="error">{error}</div> : null}
          <div className="grid-2">
            <label className="field">
              Contacto en Guyana
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} required />
            </label>
            <label className="field">
              Teléfono Guyana
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} required />
            </label>
          </div>
          <label className="field">
            Dirección de recogida
            <input value={address} onChange={(e) => setAddress(e.target.value)} required />
          </label>
          <div className="grid-2">
            <label className="field">
              Latitud
              <input value={lat} onChange={(e) => setLat(e.target.value)} />
            </label>
            <label className="field">
              Longitud
              <input value={lng} onChange={(e) => setLng(e.target.value)} />
            </label>
          </div>
          {operation.kind === "transfer" ? (
            <>
              <div className="grid-2">
                <label className="field">
                  Tarjeta cubana
                  <input
                    value={cubaCardNumber}
                    inputMode="numeric"
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    onChange={(e) => setCubaCardNumber(formatCardNumber(e.target.value))}
                    required
                  />
                </label>
                <label className="field">
                  Nombre del titular
                  <input value={cubaRecipientName} onChange={(e) => setCubaRecipientName(e.target.value)} required />
                </label>
              </div>
              <label className="field">
                Móvil Transfermóvil
                <input value={cubaPhone} onChange={(e) => setCubaPhone(e.target.value)} required />
              </label>
            </>
          ) : null}
          {operation.kind === "mobile_recharge" ? (
            <label className="field">
              Número cubano a recargar
              <input value={cubaPhone} onChange={(e) => setCubaPhone(e.target.value)} required />
            </label>
          ) : null}
          {operation.kind === "cash_cup" || operation.kind === "cash_usd" ? (
            <CashDeliveryFields
              kind={operation.kind}
              provinceId={provinceId}
              courierId={courierId}
              name={cubaRecipientName}
              phone={cubaPhone}
              address={cubaAddress}
              mapLat={cubaMapLat}
              mapLng={cubaMapLng}
              payoutCurrency={payoutCurrency}
              stockedEmpty={false}
              onProvince={setProvinceId}
              onCourier={setCourierId}
              onName={setCubaRecipientName}
              onPhone={setCubaPhone}
              onAddress={setCubaAddress}
              onMap={(next) => {
                setCubaMapLat(next.lat);
                setCubaMapLng(next.lng);
                if (next.address) setCubaAddress(next.address);
              }}
            />
          ) : null}
          <div className="grid-2">
            <label className="field">
              Monto GYN
              <input value={gyn} onChange={(e) => setGyn(e.target.value)} required />
            </label>
            <label className="field">
              Equivalente {payoutCurrency}
              <input value={payout} onChange={(e) => setPayout(e.target.value)} required />
            </label>
          </div>
          <label className="field">
            Notas
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="row">
            <button className="btn primary" type="submit">
              Guardar cambios
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function parseCoord(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
