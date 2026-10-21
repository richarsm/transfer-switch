import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../data/StoreContext";
import type { Operation } from "../domain/types";
import {
  instructionKind,
  latestMessage,
  pickCubaOperator,
  threadStatusLabel,
  threadStatusTone,
} from "../lib/cuba-inbox";
import { sendCubaInstruction } from "../lib/cuba-send";
import { canSendCubaInstruction, cubaInstructionText, emailSubjectForCode, whatsappUrl } from "../lib/whatsapp";

export function CubaDispatchPanel({ operation, isAdmin }: { operation: Operation; isAdmin: boolean }) {
  const store = useStore();
  const kind = instructionKind(operation.kind);
  const operators = (store.snapshot.cubaOperators ?? []).filter(
    (o) => o.active && kind && o.kinds.includes(kind),
  );
  const suggested = useMemo(
    () => pickCubaOperator(store.snapshot.cubaOperators ?? [], store.snapshot.cubaThreads ?? [], operation.kind),
    [store.snapshot.cubaOperators, store.snapshot.cubaThreads, operation.kind],
  );
  const [operatorId, setOperatorId] = useState(operation.cubaOperatorId || suggested?.id || "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const operator = operators.find((o) => o.id === operatorId) ?? suggested;
  const thread = (store.snapshot.cubaThreads ?? []).find((t) => t.operationId === operation.id);
  const last = thread ? latestMessage(store.snapshot.cubaMessages ?? [], thread.id) : undefined;
  const body = cubaInstructionText({
    kind: operation.kind,
    code: operation.trackingCode,
    mobile: operation.cubaPhone,
    card: operation.cubaCardNumber,
    name: operation.cubaRecipientName,
    amountCup: operation.amountCup,
    amountUsd: operation.amountUsd,
  });
  const ready = canSendCubaInstruction({
    kind: operation.kind,
    mobile: operation.cubaPhone,
    card: operation.cubaCardNumber,
    name: operation.cubaRecipientName,
  });

  if (!kind) return null;

  async function send() {
    if (!operator) {
      setError("Registra un operador de Cuba en Operadores.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      store.assignCubaOperator(operation.id, operator.id);
      const result = await sendCubaInstruction({ ...operation, cubaOperatorId: operator.id }, operator);
      store.logCubaOutbound({
        operationId: operation.id,
        operatorId: operator.id,
        channel: result.channel,
        body: result.body,
        cloudSent: result.cloudSent,
      });
      if (result.waMeUrl) window.open(result.waMeUrl, "_blank", "noopener,noreferrer");
      setNotice(
        result.cloudSent
          ? result.emailed
            ? "Enviado por WhatsApp y correo. La bandeja espera la respuesta."
            : "Enviado por WhatsApp Business. La bandeja espera la respuesta."
          : "Se abrió WhatsApp. El envío quedó registrado en la bandeja.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="page-head">
        <h2>Envío a Cuba</h2>
        {thread ? (
          <span className={`badge ${threadStatusTone(thread.status)}`}>{threadStatusLabel(thread.status)}</span>
        ) : null}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Código <strong>{operation.trackingCode || "—"}</strong>. El operador cubano responde con este código; no hace falta seguir el chat.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <p className="muted">{notice}</p> : null}
      {operators.length === 0 ? (
        <p className="muted">
          No hay operadores de Cuba para este tipo.{" "}
          <Link to="/operadores">Regístralos en Operadores</Link>.
        </p>
      ) : (
        <label className="field">
          Operador en Cuba
          <select value={operator?.id ?? ""} onChange={(e) => setOperatorId(e.target.value)}>
            {operators.map((o) => {
              const who = store.snapshot.profiles.find((p) => p.id === o.profileId);
              return (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {who ? ` · asesor ${who.displayName}` : ""}
                  {o.phone ? ` · ${o.phone}` : ""}
                </option>
              );
            })}
          </select>
        </label>
      )}
      <pre className="wa-preview">{body}</pre>
      {operator?.email ? (
        <p className="muted">Asunto de correo: {emailSubjectForCode(operation.trackingCode)}</p>
      ) : null}
      {last ? (
        <p className="muted">
          Último mensaje ({last.direction === "in" ? "respuesta" : "enviado"}): {last.body.slice(0, 160) || "—"}
        </p>
      ) : null}
      {isAdmin ? (
        <div className="row">
          <button className="btn primary" type="button" disabled={busy || !operator || !ready} onClick={() => void send()}>
            {busy ? "Enviando…" : "Enviar al operador"}
          </button>
          {operator?.phone ? (
            <a className="btn ghost" href={whatsappUrl(body, operator.phone)} target="_blank" rel="noreferrer">
              Abrir WhatsApp
            </a>
          ) : null}
          <Link className="btn ghost" to="/bandeja">
            Ver bandeja
          </Link>
        </div>
      ) : (
        <p className="muted">Solo el administrador envía a Cuba. El código ya está en la ficha.</p>
      )}
    </section>
  );
}
