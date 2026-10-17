import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../data/StoreContext";
import type { OperationKind, OperationMode } from "../domain/types";
import { formatCardNumber } from "../lib/cards";
import { amountToGyn, formatMoney, formatRate, gynToAmount, parseAmount } from "../lib/money";
import { isCashKind } from "../lib/operations";
import { BeneficiaryPicker } from "../ui/BeneficiaryPicker";
import { CashDeliveryFields } from "../ui/CashDeliveryFields";
import { MapPicker } from "../ui/MapPicker";

const SAMPLE_GYN = 5000;
const SAMPLE_USD = 100;

const KIND_CARDS: Array<{
  id: OperationKind;
  tone: string;
  title: string;
  blurb: string;
}> = [
  {
    id: "transfer",
    tone: "transfer",
    title: "Transferencia en CUP",
    blurb: "Directo a tarjetas y cuentas bancarias en Cuba",
  },
  {
    id: "mobile_recharge",
    tone: "recharge",
    title: "Recarga móvil",
    blurb: "Saldo al número cubano (Transfermóvil / Cubacel)",
  },
  {
    id: "cash_cup",
    tone: "cash-cup",
    title: "Efectivo en CUP",
    blurb: "Entrega en mano en toda Cuba",
  },
  {
    id: "cash_usd",
    tone: "cash-usd",
    title: "USD en efectivo",
    blurb: "Entregas en todas las provincias",
  },
];

export function NewOperationPage() {
  const store = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const opening = store.currentOpening;
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<OperationKind | null>(null);
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
  const [courierId, setCourierId] = useState("");
  const [cubaMapLat, setCubaMapLat] = useState("");
  const [cubaMapLng, setCubaMapLng] = useState("");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState(1);

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
    setCubaCardNumber(formatCardNumber(b.cubaCardNumber ?? ""));
    setCubaAddress(b.cubaAddress);
    setProvinceId(b.provinceId);
    setCourierId("");
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

  function selectKind(next: OperationKind) {
    if (kind) return;
    setKind(next);
    setError(null);
    setStep(1);
  }

  function validateStep(n: number): string | null {
    if (!kind) return "Selecciona el tipo de operación.";
    if (n === 1 && !cubaRecipientName.trim()) {
      return "Indica el nombre del beneficiario en Cuba.";
    }
    if (n === 2 && (!contactName.trim() || !contactPhone.trim() || !address.trim())) {
      return "Contacto, teléfono y dirección en Guyana son obligatorios.";
    }
    if (n === 3) {
      if (kind === "transfer" && (!cubaCardNumber.trim() || !cubaPhone.trim())) {
        return "La transferencia necesita tarjeta y móvil en Cuba.";
      }
      if (kind === "mobile_recharge" && !cubaPhone.trim()) {
        return "Indica el número cubano a recargar.";
      }
      if (isCashKind(kind) && !provinceId) {
        return "Selecciona la provincia de entrega.";
      }
      if (isCashKind(kind) && !courierId) {
        return "Selecciona quién va a entregar el efectivo.";
      }
    }
    if (n === 4) {
      if (parseAmount(gyn) <= 0) return "El monto GYN debe ser mayor que cero.";
      if (parseAmount(payout) <= 0) return `El equivalente ${payoutCurrency} debe ser mayor que cero.`;
    }
    return null;
  }

  function goTo(next: number) {
    if (next > step) {
      for (let i = step; i < next; i++) {
        const message = validateStep(i);
        if (message) {
          setError(message);
          return;
        }
      }
    }
    setError(null);
    setStep(next);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!kind) {
      setError("Selecciona el tipo de operación.");
      return;
    }
    const message = [1, 2, 3, 4].map(validateStep).find(Boolean);
    if (message) {
      setError(message);
      return;
    }
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
        notes,
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

  const cupProvinces = store.snapshot.provinces.filter(
    (p) => store.provinceHeadroom(p.id).cashCupLeft > 0,
  ).length;
  const usdProvinces = store.snapshot.provinces.filter(
    (p) => store.provinceHeadroom(p.id).cashUsdLeft > 0,
  ).length;
  const selectedKind = KIND_CARDS.find((item) => item.id === kind);

  return (
    <>
    <div className="page-head">
      <div>
        <h1>Nueva operación</h1>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          {kind
            ? "Tipo fijado para esta operación. Las tasas son las de la apertura actual."
            : "Elige el tipo. Las tasas son las de la apertura actual."}
        </p>
      </div>
      <div className="row">
        {kind ? <span className="badge">{formatRate(tariff, payoutCurrency)}</span> : null}
        <button type="button" className="btn ghost" onClick={() => navigate("/operaciones")}>
          Cancelar
        </button>
      </div>
    </div>
    <div className="kind-grid">
      {KIND_CARDS.map((item) => {
        const rate = tariffFor(item.id, opening);
        const sample =
          item.id === "cash_usd"
            ? `${formatMoney(amountToGyn(SAMPLE_USD, rate), "GYN")} = ${formatMoney(SAMPLE_USD, "USD")}`
            : `${formatMoney(SAMPLE_GYN, "GYN")} = ${formatMoney(gynToAmount(SAMPLE_GYN, rate), "CUP")}`;
        const note =
          item.id === "cash_cup"
            ? cupProvinces > 0
              ? `${cupProvinces} provincias con CUP`
              : "Según provincia"
            : item.id === "cash_usd"
              ? usdProvinces > 0
                ? `${usdProvinces} provincias con USD`
                : "Según disponibilidad"
              : null;
        const locked = Boolean(kind) && kind !== item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`kind-card ${item.tone} ${kind === item.id ? "selected" : ""}`}
            aria-pressed={kind === item.id}
            disabled={locked}
            onClick={() => selectKind(item.id)}
          >
            <span className="kind-chevron" aria-hidden>
              ›
            </span>
            <KindGlyph kind={item.id} />
            <h3>{item.title}</h3>
            <p>{item.blurb}</p>
            <span className="kind-rate">
              <BoltIcon />
              {sample}
            </span>
            {note ? <span className="kind-note">({note})</span> : null}
          </button>
        );
      })}
    </div>
    {kind ? (
    <form className="card stepper-card" onSubmit={onSubmit}>
      <h2>{selectedKind?.title}</h2>
      <div className="stepper" role="tablist" aria-label="Pasos de la operación">
        {stepMeta(kind).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={step === item.id}
            aria-current={step === item.id ? "step" : undefined}
            className={step === item.id ? "active" : step > item.id ? "done" : ""}
            onClick={() => goTo(item.id)}
          >
            <em>{step > item.id ? <StepCheckIcon /> : item.id}</em>
            <strong>{item.title}</strong>
            <span>{item.hint}</span>
          </button>
        ))}
      </div>
      {error ? <div className="error">{error}</div> : null}

      {step === 1 ? (
        <div className="step-body">
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
              Nombre del beneficiario en Cuba
              <input
                value={cubaRecipientName}
                placeholder="Como aparece en documentos o tarjeta"
                onChange={(e) => setCubaRecipientName(e.target.value)}
              />
            </label>
            <label className="field">
              Teléfono Cuba
              <input
                value={cubaPhone}
                placeholder="+53 5 ..."
                onChange={(e) => setCubaPhone(e.target.value)}
              />
            </label>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="step-body">
          <div className="grid-2">
            <label className="field">
              Contacto en Guyana
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </label>
            <label className="field">
              Teléfono Guyana
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </label>
          </div>
          <label className="field">
            Dirección de recogida
            <input
              placeholder="Calle, ciudad, punto de referencia"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <MapPicker
            address={address}
            lat={lat}
            lng={lng}
            onChange={(next) => {
              setLat(next.lat);
              setLng(next.lng);
              if (next.address) setAddress(next.address);
            }}
          />
        </div>
      ) : null}

      {step === 3 && kind === "transfer" ? (
        <div className="step-body">
          <p className="muted" style={{ margin: 0 }}>
            Tarjeta cubana por la que se enviará el dinero.
          </p>
          <label className="field">
            Número de tarjeta
            <input
              inputMode="numeric"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              value={cubaCardNumber}
              onChange={(e) => setCubaCardNumber(formatCardNumber(e.target.value))}
            />
          </label>
          <label className="field">
            Móvil Transfermóvil
            <input
              placeholder="+53 5 ..."
              value={cubaPhone}
              onChange={(e) => setCubaPhone(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      {step === 3 && kind === "mobile_recharge" ? (
        <div className="step-body">
          <label className="field">
            Número cubano a recargar
            <input
              placeholder="+53 5 ..."
              value={cubaPhone}
              onChange={(e) => setCubaPhone(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      {step === 3 && (kind === "cash_cup" || kind === "cash_usd") ? (
        <CashDeliveryFields
          kind={kind}
          provinceId={provinceId}
          courierId={courierId}
          name={cubaRecipientName}
          phone={cubaPhone}
          address={cubaAddress}
          mapLat={cubaMapLat}
          mapLng={cubaMapLng}
          payoutCurrency={payoutCurrency}
          stockedEmpty={stocked.length === 0}
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

      {step === 4 ? (
        <div className="step-body">
          <div className="step-recap">
            <span>{cubaRecipientName || "Beneficiario"}</span>
            <span>{contactName || "Contacto Guyana"}</span>
            {kind === "transfer" && cubaCardNumber ? <span>**** {cubaCardNumber.replace(/\D/g, "").slice(-4)}</span> : null}
            {kind === "mobile_recharge" && cubaPhone ? <span>{cubaPhone}</span> : null}
            {isCashKind(kind) && selectedProvince ? <span>{selectedProvince.name}</span> : null}
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
          <div className="grid-2">
            <label className="field">
              Monto GYN
              <input value={gyn} onChange={(e) => onGyn(e.target.value)} />
            </label>
            <label className="field">
              Equivalente {payoutCurrency}
              <input value={payout} onChange={(e) => onPayout(e.target.value)} />
            </label>
          </div>
          <label className="field">
            Notas adicionales
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
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
        </div>
      ) : null}

      <div className="step-nav">
        <button type="button" className="btn ghost" onClick={() => navigate("/operaciones")}>
          Cancelar
        </button>
        <div className="row">
          {step > 1 ? (
            <button type="button" className="btn ghost" onClick={() => goTo(step - 1)}>
              Atrás
            </button>
          ) : null}
          {step < 4 ? (
            <button type="button" className="btn primary" onClick={() => goTo(step + 1)}>
              Continuar
            </button>
          ) : (
            <button className="btn primary" type="submit" disabled={isCashKind(kind) && stocked.length === 0}>
              Crear operación
            </button>
          )}
        </div>
      </div>
    </form>
    ) : null}
    </>
  );
}

function KindGlyph({ kind }: { kind: OperationKind }) {
  if (kind === "mobile_recharge") {
    return (
      <svg className="kind-icon" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="16" y="6" width="16" height="36" rx="3" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="24" cy="36" r="1.6" fill="currentColor" />
        <path d="M20 16h8M20 21h8M20 26h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "cash_cup") {
    return (
      <svg className="kind-icon" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="8" y="14" width="32" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="24" cy="24" r="5.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M24 20.5v7M21.8 22.2c.4-.7 1.2-1.1 2.2-1.1 1.3 0 2.2.7 2.2 1.6s-.8 1.4-2.2 1.7c1.4.2 2.4.8 2.4 1.9 0 1.1-1.1 1.8-2.5 1.8-1.1 0-2-.4-2.4-1.2" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "cash_usd") {
    return (
      <svg className="kind-icon" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="6" y="16" width="28" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <rect x="14" y="10" width="28" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <circle cx="28" cy="19" r="4.4" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg className="kind-icon" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M10 34V18l14-8 14 8v16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M18 34V24h12v10M10 34h28" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="21" y="27" width="6" height="7" fill="currentColor" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M9 1 3 9h5l-1 6 6-8H8l1-6Z" fill="currentColor" />
    </svg>
  );
}

function StepCheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 8.5 6.5 12 13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function stepMeta(kind: OperationKind): Array<{ id: number; title: string; hint: string }> {
  const third =
    kind === "transfer"
      ? { title: "Tarjeta", hint: "Envío desde Cuba" }
      : kind === "mobile_recharge"
        ? { title: "Recarga", hint: "Número cubano" }
        : { title: "Efectivo", hint: "Quién lo lleva" };
  return [
    { id: 1, title: "Beneficiario", hint: "Quién recibe en Cuba" },
    { id: 2, title: "Guyana", hint: "Contacto y mapa" },
    { id: 3, ...third },
    { id: 4, title: "Cierre", hint: "Montos y notas" },
  ];
}

function tariffFor(
  kind: OperationKind | null,
  opening: { cupPer1000Gyn: number; cashCupPer1000Gyn: number; cashUsdPer1000Gyn: number } | null,
): number {
  if (!opening || !kind) return 0;
  if (kind === "cash_cup") return opening.cashCupPer1000Gyn;
  if (kind === "cash_usd") return opening.cashUsdPer1000Gyn;
  return opening.cupPer1000Gyn;
}

function parseCoord(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
