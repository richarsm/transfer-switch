import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "../data/StoreContext";
import { formatHavanaDateTime, havanaDateISO } from "../lib/havana";
import { mapsUrl, telUrl } from "../lib/maps";
import { formatMoney, formatRate, parseAmount } from "../lib/money";
import { matchBeneficiary } from "../lib/beneficiaries";
import { TransferWhatsAppPanel } from "../ui/TransferWhatsApp";
import { OperationEditForm } from "../ui/OperationEditForm";
import {
  cancelBlockReason,
  cancelledByLabel,
  confirmBlockReason,
  deliveryLabel,
  isCashKind,
  isDeliveryKind,
  isTerminalStatus,
  kindLabel,
  modeLabel,
  statusLabel,
  statusTone,
} from "../lib/operations";

export function OperationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const store = useStore();
  const op = store.snapshot.operations.find((o) => o.id === id);
  const [error, setError] = useState<string | null>(null);
  const [cardId, setCardId] = useState(store.snapshot.cards[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [references, setReferences] = useState<Record<string, string>>({});
  const [deliveryRef, setDeliveryRef] = useState("");

  if (!op) {
    return (
      <section className="card">
        <p>Operación no encontrada.</p>
        <Link to="/operaciones">Volver</Link>
      </section>
    );
  }

  const operationId = op.id;
  const legs = store.snapshot.legs.filter((l) => l.operationId === operationId);
  const assigned = legs
    .filter((l) => l.status !== "failed")
    .reduce((s, l) => s + l.amountCup, 0);
  const remaining = Math.max(0, op.amountCup - assigned);
  const today = havanaDateISO();
  const cards = store.snapshot.cards.filter((c) => c.active);
  const isAdmin = store.session?.role === "admin";
  const locked = isTerminalStatus(op.status);
  const canAssign =
    isAdmin &&
    !locked &&
    op.kind === "transfer" &&
    (op.mode === "transfer_then_collect" || op.collectStatus === "collected");
  const canDeliver =
    isAdmin &&
    !locked &&
    isDeliveryKind(op.kind) &&
    op.deliveryStatus !== "sent" &&
    op.deliveryStatus !== "failed" &&
    (op.mode === "transfer_then_collect" || op.collectStatus === "collected");
  const province = store.snapshot.provinces.find((p) => p.id === op.provinceId);
  const savedBeneficiary = matchBeneficiary(store.snapshot.beneficiaries ?? [], op);
  const appliedRate =
    op.kind === "cash_usd"
      ? formatRate(op.rateCashUsdPer1000Gyn || 0, "USD")
      : op.kind === "cash_cup"
        ? formatRate(op.rateCashCupPer1000Gyn || op.rateCupPer1000Gyn, "CUP")
        : formatRate(op.rateCupPer1000Gyn, "CUP");
  const confirmWhy = confirmBlockReason(op, store.snapshot.legs);
  const cancelWhy = store.session
    ? cancelBlockReason(op, store.snapshot.legs, store.session)
    : "No hay sesión.";
  const cancelledNotice =
    op.status === "cancelled"
      ? `${cancelledByLabel(op, store.snapshot.profiles)}${
          op.cancelledAt ? ` · ${formatHavanaDateTime(op.cancelledAt)}` : ""
        }`
      : null;

  function run(fn: () => void) {
    try {
      setError(null);
      fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  function addOrigin(e: FormEvent) {
    e.preventDefault();
    run(() => {
      store.addLeg(operationId, cardId, parseAmount(amount));
      setAmount("");
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{op.contactName}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {kindLabel(op.kind)} · {modeLabel(op.mode, op.kind)}
          </p>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Operador: {store.snapshot.profiles.find((p) => p.id === op.createdBy)?.displayName ?? "—"}
          </p>
        </div>
        <div className="row">
          {savedBeneficiary ? (
            <Link className="btn ghost" to={`/operaciones/nueva?beneficiary=${savedBeneficiary.id}`}>
              Repetir cliente
            </Link>
          ) : null}
          <span className={`badge ${statusTone(op.status)}`}>{statusLabel(op.status)}</span>
          <span className="badge">{appliedRate}</span>
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <div className="grid-2">
        <section className="card">
          <h2>Contacto</h2>
          <p>
            <a href={telUrl(op.contactPhone)}>{op.contactPhone}</a>
          </p>
          {op.kind === "transfer" ? (
            <p>
              Tarjeta {op.cubaCardNumber || "—"}
              <br />
              Titular {op.cubaRecipientName || "—"}
              <br />
              Móvil {op.cubaPhone ? <a href={telUrl(op.cubaPhone)}>{op.cubaPhone}</a> : "—"}
            </p>
          ) : null}
          {op.kind === "mobile_recharge" && op.cubaPhone ? (
            <p>
              Recarga a <a href={telUrl(op.cubaPhone)}>{op.cubaPhone}</a>
            </p>
          ) : null}
          {isCashKind(op.kind) ? (
            <p>
              Entrega en {province?.name ?? "provincia"}
              {op.cubaRecipientName ? ` · ${op.cubaRecipientName}` : ""}
              {op.cubaPhone ? (
                <>
                  {" "}
                  · <a href={telUrl(op.cubaPhone)}>{op.cubaPhone}</a>
                </>
              ) : null}
              {op.cubaAddress ? <div className="muted">{op.cubaAddress}</div> : null}
            </p>
          ) : null}
          <p>{op.address}</p>
          <div className="row">
            <a
              className="btn primary"
              href={mapsUrl(op.address, op.lat, op.lng)}
              target="_blank"
              rel="noreferrer"
            >
              Abrir en Google Maps
            </a>
          </div>
        </section>
        <section className="card">
          <h2>Montos y cobro</h2>
          <p>
            Recogida {formatMoney(op.amountGyn, "GYN")}
            <br />
            {op.kind === "cash_usd"
              ? `Entrega ${formatMoney(op.amountUsd, "USD")}`
              : `${op.kind === "mobile_recharge" ? "Recarga" : op.kind === "cash_cup" ? "Entrega" : "Envío"} ${formatMoney(op.amountCup, "CUP")}`}
          </p>
          <p>
            Cobro:{" "}
            <span className={`badge ${op.collectStatus === "collected" ? "ok" : "warn"}`}>
              {op.collectStatus === "collected" ? "Recogido" : "Pendiente"}
            </span>
          </p>
          {op.collectStatus === "pending" && !locked ? (
            <button
              className="btn primary"
              onClick={() => run(() => store.setCollectStatus(operationId, "collected"))}
            >
              Confirmar recogida
            </button>
          ) : null}
        </section>
      </div>

      {isAdmin && op.status !== "cancelled" ? (
        <OperationEditForm
          operation={op}
          onSave={(input) => run(() => store.updateOperation(operationId, input))}
        />
      ) : null}

      {op.kind === "transfer" && op.status !== "cancelled" ? (
        <TransferWhatsAppPanel
          isAdmin={store.session?.role === "admin"}
          cubaCardNumber={op.cubaCardNumber ?? ""}
          cubaRecipientName={op.cubaRecipientName}
          cubaPhone={op.cubaPhone}
          onSave={(input) => run(() => store.updateTransferDestination(operationId, input))}
        />
      ) : null}

      {isDeliveryKind(op.kind) ? (
        <section className="card">
          <div className="page-head">
            <h2>
              {op.kind === "mobile_recharge"
                ? "Recarga móvil"
                : op.kind === "cash_usd"
                  ? "Entrega efectivo USD"
                  : "Entrega efectivo CUP"}
            </h2>
            <span className={`badge ${op.deliveryStatus === "sent" ? "ok" : op.deliveryStatus === "failed" ? "bad" : "warn"}`}>
              {deliveryLabel(op.deliveryStatus)}
            </span>
          </div>
          {op.kind === "mobile_recharge" ? (
            <p className="muted">Número cubano: {op.cubaPhone || "—"}</p>
          ) : (
            <p className="muted">
              {province?.name ?? "Sin provincia"} ·{" "}
              {op.kind === "cash_usd"
                ? formatMoney(op.amountUsd, "USD")
                : formatMoney(op.amountCup, "CUP")}
            </p>
          )}
          {op.deliveryStatus === "sent" ? (
            <p>Referencia: {op.deliveryReference}</p>
          ) : canDeliver ? (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => store.markDeliverySent(operationId, deliveryRef));
              }}
            >
              <label className="field">
                Referencia
                <input
                  value={deliveryRef}
                  onChange={(e) => setDeliveryRef(e.target.value)}
                  placeholder="Ticket / SMS / código"
                />
              </label>
              <button className="btn primary" type="submit">
                Marcar {op.kind === "mobile_recharge" ? "recarga enviada" : "entrega hecha"}
              </button>
              {isCashKind(op.kind) ? (
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => run(() => store.failDelivery(operationId))}
                >
                  Liberar disponibilidad
                </button>
              ) : null}
            </form>
          ) : (
            <p className="muted">
              {op.status === "cancelled"
                ? cancelledNotice
                : op.status === "confirmed"
                  ? "Confirmada: ya no se edita."
                  : !isAdmin
                    ? "El administrador marca la entrega o la recarga cuando la procesa."
                    : "En este modo primero confirma la recogida. Después marcas la entrega o recarga."}
            </p>
          )}
        </section>
      ) : (
        <section className="card">
          <div className="page-head">
            <h2>Orígenes CUP (manual, varias tarjetas)</h2>
            <span className="muted">
              Asignado {formatMoney(assigned, "CUP")} · falta {formatMoney(remaining, "CUP")}
            </span>
          </div>
          {!canAssign ? (
            <p className="muted">
              {op.status === "cancelled"
                ? cancelledNotice
                : op.status === "confirmed"
                  ? "Confirmada: los orígenes ya no se editan."
                  : !isAdmin
                    ? "El administrador elige las tarjetas cuando procesa la operación."
                    : "En este modo primero confirma la recogida. Después eliges las tarjetas a mano."}
            </p>
          ) : (
            <form className="row" onSubmit={addOrigin}>
              <label className="field" style={{ minWidth: 220 }}>
                Tarjeta
                <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
                  {cards.map((c) => {
                    const room = store.cardHeadroom(c.id, today);
                    return (
                      <option key={c.id} value={c.id}>
                        {c.alias} · máx {room.maxThisMove} CUP
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="field">
                CUP de este origen
                <input value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <button className="btn primary" type="submit">
                Añadir origen
              </button>
            </form>
          )}
          <table className="table" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Tarjeta</th>
                <th>CUP</th>
                <th>Estado</th>
                <th>Referencia</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {legs.map((leg) => {
                const card = store.snapshot.cards.find((c) => c.id === leg.cardId);
                return (
                  <tr key={leg.id}>
                    <td>
                      {card?.alias}
                      <div className="muted">**** {card?.last4}</div>
                    </td>
                    <td>{formatMoney(leg.amountCup, "CUP")}</td>
                    <td>
                      <span
                        className={`badge ${
                          leg.status === "sent" ? "ok" : leg.status === "failed" ? "bad" : "warn"
                        }`}
                      >
                        {leg.status === "sent"
                          ? "Enviado"
                          : leg.status === "failed"
                            ? "Fallido"
                            : "Pendiente"}
                      </span>
                    </td>
                    <td>
                      {leg.status === "pending" && !locked ? (
                        <input
                          value={references[leg.id] ?? ""}
                          onChange={(e) =>
                            setReferences((prev) => ({ ...prev, [leg.id]: e.target.value }))
                          }
                          placeholder="Ref. bancaria"
                        />
                      ) : (
                        leg.reference
                      )}
                    </td>
                    <td>
                      {leg.status === "pending" && !locked ? (
                        <div className="row">
                          <button
                            className="btn primary"
                            onClick={() =>
                              run(() => store.markLegSent(leg.id, references[leg.id] ?? ""))
                            }
                          >
                            Marcar enviado
                          </button>
                          <button
                            className="btn danger"
                            onClick={() => run(() => store.failLeg(leg.id))}
                          >
                            Liberar cupo
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h2>Estado de la operación</h2>
        {op.status === "confirmed" ? (
          <p>Esta operación quedó confirmada. Ya no se edita.</p>
        ) : op.status === "cancelled" ? (
          <p>
            {cancelledByLabel(op, store.snapshot.profiles)}
            {op.cancelledAt ? (
              <span className="muted" style={{ display: "block", marginTop: 6 }}>
                {formatHavanaDateTime(op.cancelledAt)}
              </span>
            ) : null}
          </p>
        ) : (
          <>
            {isAdmin ? (
              <>
                <p className="muted">
                  Se confirma cuando el GYN está recogido y el envío, la recarga
                  o la entrega de efectivo están hechos, con referencia.
                </p>
                <button
                  className="btn primary"
                  disabled={Boolean(confirmWhy)}
                  onClick={() => run(() => store.confirmOperation(operationId))}
                >
                  Marcar confirmada
                </button>
                {confirmWhy ? <p className="muted">{confirmWhy}</p> : null}
              </>
            ) : (
              <p className="muted">
                {op.collectStatus === "collected" || op.status === "processing"
                  ? "Si hay un error, el administrador debe editar la operación. Ya no se puede cancelar."
                  : "Mientras el cobro no se haya recogido ni se haya enviado a Cuba, puedes cancelarla."}
              </p>
            )}
            {!cancelWhy ? (
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => {
                    const wipe = !isAdmin;
                    const ok = confirm(
                      wipe
                        ? "Esta operación se eliminará del sistema. ¿Cancelarla?"
                        : "¿Cancelar esta operación? Quedará registrada con tu usuario, fecha y hora.",
                    );
                    if (!ok) return;
                    run(() => {
                      const result = store.cancelOperation(operationId);
                      if (result === "removed") navigate("/operaciones");
                    });
                  }}
                >
                  Cancelar operación
                </button>
              </div>
            ) : isAdmin || op.createdBy === store.session?.id ? (
              <p className="muted">{cancelWhy}</p>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
