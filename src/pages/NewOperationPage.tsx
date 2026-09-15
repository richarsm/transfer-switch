import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../data/StoreContext";
import type { OperationKind, OperationMode } from "../domain/types";
import { amountToGyn, formatRate, gynToAmount, parseAmount } from "../lib/money";
import { isCashKind } from "../lib/operations";
import { BeneficiaryPicker } from "../ui/BeneficiaryPicker";

const KINDS: Array<{ id: OperationKind; label: string }> = [
  { id: "transfer", label: "Transferencia a tarjeta" },
  { id: "mobile_recharge", label: "Recarga móvil" },
  { id: "cash_cup", label: "Efectivo CUP" },
  { id: "cash_usd", label: "Efectivo USD" },
];

export function NewOperationPage() {
  const store = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const opening = store.currentOpening;
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<OperationKind>("transfer");
  const [mode, setMode] = useState<OperationMode>("collect_then_transfer");
  const [gyn, setGyn] = useState("");
  const [payout, setPayout] = useState("");
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [saveBeneficiary, setSaveBeneficiary] = useState(true);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [cubaPhone, setCubaPhone] = useState("");
  const [cubaRecipientName, setCubaRecipientName] = useState("");
  const [cubaCardNumber, setCubaCardNumber] = useState("");
  const [cubaAddress, setCubaAddress] = useState("");
  const [provinceId, setProvinceId] = useState("");

  const tariff = tariffFor(kind, opening);
  const payoutCurrency = kind === "cash_usd" ? "USD" : "CUP";
  const appliedParam = useRef("");
  const beneficiaries = store.snapshot.beneficiaries;

  function applyBeneficiary(id: string) {
    const b = beneficiaries.find((item) => item.id === id);
    if (!b) return;
    setBeneficiaryId(b.id);
    setContactName(b.contactName);
    setContactPhone(b.contactPhone);
    setAddress(b.address);
    setLat(b.lat != null ? String(b.lat) : "");
    setLng(b.lng != null ? String(b.lng) : "");
    setCubaPhone(b.cubaPhone);
    setCubaRecipientName(b.cubaRecipientName);
    setCubaCardNumber(b.cubaCardNumber ?? "");
    setCubaAddress(b.cubaAddress);
    setProvinceId(b.provinceId);
  }

  useEffect(() => {
    const id = params.get("beneficiary") ?? "";
    if (!id || appliedParam.current === id) return;
    const b = beneficiaries.find((item) => item.id === id);
    if (!b) return;
    appliedParam.current = id;
    applyBeneficiary(id);
  }, [params, beneficiaries]);

  function onGyn(raw: string) {
    setGyn(raw);
    if (!tariff) return;
    const n = parseAmount(raw);
    setPayout(n > 0 ? String(gynToAmount(n, tariff)) : "");
  }

  function onPayout(raw: string) {
    setPayout(raw);
    if (!tariff) return;
    const n = parseAmount(raw);
    setGyn(n > 0 ? String(amountToGyn(n, tariff)) : "");
  }

  function changeKind(next: OperationKind) {
    setKind(next);
    setGyn("");
    setPayout("");
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payoutN = parseAmount(payout);
    try {
      const id = store.createOperation({
        kind,
        mode,
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
        amountCup: kind === "cash_usd" ? 0 : payoutN,
        amountUsd: kind === "cash_usd" ? payoutN : 0,
        notes: String(form.get("notes") ?? ""),
        saveBeneficiary,
        beneficiaryId,
      });
      navigate(`/operaciones/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear.");
    }
  }

  if (!opening) {
    return (
      <section className="card">
        <h1>Nueva operación</h1>
        <p>No hay periodo abierto con el reloj de Cuba. El administrador debe hacer la apertura.</p>
      </section>
    );
  }

  const stocked = store.snapshot.provinces.filter((p) => {
    if (kind === "cash_cup") return store.provinceHeadroom(p.id).cashCupLeft > 0;
    if (kind === "cash_usd") return store.provinceHeadroom(p.id).cashUsdLeft > 0;
    return false;
  });
  const selectedProvince = store.snapshot.provinces.find((p) => p.id === provinceId);
  const provinces =
    selectedProvince && !stocked.some((p) => p.id === selectedProvince.id)
      ? [selectedProvince, ...stocked]
      : stocked;

  return (
    <form className="card" onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      <div className="page-head">
        <h1>Nueva operación</h1>
        <span className="badge">{formatRate(tariff, payoutCurrency)}</span>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <div className="row">
        {KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`btn ${kind === item.id ? "primary" : "ghost"}`}
            onClick={() => changeKind(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="row">
        <button
          type="button"
          className={`btn ${mode === "collect_then_transfer" ? "primary" : "ghost"}`}
          onClick={() => setMode("collect_then_transfer")}
        >
          {kind === "mobile_recharge"
            ? "Recoger, luego recargar"
            : isCashKind(kind)
              ? "Recoger, luego entregar"
              : "Recoger, luego enviar"}
        </button>
        <button
          type="button"
          className={`btn ${mode === "transfer_then_collect" ? "primary" : "ghost"}`}
          onClick={() => setMode("transfer_then_collect")}
        >
          {kind === "mobile_recharge"
            ? "Recargar, luego recoger"
            : isCashKind(kind)
              ? "Entregar, luego recoger"
              : "Enviar, luego recoger"}
        </button>
      </div>
      <BeneficiaryPicker
        beneficiaries={beneficiaries}
        selectedId={beneficiaryId}
        provinceName={(id) => store.snapshot.provinces.find((p) => p.id === id)?.name ?? ""}
        onSelect={(b) => applyBeneficiary(b.id)}
        onClear={() => setBeneficiaryId("")}
      />
      <p className="muted" style={{ margin: 0 }}>
        <Link to="/beneficiarios">Ver lista de beneficiarios</Link>
      </p>
      <div className="grid-2">
        <label className="field">
          Contacto en Guyana
          <input name="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} required />
        </label>
        <label className="field">
          Teléfono Guyana
          <input name="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} required />
        </label>
      </div>
      {kind === "transfer" ? (
        <>
          <div className="grid-2">
            <label className="field">
              Tarjeta cubana
              <input
                name="cubaCardNumber"
                required
                inputMode="numeric"
                placeholder="XXXX XXXX XXXX XXXX"
                value={cubaCardNumber}
                onChange={(e) => setCubaCardNumber(e.target.value)}
              />
            </label>
            <label className="field">
              Nombre del titular
              <input
                name="cubaRecipientName"
                required
                placeholder="Como aparece en la tarjeta"
                value={cubaRecipientName}
                onChange={(e) => setCubaRecipientName(e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            Móvil Transfermóvil
            <input
              name="cubaPhone"
              required
              placeholder="+53 5 ..."
              value={cubaPhone}
              onChange={(e) => setCubaPhone(e.target.value)}
            />
          </label>
        </>
      ) : null}
      {kind === "mobile_recharge" ? (
        <label className="field">
          Número cubano a recargar
          <input
            name="cubaPhone"
            required
            placeholder="+53 5 ..."
            value={cubaPhone}
            onChange={(e) => setCubaPhone(e.target.value)}
          />
        </label>
      ) : null}
      {isCashKind(kind) ? (
        <>
          <div className="grid-2">
            <label className="field">
              Provincia de entrega
              <select name="provinceId" required value={provinceId} onChange={(e) => setProvinceId(e.target.value)}>
                <option value="">Selecciona provincia</option>
                {provinces.map((p) => {
                  const room = store.provinceHeadroom(p.id);
                  const left = kind === "cash_usd" ? room.cashUsdLeft : room.cashCupLeft;
                  const unit = kind === "cash_usd" ? "USD" : "CUP";
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} · {left} {unit}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="field">
              Quien recibe en Cuba
              <input
                name="cubaRecipientName"
                placeholder="Nombre del beneficiario"
                value={cubaRecipientName}
                onChange={(e) => setCubaRecipientName(e.target.value)}
              />
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              Teléfono Cuba
              <input
                name="cubaPhone"
                placeholder="+53 ..."
                value={cubaPhone}
                onChange={(e) => setCubaPhone(e.target.value)}
              />
            </label>
            <label className="field">
              Dirección de entrega en Cuba
              <input
                name="cubaAddress"
                placeholder="Barrio, calle, punto"
                value={cubaAddress}
                onChange={(e) => setCubaAddress(e.target.value)}
              />
            </label>
          </div>
          {stocked.length === 0 ? (
            <p className="muted">
              No hay provincias con disponibilidad de {payoutCurrency}. Cárgala en Provincias.
            </p>
          ) : null}
        </>
      ) : null}
      <label className="field">
        Dirección de recogida en Guyana (Google Maps)
        <input
          name="address"
          required
          placeholder="Calle, ciudad, punto de referencia"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </label>
      <div className="grid-2">
        <label className="field">
          Latitud (opcional)
          <input name="lat" value={lat} onChange={(e) => setLat(e.target.value)} />
        </label>
        <label className="field">
          Longitud (opcional)
          <input name="lng" value={lng} onChange={(e) => setLng(e.target.value)} />
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          Monto GYN
          <input value={gyn} onChange={(e) => onGyn(e.target.value)} required />
        </label>
        <label className="field">
          Equivalente {payoutCurrency}
          <input value={payout} onChange={(e) => onPayout(e.target.value)} required />
        </label>
      </div>
      <label className="field">
        Notas
        <textarea name="notes" />
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={saveBeneficiary}
          onChange={(e) => setSaveBeneficiary(e.target.checked)}
        />
        {beneficiaryId
          ? "Actualizar este beneficiario con los datos de la operación"
          : "Guardar cliente y beneficiario para la próxima vez"}
      </label>
      <div className="row">
        <button className="btn primary" type="submit" disabled={isCashKind(kind) && stocked.length === 0}>
          Crear operación
        </button>
      </div>
    </form>
  );
}

function tariffFor(
  kind: OperationKind,
  opening: { cupPer1000Gyn: number; cashCupPer1000Gyn: number; cashUsdPer1000Gyn: number } | null,
): number {
  if (!opening) return 0;
  if (kind === "cash_cup") return opening.cashCupPer1000Gyn;
  if (kind === "cash_usd") return opening.cashUsdPer1000Gyn;
  return opening.cupPer1000Gyn;
}

function parseCoord(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
