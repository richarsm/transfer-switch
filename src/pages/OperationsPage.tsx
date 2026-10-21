import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../data/StoreContext";
import { formatHavanaDateTime, havanaDateISO } from "../lib/havana";
import { formatMoney } from "../lib/money";
import { canSeeOperation } from "../lib/cuba-inbox";
import {
  awaitingAdminProcess,
  cancelledByLabel,
  kindLabel,
  modeLabel,
  roleLabel,
  operationMatchesQuery,
  operationQueue,
  statusLabel,
  statusTone,
} from "../lib/operations";
import type { Operation, Profile } from "../domain/types";

type Queue = "pending" | "done" | "cancelled";

const QUEUES: Array<{ id: Queue; label: string }> = [
  { id: "pending", label: "Por procesar" },
  { id: "done", label: "Completadas" },
  { id: "cancelled", label: "Canceladas" },
];

export function OperationsPage() {
  const { snapshot, session } = useStore();
  const [queue, setQueue] = useState<Queue>("pending");
  const [query, setQuery] = useState("");
  const people = new Map(snapshot.profiles.map((p) => [p.id, p]));
  const visibleOps = snapshot.operations.filter((op) =>
    canSeeOperation(session, op, snapshot.cubaOperators ?? []),
  );

  const counts = useMemo(() => {
    const pending = visibleOps.filter(awaitingAdminProcess).length;
    const done = visibleOps.filter((op) => op.status === "confirmed").length;
    const cancelled = visibleOps.filter((op) => op.status === "cancelled").length;
    return { pending, done, cancelled };
  }, [visibleOps]);

  const rows = useMemo(() => {
    const filtered = visibleOps.filter((op) => {
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
  }, [visibleOps, snapshot.profiles, snapshot.provinces, queue, query]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Operaciones</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            El asesor crea la ficha. El operador de Cuba procesa lo asignado. El asesor de la ficha
            o el administrador la cierran.
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
            {visibleOps.length === 0
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
  people: Map<string, Profile>;
}) {
  const { snapshot } = useStore();
  const navigate = useNavigate();
  const href = `/operaciones/${op.id}`;
  const who = people.get(op.createdBy);
  return (
    <tr className="row-link" onClick={() => navigate(href)}>
      <td>
        {who ? roleLabel(who.role) : "Asesor"}: {who?.displayName ?? "—"}
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
      <td>
        <Link to={href} onClick={(e) => e.stopPropagation()}>
          Ficha
        </Link>
      </td>
    </tr>
  );
}
