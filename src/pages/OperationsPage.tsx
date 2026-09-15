import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../data/StoreContext";
import { formatHavanaDateTime, havanaDateISO } from "../lib/havana";
import { formatMoney } from "../lib/money";
import {
  awaitingAdminProcess,
  cancelledByLabel,
  isCashKind,
  kindLabel,
  modeLabel,
  operationMatchesQuery,
  operationQueue,
  statusLabel,
  statusTone,
} from "../lib/operations";
import type { Operation } from "../domain/types";

type Queue = "pending" | "done" | "cancelled";

const QUEUES: Array<{ id: Queue; label: string }> = [
  { id: "pending", label: "Por procesar" },
  { id: "done", label: "Completadas" },
  { id: "cancelled", label: "Canceladas" },
];

export function OperationsPage() {
  const { snapshot } = useStore();
  const [queue, setQueue] = useState<Queue>("pending");
  const [query, setQuery] = useState("");
  const people = new Map(snapshot.profiles.map((p) => [p.id, p.displayName]));

  const counts = useMemo(() => {
    const pending = snapshot.operations.filter(awaitingAdminProcess).length;
    const done = snapshot.operations.filter((op) => op.status === "confirmed").length;
    const cancelled = snapshot.operations.filter((op) => op.status === "cancelled").length;
    return { pending, done, cancelled };
  }, [snapshot.operations]);

  const rows = useMemo(() => {
    const filtered = snapshot.operations.filter((op) => {
      if (operationQueue(op) !== queue) return false;
      const provinceName = snapshot.provinces.find((p) => p.id === op.provinceId)?.name ?? "";
      return operationMatchesQuery(op, query, snapshot.profiles, provinceName);
    });
    return filtered.sort((a, b) => {
      if (queue === "pending") {
        if (a.collectStatus === "collected" && b.collectStatus !== "collected") return -1;
        if (b.collectStatus === "collected" && a.collectStatus !== "collected") return 1;
        return a.createdAt.localeCompare(b.createdAt);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [snapshot.operations, snapshot.profiles, snapshot.provinces, queue, query]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Operaciones</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            El asesor crea la ficha. El administrador procesa la cola y la cierra.
          </p>
        </div>
        <Link className="btn primary" to="/operaciones/nueva">
          Nueva
        </Link>
      </div>
      <section className="card" style={{ display: "grid", gap: 14 }}>
        <div className="row">
          {QUEUES.map((item) => {
            const count = counts[item.id];
            return (
              <button
                key={item.id}
                type="button"
                className={`btn ${queue === item.id ? "primary" : "ghost"}`}
                onClick={() => setQueue(item.id)}
              >
                {item.label}
                <span className={`tab-count ${queue === item.id ? "on" : ""}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <label className="field">
          Buscar
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Remitente, teléfono, asesor, tarjeta, provincia…"
          />
        </label>
        {rows.length === 0 ? (
          <p className="muted">
            {snapshot.operations.length === 0
              ? `Aún no hay operaciones. Hoy en Cuba: ${havanaDateISO()}.`
              : query.trim()
                ? "No hay coincidencias en esta cola."
                : emptyQueueText(queue)}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Contacto</th>
                  <th>Tipo</th>
                  <th>Modo</th>
                  <th>GYN</th>
                  <th>Entrega</th>
                  <th>Estado</th>
                  <th className="col-operator">Asesor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((op) => (
                  <OperationRow key={op.id} op={op} people={people} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function emptyQueueText(queue: Queue): string {
  if (queue === "pending") return "No hay operaciones por procesar.";
  if (queue === "done") return "Aún no hay operaciones completadas.";
  return "No hay cancelaciones registradas por el administrador.";
}

function OperationRow({
  op,
  people,
}: {
  op: Operation;
  people: Map<string, string>;
}) {
  const { snapshot } = useStore();
  return (
    <tr>
      <td>
        {op.contactName}
        <div className="muted op-operator">Asesor: {people.get(op.createdBy) ?? "—"}</div>
        <div className="muted">
          {op.kind === "mobile_recharge" && op.cubaPhone
            ? `Recarga ${op.cubaPhone}`
            : isCashKind(op.kind)
              ? op.cubaAddress || op.address
              : op.cubaRecipientName || op.address}
        </div>
      </td>
      <td>{kindLabel(op.kind)}</td>
      <td>{modeLabel(op.mode, op.kind)}</td>
      <td>{formatMoney(op.amountGyn, "GYN")}</td>
      <td>
        {op.kind === "cash_usd" ? formatMoney(op.amountUsd, "USD") : formatMoney(op.amountCup, "CUP")}
      </td>
      <td>
        <span className={`badge ${statusTone(op.status)}`}>{statusLabel(op.status)}</span>
        <div className="muted">
          {op.status === "cancelled"
            ? `${cancelledByLabel(op, snapshot.profiles)}${
                op.cancelledAt ? ` · ${formatHavanaDateTime(op.cancelledAt)}` : ""
              }`
            : op.collectStatus === "collected"
              ? "Recogido"
              : "Por recoger"}
        </div>
      </td>
      <td className="col-operator">{people.get(op.createdBy) ?? "—"}</td>
      <td>
        <Link to={`/operaciones/${op.id}`}>Ficha</Link>
      </td>
    </tr>
  );
}
